import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  "";

/**
 * Client Supabase pentru browser (Auth, login, RLS).
 * Folosește createBrowserClient din @supabase/ssr ca sesiunea să fie în cookies,
 * astfel API-urile server (ex. /api/admin/orders) pot citi userul și acordă acces.
 */
export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Lipsește configurarea Supabase. Setează variabilele de mediu: NEXT_PUBLIC_SUPABASE_URL și NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
