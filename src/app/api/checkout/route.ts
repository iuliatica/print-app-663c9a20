import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerSupabaseAuth } from "@/lib/supabase-server-auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export type CheckoutBody = {
  /** Sumă de încasat, în unități minime ale monedei (ex: bani pentru RON – 10.50 lei = 1050). */
  amount: number;
  /** Cod monedă (ex: "ron"). */
  currency: string;
  /** Metadata (detalii printare etc.) – chei și valori string. */
  metadata?: Record<string, string>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutBody;
    const { amount, currency, metadata = {} } = body;

    if (typeof amount !== "number" || amount <= 0 || !currency?.trim()) {
      return NextResponse.json(
        { error: "amount (number > 0) și currency sunt obligatorii." },
        { status: 400 }
      );
    }

    const origin = request.headers.get("origin") ?? "";

    // Încearcă să obții email-ul utilizatorului logat din Supabase.
    // Dacă nu există, folosește email-ul din metadata (formularul de comandă).
    let customerEmail: string | undefined;
    try {
      const supabase = await createServerSupabaseAuth();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        customerEmail = user.email.trim().toLowerCase();
      }
    } catch {
      // Ignorăm erorile – nu vrem să blocăm plata dacă nu putem citi sesiunea
    }
    if (!customerEmail && metadata.shipping_email) {
      customerEmail = metadata.shipping_email.trim().toLowerCase();
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: "Printare documente",
              description: "Detalii în metadata",
            },
            unit_amount: Math.round(amount),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/success`,
      cancel_url: `${origin}/`,
      metadata,
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
