import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const supabaseServiceKey = process.env.SB_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * Client Supabase pentru server (API routes, Server Components).
 * Folosește service role key pentru operații care necesită drepturi complete (ex: insert în orders).
 */
export const supabaseAdmin = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseServiceKey || "placeholder");
