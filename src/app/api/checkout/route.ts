import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSupabase } from "@/lib/supabase-server";

const SHIPPING_COST_LEI = 15;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

export type CheckoutBody = {
  /** ID-ul comenzii din Supabase – prețul se preia server-side. */
  order_id: string;
  /** Metadata suplimentară (opțional). */
  metadata?: Record<string, string>;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutBody;
    const { order_id, metadata = {} } = body;

    if (!order_id || typeof order_id !== "string" || !UUID_REGEX.test(order_id)) {
      return NextResponse.json(
        { error: "order_id (UUID valid) este obligatoriu." },
        { status: 400 }
      );
    }

    // Look up the order's total_price server-side
    const supabase = getServerSupabase();
    const { data: order, error: dbError } = await supabase
      .from("orders")
      .select("id, total_price, status, customer_email")
      .eq("id", order_id)
      .single();

    if (dbError || !order) {
      return NextResponse.json(
        { error: "Comanda nu a fost găsită." },
        { status: 404 }
      );
    }

    if (order.status === "paid") {
      return NextResponse.json(
        { error: "Comanda a fost deja plătită." },
        { status: 400 }
      );
    }

    const totalPrice = Number(order.total_price);
    if (!totalPrice || totalPrice <= 0) {
      return NextResponse.json(
        { error: "Prețul comenzii este invalid." },
        { status: 400 }
      );
    }

    // Convert lei to bani (subunits)
    const amountBani = Math.round(totalPrice * 100);

    const origin = request.headers.get("origin") ?? "";

    let customerEmail: string | undefined;
    if (order.customer_email) {
      customerEmail = String(order.customer_email).trim().toLowerCase();
    } else if (metadata.shipping_email) {
      customerEmail = metadata.shipping_email.trim().toLowerCase();
    }

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "ron",
            product_data: {
              name: "Printare documente",
              description: "Detalii în metadata",
            },
            unit_amount: amountBani,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      metadata: { ...metadata, order_id },
      ...(customerEmail ? { customer_email: customerEmail } : {}),
    });

    return NextResponse.json({ id: session.id, url: session.url ?? undefined });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: "Eroare la crearea sesiunii de plată." },
      { status: 500 }
    );
  }
}
