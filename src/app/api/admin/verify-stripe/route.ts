import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { requireAdminEmail } from "@/lib/supabase-server-auth";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

/**
 * POST /api/admin/verify-stripe
 * Admin endpoint: verifies Stripe payment status for an order and updates DB if paid.
 */
export async function POST(request: Request) {
  const auth = await requireAdminEmail();
  if (!auth.ok) {
    return NextResponse.json({ error: "Acces interzis." }, { status: auth.status });
  }

  const body = await request.json();
  const orderId = body.order_id;
  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json({ error: "order_id este obligatoriu." }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // Get order with stripe_session_id
  const { data: order, error: fetchErr } = await supabase
    .from("orders")
    .select("id, status, stripe_session_id, payment_method")
    .eq("id", orderId)
    .single();

  if (fetchErr || !order) {
    return NextResponse.json({ error: "Comanda nu a fost găsită." }, { status: 404 });
  }

  if (order.payment_method !== "stripe") {
    return NextResponse.json({ error: "Comanda nu este cu plată Stripe." }, { status: 400 });
  }

  if (order.status === "paid") {
    return NextResponse.json({ already_paid: true, status: "paid" });
  }

  const sessionId = order.stripe_session_id;
  if (!sessionId) {
    return NextResponse.json({ error: "Comanda nu are un stripe_session_id asociat. Plata nu a fost inițiată." }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const isPaid = session.payment_status === "paid";

    if (isPaid && order.status !== "paid") {
      await supabase
        .from("orders")
        .update({ status: "paid" })
        .eq("id", orderId);
    }

    return NextResponse.json({
      stripe_status: session.payment_status,
      updated: isPaid && order.status !== "paid",
      status: isPaid ? "paid" : order.status,
    });
  } catch (err) {
    console.error("Stripe verify error:", err);
    return NextResponse.json({ error: "Eroare la verificarea plății Stripe." }, { status: 500 });
  }
}
