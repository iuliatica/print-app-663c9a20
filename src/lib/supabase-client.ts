import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = (() => {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return value && /^https?:\/\//i.test(value)
    ? value
    : "https://opwtigccuxvfnkjykjdg.supabase.co";
})();

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  "sb_publishable_dUizLOaLXpqNwvCHk2mhOg_TSqoquBF";

/**
 * Client Supabase pentru browser (Auth, login, RLS).
 * Folosește createBrowserClient din @supabase/ssr ca sesiunea să fie în cookies,
 * astfel API-urile server (ex. /api/admin/orders) pot citi userul și acordă acces.
 */
export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Lipsește configurarea Supabase. Adaugă în .env.local: NEXT_PUBLIC_SUPABASE_URL și NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (publishable key din Supabase → Project Settings → API)."
    );
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
