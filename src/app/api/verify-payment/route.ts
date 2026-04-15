import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSupabase } from "@/lib/supabase-server";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

/**
 * GET /api/verify-payment?session_id=cs_xxx
 * Verifică statusul plății Stripe și returnează detaliile comenzii din Supabase.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "session_id lipsă." }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paid = session.payment_status === "paid";
    const orderId = session.metadata?.order_id;

    let order = null;
    if (orderId) {
      const supabase = getServerSupabase();

      // If Stripe says paid, update the order status in DB (in case webhook didn't fire)
      if (paid) {
        await supabase
          .from("orders")
          .update({ status: "paid", stripe_session_id: sessionId })
          .eq("id", orderId)
          .neq("status", "paid"); // only update if not already paid
      }

      const { data } = await supabase
        .from("orders")
        .select("id, created_at, phone, customer_email, total_price, payment_method, status, config_details")
        .eq("id", orderId)
        .single();
      order = data;
    }

    return NextResponse.json({
      paid,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email ?? session.customer_email ?? null,
      amount_total: session.amount_total,
      currency: session.currency,
      order,
    });
  } catch (err) {
    console.error("Verify payment error:", err);
    return NextResponse.json({ error: "Eroare la verificarea plății." }, { status: 500 });
  }
}
