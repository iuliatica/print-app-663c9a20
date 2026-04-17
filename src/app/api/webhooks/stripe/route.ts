import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSupabase } from "@/lib/supabase-server";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

type OrderStatus = "paid" | "failed" | "abandoned" | "canceled";

/**
 * Actualizează statusul comenzii în Supabase.
 * Caută ordinul după `order_id` din metadata sau, ca fallback, după `stripe_session_id`.
 */
async function updateOrderStatus(params: {
  orderId?: string | null;
  sessionId?: string | null;
  status: OrderStatus;
  context: string;
}) {
  const { orderId, sessionId, status, context } = params;
  const supabase = getServerSupabase();

  const query = supabase.from("orders").update({ status });
  let result;
  if (orderId) {
    result = await query.eq("id", orderId);
  } else if (sessionId) {
    result = await query.eq("stripe_session_id", sessionId);
  } else {
    console.warn(`[stripe-webhook] ${context}: lipsesc atât order_id cât și session_id`);
    return { matched: false, error: null as Error | null };
  }

  if (result.error) {
    console.error(`[stripe-webhook] ${context}: eroare DB`, result.error);
    return { matched: false, error: result.error };
  }

  console.log(
    `[stripe-webhook] ${context}: comanda marcată "${status}" (order_id=${orderId ?? "-"}, session=${sessionId ?? "-"})`
  );
  return { matched: true, error: null as Error | null };
}

/**
 * Pentru evenimentele payment_intent.* nu avem direct order_id în metadata
 * (Stripe nu propagă metadata-ul Checkout Session pe PaymentIntent).
 * Recuperăm sesiunea de Checkout asociată acestui PaymentIntent ca să aflăm order_id.
 */
async function resolveOrderFromPaymentIntent(
  paymentIntentId: string
): Promise<{ orderId?: string; sessionId?: string }> {
  try {
    const stripe = getStripe();
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1,
    });
    const session = sessions.data[0];
    if (!session) return {};
    return {
      orderId: session.metadata?.order_id ?? undefined,
      sessionId: session.id,
    };
  } catch (err) {
    console.error("[stripe-webhook] Nu am putut găsi Checkout Session pentru PI:", paymentIntentId, err);
    return {};
  }
}

/**
 * POST /api/webhooks/stripe
 *
 * Evenimente gestionate:
 *  - checkout.session.completed   → status: paid
 *  - payment_intent.payment_failed → status: failed
 *  - checkout.session.expired     → status: abandoned
 *  - payment_intent.canceled      → status: canceled
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.order_id ?? null;

        // Update status + payment intent + session id (păstrăm comportamentul anterior)
        const supabase = getServerSupabase();
        const updatePayload: Record<string, unknown> = {
          status: "paid",
          stripe_session_id: session.id,
        };
        const updateQuery = supabase.from("orders").update(updatePayload);
        const result = orderId
          ? await updateQuery.eq("id", orderId)
          : await updateQuery.eq("stripe_session_id", session.id);

        if (result.error) {
          console.error("[stripe-webhook] checkout.session.completed: DB error", result.error);
          return NextResponse.json({ error: "DB update failed" }, { status: 500 });
        }
        console.log(
          `[stripe-webhook] checkout.session.completed: order ${orderId ?? "(via session)"} marcat ca PAID (${session.id})`
        );
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.order_id ?? null;
        await updateOrderStatus({
          orderId,
          sessionId: session.id,
          status: "abandoned",
          context: "checkout.session.expired",
        });
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.order_id ?? null;
        const resolved = orderId ? { orderId, sessionId: undefined } : await resolveOrderFromPaymentIntent(pi.id);
        await updateOrderStatus({
          orderId: resolved.orderId ?? null,
          sessionId: resolved.sessionId ?? null,
          status: "failed",
          context: "payment_intent.payment_failed",
        });
        break;
      }

      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.order_id ?? null;
        const resolved = orderId ? { orderId, sessionId: undefined } : await resolveOrderFromPaymentIntent(pi.id);
        await updateOrderStatus({
          orderId: resolved.orderId ?? null,
          sessionId: resolved.sessionId ?? null,
          status: "canceled",
          context: "payment_intent.canceled",
        });
        break;
      }

      default:
        console.log(`[stripe-webhook] Eveniment ignorat: ${event.type}`);
    }
  } catch (err) {
    console.error("[stripe-webhook] Eroare la procesarea evenimentului:", event.type, err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
