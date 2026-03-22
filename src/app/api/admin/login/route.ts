import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabase-server";

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
    console.error("Admin login check error:", error.message);
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

    const cookieStore = await cookies();
    const { supabaseUrl, anonKey } = getSupabaseConfig();

    let response = NextResponse.json({ ok: true });

    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const msg = error.message.toLowerCase();
      const friendly = msg.includes("invalid") && msg.includes("credentials")
        ? "Email sau parolă greșită. Verifică datele introduse și încearcă din nou."
        : "Nu am putut face autentificarea acum. Încearcă din nou.";

      return NextResponse.json({ error: friendly }, { status: 401 });
    }

    const userEmail = data.user?.email?.trim().toLowerCase();
    if (!userEmail) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Contul nu a putut fi verificat. Încearcă din nou." },
        { status: 401 }
      );
    }

    const adminAllowed = await isAdminEmail(userEmail);
    if (!adminAllowed) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Acest cont nu are acces la pagina de administrare." },
        { status: 403 }
      );
    }

    response = NextResponse.json({ ok: true, redirectTo: "/admin-comenzi" });

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (session) {
      response.cookies.set("sb-access-token", session.access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: session.expires_in,
      });
      response.cookies.set("sb-refresh-token", session.refresh_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (err) {
    console.error("Admin login API error:", err);
    return NextResponse.json(
      { error: "A apărut o problemă la autentificare. Încearcă din nou." },
      { status: 500 }
    );
  }
}
