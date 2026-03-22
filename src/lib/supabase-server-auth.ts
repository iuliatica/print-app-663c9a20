import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
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

/**
 * Verifică dacă un email este admin consultând tabelul admin_emails din DB.
 */
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

/**
 * Verifică dacă requestul curent vine de la un admin autentificat.
 * Citește cookie-ul admin_token, verifică JWT-ul cu Supabase, apoi verifică emailul în DB.
 */
export async function requireAdminEmail(): Promise<
  { ok: true; email: string } | { ok: false; status: number }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return { ok: false, status: 403 };
  }

  const { supabaseUrl, anonKey } = getSupabaseConfig();
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user?.email) {
    return { ok: false, status: 403 };
  }

  const allowed = await isAdminEmail(user.email);
  if (!allowed) {
    return { ok: false, status: 403 };
  }

  return { ok: true, email: user.email };
}
