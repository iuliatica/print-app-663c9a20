import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

/**
 * PATCH /api/orders/[id] — actualizează stripe_session_id pe o comandă existentă.
 * Folosit imediat după crearea sesiunii Stripe, înainte de redirect.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID comandă lipsă." }, { status: 400 });
    }

    const body = await request.json();
    const stripeSessionId = body.stripe_session_id;

    if (!stripeSessionId || typeof stripeSessionId !== "string") {
      return NextResponse.json(
        { error: "stripe_session_id (string) este obligatoriu." },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    const { data, error } = await supabase
      .from("orders")
      .update({ stripe_session_id: stripeSessionId })
      .eq("id", id)
      .select("id, stripe_session_id")
      .single();

    if (error) {
      console.error("Order stripe_session_id update error:", error);
      return NextResponse.json(
        { error: error.message || "Eroare la actualizare." },
        { status: 500 }
      );
    }

    return NextResponse.json({ order: data });
  } catch (err) {
    console.error("Order PATCH error:", err);
    return NextResponse.json(
      { error: "Eroare la actualizare." },
      { status: 500 }
    );
  }
}
