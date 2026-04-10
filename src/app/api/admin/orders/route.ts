import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { requireAdminEmail } from "@/lib/supabase-server-auth";

export type ConfigDetails = {
  files?: Array<{
    name: string;
    pages: number | null;
    printMode: "bw" | "color";
    duplex: boolean;
    copies: number;
  }>;
  spiralType?: string;
  spiralColor?: string;
  coverFrontColor?: string;
  coverBackColor?: string;
};

export type AdminOrderRow = {
  id: string;
  created_at: string;
  phone: string;
  customer_email: string;
  customer_name: string | null;
  shipping_address: string | null;
  total_price: number;
  payment_method: string;
  status: string;
  file_url: string;
  config_details: ConfigDetails | null;
  awb_url: string | null;
  factura_url: string | null;
};

export async function GET() {
  const auth = await requireAdminEmail();
  if (!auth.ok) {
    return NextResponse.json({ error: "Acces interzis. Autentifică-te la /login cu emailul de admin." }, { status: auth.status });
  }

  try {
    const supabase = getServerSupabase();
    // Try with stripe_session_id first, fall back without it
    let data, error;
    const fullSelect = "id, created_at, phone, customer_email, customer_name, shipping_address, total_price, payment_method, status, file_url, config_details, awb_url, factura_url, files_deleted_at, stripe_session_id";
    const fallbackSelect = "id, created_at, phone, customer_email, customer_name, shipping_address, total_price, payment_method, status, file_url, config_details, awb_url, factura_url, files_deleted_at";

    const result = await supabase
      .from("orders")
      .select(fullSelect)
      .order("created_at", { ascending: false });

    if (result.error && result.error.message?.includes("stripe_session_id")) {
      const fallback = await supabase
        .from("orders")
        .select(fallbackSelect)
        .order("created_at", { ascending: false });
      data = fallback.data;
      error = fallback.error;
    } else {
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error("Admin orders fetch error:", error);
      return NextResponse.json(
        { error: error.message || "Eroare la încărcarea comenzilor." },
        { status: 500 }
      );
    }

    return NextResponse.json({ orders: (data ?? []) as AdminOrderRow[] });
  } catch (err) {
    console.error("Admin orders API error:", err);
    return NextResponse.json(
      { error: "Eroare la încărcarea comenzilor." },
      { status: 500 }
    );
  }
}
