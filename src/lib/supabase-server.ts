import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://opwtigccuxvfnkjykjdg.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Client Supabase pentru backend (rute API).
 * Folosește SERVICE_ROLE_KEY – nu expune acest modul în frontend.
 * Permite gestionarea comenzilor și a storage fără a activa politici publice pe DB/Storage.
 */
export function getServerSupabase() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY trebuie setate în mediul de server."
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
