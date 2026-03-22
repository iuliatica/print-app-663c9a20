import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSupabase } from "@/lib/supabase-server";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

/**
 * POST /api/webhooks/stripe
 * Webhook Stripe – ascultă evenimentul checkout.session.completed
 * și actualizează statusul comenzii în Supabase la "paid".
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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.order_id;

    if (orderId) {
      try {
        const supabase = getServerSupabase();
        const { error } = await supabase
          .from("orders")
          .update({
            status: "paid",
            stripe_session_id: session.id,
          })
          .eq("id", orderId);

        if (error) {
          console.error("Supabase update error for order", orderId, error);
          return NextResponse.json({ error: "DB update failed" }, { status: 500 });
        }

        console.log(`Order ${orderId} marked as paid (session: ${session.id})`);
      } catch (err) {
        console.error("Error updating order:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
      }
    } else {
      console.warn("checkout.session.completed without order_id in metadata:", session.id);
    }
  }

  return NextResponse.json({ received: true });
}
