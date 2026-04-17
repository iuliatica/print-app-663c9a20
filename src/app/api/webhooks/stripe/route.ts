import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSupabase } from "@/lib/supabase-server";
import { sendLifecycleEmail, type LifecycleKind } from "@/lib/lifecycle-emails";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

type OrderStatus = "paid" | "failed" | "abandoned" | "canceled";

type OrderRecipient = {
  customer_email: string | null;
  customer_name: string | null;
  total_price: number | null;
};

/** Citește emailul + numele clientului pentru a putea trimite emailul de lifecycle. */
async function fetchOrderRecipient(params: {
  orderId?: string | null;
  sessionId?: string | null;
}): Promise<OrderRecipient | null> {
  const { orderId, sessionId } = params;
  const supabase = getServerSupabase();
  const sel = "customer_email, customer_name, total_price";
  const q = supabase.from("orders").select(sel).limit(1);
  let res;
  if (orderId) res = await q.eq("id", orderId).maybeSingle();
  else if (sessionId) res = await q.eq("stripe_session_id", sessionId).maybeSingle();
  else return null;

  if (res.error) {
    console.error("[stripe-webhook] fetchOrderRecipient eroare:", res.error);
    return null;
  }
  return (res.data as OrderRecipient) ?? null;
}

/** Construiește o nouă sesiune Checkout pentru retry. */
async function buildRetryCheckoutUrl(orderId: string | null | undefined): Promise<string | undefined> {
  if (!orderId) return undefined;
  try {
    const supabase = getServerSupabase();
    const { data: order } = await supabase
      .from("orders")
      .select("id, total_price, customer_email, status")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || order.status === "paid") return undefined;
    const totalPrice = Number(order.total_price);
    if (!totalPrice || totalPrice <= 0) return undefined;

    const stripe = getStripe();
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://printica.ro";
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "ron",
            product_data: {
              name: "Printare documente (reluare plată)",
            },
            unit_amount: Math.round(totalPrice * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      metadata: { order_id: order.id, retry: "true" },
      ...(order.customer_email ? { customer_email: String(order.customer_email).trim().toLowerCase() } : {}),
    });
    return session.url ?? undefined;
  } catch (err) {
    console.error("[stripe-webhook] Nu am putut crea sesiunea de retry:", err);
    return undefined;
  }
}

/** Actualizează statusul comenzii în DB. */
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
  if (orderId) result = await query.eq("id", orderId);
  else if (sessionId) result = await query.eq("stripe_session_id", sessionId);
  else {
    console.warn(`[stripe-webhook] ${context}: lipsesc atât order_id cât și session_id`);
    return { matched: false };
  }

  if (result.error) {
    console.error(`[stripe-webhook] ${context}: eroare DB`, result.error);
    return { matched: false };
  }
  console.log(
    `[stripe-webhook] ${context}: comanda marcată "${status}" (order_id=${orderId ?? "-"}, session=${sessionId ?? "-"})`
  );
  return { matched: true };
}

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

async function notifyClient(params: {
  kind: LifecycleKind;
  orderId?: string | null;
  sessionId?: string | null;
  retryUrl?: string;
}) {
  const recipient = await fetchOrderRecipient({ orderId: params.orderId, sessionId: params.sessionId });
  if (!recipient?.customer_email) {
    console.warn(`[stripe-webhook] notifyClient(${params.kind}): nu am email destinatar`);
    return;
  }
  await sendLifecycleEmail({
    to: recipient.customer_email,
    customerName: recipient.customer_name,
    kind: params.kind,
    retryUrl: params.retryUrl,
  });
}

/**
 * POST /api/webhooks/stripe
 *  - checkout.session.completed   → paid     + email succes
 *  - payment_intent.payment_failed → failed  + email cu retry URL
 *  - checkout.session.expired     → abandoned + email reluare comandă
 *  - payment_intent.canceled      → canceled  + email confirmare anulare
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
          `[stripe-webhook] checkout.session.completed: order ${orderId ?? "(via session)"} PAID (${session.id})`
        );

        await notifyClient({ kind: "paid", orderId, sessionId: session.id });
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
        const retryUrl = await buildRetryCheckoutUrl(orderId);
        await notifyClient({ kind: "expired", orderId, sessionId: session.id, retryUrl });
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
        const retryUrl = await buildRetryCheckoutUrl(resolved.orderId ?? null);
        await notifyClient({
          kind: "failed",
          orderId: resolved.orderId ?? null,
          sessionId: resolved.sessionId ?? null,
          retryUrl,
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
        await notifyClient({
          kind: "canceled",
          orderId: resolved.orderId ?? null,
          sessionId: resolved.sessionId ?? null,
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
