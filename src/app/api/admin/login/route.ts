import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase-server";

const COOKIE_NAME = "admin_token";

function getSupabaseConfig() {
  const supabaseUrl = (() => {
    const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    return value && /^https?:\/\//i.test(value)
      ? value
      : "https://opwtigccuxvfnkjykjdg.supabase.co";
  })();
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    "sb_publishable_dUizLOaLXpqNwvCHk2mhOg_TSqoquBF";
  return { supabaseUrl, anonKey };
}

async function isAdminEmail(email: string): Promise<boolean> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("admin_emails")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) {
    console.error("Admin email check error:", error.message);
    return false;
  }
  return !!data;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Te rugăm completează emailul și parola." },
        { status: 400 }
      );
    }

    const { supabaseUrl, anonKey } = getSupabaseConfig();

    // Login cu un client simplu (fără SSR cookies)
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const msg = error.message.toLowerCase();
      const friendly =
        msg.includes("invalid") && msg.includes("credentials")
          ? "Email sau parolă greșită. Verifică datele introduse și încearcă din nou."
          : "Nu am putut face autentificarea acum. Încearcă din nou.";
      return NextResponse.json({ error: friendly }, { status: 401 });
    }

    if (!data.session) {
      return NextResponse.json(
        { error: "Nu am putut crea sesiunea. Încearcă din nou." },
        { status: 500 }
      );
    }

    const userEmail = data.user?.email?.trim().toLowerCase();
    if (!userEmail) {
      return NextResponse.json(
        { error: "Contul nu a putut fi verificat." },
        { status: 401 }
      );
    }

    const adminAllowed = await isAdminEmail(userEmail);
    if (!adminAllowed) {
      return NextResponse.json(
        { error: "Acest cont nu are acces la pagina de administrare." },
        { status: 403 }
      );
    }

    // Setăm access token-ul ca un cookie simplu httpOnly
    const response = NextResponse.json({ ok: true, redirectTo: "/admin-comenzi" });
    response.cookies.set(COOKIE_NAME, data.session.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: data.session.expires_in,
    });

    return response;
  } catch (err) {
    console.error("Admin login API error:", err);
    return NextResponse.json(
      { error: "A apărut o problemă la autentificare. Încearcă din nou." },
      { status: 500 }
    );
  }
}
