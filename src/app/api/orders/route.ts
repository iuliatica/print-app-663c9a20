import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const serviceRoleKey = process.env.SB_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Configurare printare și legare – salvată în config_details. */
export type ConfigDetails = {
  /** Setări per document: tip print, față-verso, copii */
  files?: Array<{
    name: string;
    pages: number | null;
    printMode: "bw" | "color";
    duplex: boolean;
    copies: number;
  }>;
  /** Tip spirală: none | plastic */
  spiralType: string;
  /** Culoare spirală (dacă spiralType !== "none") */
  spiralColor?: string;
  /** Culoare copertă față */
  coverFrontColor?: string;
  /** Culoare copertă spate */
  coverBackColor?: string;
};

export type CreateOrderBody = {
  /** URL-uri fișiere (stocate ca JSON array string sau primul URL) */
  file_url: string;
  total_price: number;
  payment_method: string;
  status: string;
  customer_email: string;
  phone: string;
  /** Nume complet client (livrare) */
  customer_name?: string;
  /** Adresă livrare */
  shipping_address?: string;
  config_details: ConfigDetails;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateOrderBody(body: unknown): { error?: string; data?: CreateOrderBody } {
  if (!body || typeof body !== "object") {
    return { error: "Corpul cererii trebuie să fie un obiect JSON." };
  }
  const b = body as Record<string, unknown>;

  const file_url = b.file_url;
  if (file_url === undefined || file_url === null) {
    return { error: "Câmpul 'file_url' este obligatoriu." };
  }
  if (typeof file_url !== "string") {
    return { error: "Câmpul 'file_url' trebuie să fie un șir de caractere." };
  }

  const total_price = b.total_price;
  if (typeof total_price !== "number" || total_price < 0) {
    return { error: "Câmpul 'total_price' este obligatoriu și trebuie să fie un număr >= 0." };
  }

  const payment_method = b.payment_method;
  if (!payment_method || typeof payment_method !== "string" || !payment_method.trim()) {
    return { error: "Câmpul 'payment_method' este obligatoriu." };
  }

  const status = b.status;
  if (!status || typeof status !== "string" || !status.trim()) {
    return { error: "Câmpul 'status' este obligatoriu." };
  }

  const customer_email = b.customer_email;
  if (!customer_email || typeof customer_email !== "string") {
    return { error: "Câmpul 'customer_email' este obligatoriu." };
  }
  const emailTrim = String(customer_email).trim().toLowerCase();
  if (!emailTrim) {
    return { error: "Câmpul 'customer_email' nu poate fi gol." };
  }
  if (!EMAIL_REGEX.test(emailTrim)) {
    return { error: "Câmpul 'customer_email' trebuie să fie o adresă de email validă." };
  }

  const phone = b.phone;
  if (!phone || typeof phone !== "string") {
    return { error: "Câmpul 'phone' este obligatoriu." };
  }
  if (!String(phone).trim()) {
    return { error: "Câmpul 'phone' nu poate fi gol." };
  }

  const config_details = b.config_details;
  if (config_details === undefined || config_details === null) {
    return { error: "Câmpul 'config_details' este obligatoriu." };
  }
  if (typeof config_details !== "object" || Array.isArray(config_details)) {
    return { error: "Câmpul 'config_details' trebuie să fie un obiect JSON." };
  }

  const customer_name =
    b.customer_name != null && typeof b.customer_name === "string"
      ? String(b.customer_name).trim()
      : undefined;
  const shipping_address =
    b.shipping_address != null && typeof b.shipping_address === "string"
      ? String(b.shipping_address).trim()
      : undefined;

  return {
    data: {
      file_url,
      total_price: total_price as number,
      payment_method: String(payment_method).trim(),
      status: String(status).trim(),
      customer_email: emailTrim,
      phone: String(phone).trim(),
      ...(customer_name && { customer_name }),
      ...(shipping_address && { shipping_address }),
      config_details: config_details as ConfigDetails,
    },
  };
}

export async function POST(request: Request) {
  try {
    const hasUrl = !!supabaseUrl?.trim();
    const hasServiceKey = !!serviceRoleKey?.trim();
    if (!hasUrl || !hasServiceKey) {
      const missing: string[] = [];
      if (!hasUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
      if (!hasServiceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
      return NextResponse.json(
        {
          error: "Supabase nu este configurat (URL sau service role key lipsă).",
          missing,
          hint: "Adaugă în .env.local: NEXT_PUBLIC_SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API, secret key).",
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const validation = validateOrderBody(body);
    if (validation.error) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const data = validation.data!;

    const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    const insertPayload: Record<string, unknown> = {
      file_url: data.file_url,
      total_price: data.total_price,
      payment_method: data.payment_method,
      status: data.status,
      customer_email: data.customer_email,
      phone: data.phone,
      config_details: data.config_details as unknown as Record<string, unknown>,
    };
    if ("customer_name" in data && data.customer_name) {
      insertPayload.customer_name = data.customer_name;
    }
    if ("shipping_address" in data && data.shipping_address) {
      insertPayload.shipping_address = data.shipping_address;
    }
    const { data: row, error } = await supabase
      .from("orders")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      console.error("Supabase orders insert error:", JSON.stringify(error));
      return NextResponse.json(
        { error: error.message || "Eroare la salvare comanda.", details: error.details, hint: error.hint, code: error.code },
        { status: 500 }
      );
    }

    // Send WhatsApp notification via CallMeBot (fire-and-forget)
    try {
      const phone = process.env.CALLMEBOT_PHONE;
      const apiKey = process.env.CALLMEBOT_API_KEY;
      if (phone && apiKey) {
        const now = new Date().toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" });
        const name = data.customer_name || "Necunoscut";
        const payLabel = data.payment_method === "ramburs" ? "Ramburs" : "Card online";
        const msg = `🛒 Comandă nouă Printica!\n📅 ${now}\n👤 ${name}\n💰 ${data.total_price.toFixed(2)} lei\n💳 ${payLabel}`;
        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(msg)}&apikey=${encodeURIComponent(apiKey)}`;
        fetch(url).catch((e) => console.error("CallMeBot error:", e));
      }
    } catch (e) {
      console.error("WhatsApp notification error:", e);
    }

    return NextResponse.json({ id: row?.id }, { status: 201 });
  } catch (err) {
    console.error("Orders API error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message || "Eroare la salvare comanda." },
      { status: 500 }
    );
  }
}
