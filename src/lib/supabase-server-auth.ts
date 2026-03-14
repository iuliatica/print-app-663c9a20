import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const ALLOWED_ADMIN_EMAIL = "iulia.tica05@gmail.com";

/**
 * Client Supabase pentru server care citește sesiunea din cookies (anon key).
 * Folosit pentru a verifica utilizatorul curent în API routes.
 */
export async function createServerSupabaseAuth() {
  const cookieStore = await cookies();
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL și cheia anonimă trebuie setate.");
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
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
 * Verifică dacă utilizatorul curent (din cookies) este admin (email permis).
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
  const emailNormalized = user.email.trim().toLowerCase();
  if (emailNormalized !== ALLOWED_ADMIN_EMAIL.toLowerCase()) {
    return { ok: false, status: 403 };
  }
  return { ok: true, email: user.email };
}
