import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabase-server";

/**
 * Client Supabase pentru server care citește sesiunea din cookies (anon key).
 * Folosit pentru a verifica utilizatorul curent în API routes.
 */
export async function createServerSupabaseAuth() {
  const cookieStore = await cookies();
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_dUizLOaLXpqNwvCHk2mhOg_TSqoquBF";
  const supabaseUrl = (() => {
    const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    return value && /^https?:\/\//i.test(value)
      ? value
      : "https://opwtigccuxvfnkjykjdg.supabase.co";
  })();
  if (!supabaseUrl || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL și cheia anonimă trebuie setate.");
  }
  return createServerClient(
    supabaseUrl,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: Record<string, unknown> }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignorat în unele contexte server
          }
        },
      },
    }
  );
}

/**
 * Verifică dacă un email este admin consultând tabelul admin_emails din DB.
 * Folosește service role key (bypass RLS).
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
 * Verifică dacă utilizatorul curent (din cookies) este admin (email în tabelul admin_emails).
 * Returnează { ok: true } sau { ok: false, status: 403 }.
 */
export async function requireAdminEmail(): Promise<
  { ok: true; email: string } | { ok: false; status: number }
> {
  const supabase = await createServerSupabaseAuth();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, status: 403 };
  }
  const allowed = await isAdminEmail(user.email);
  if (!allowed) {
    return { ok: false, status: 403 };
  }
  return { ok: true, email: user.email };
}
