import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { getServerSupabase } from "@/lib/supabase-server";

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    "";
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

/**
 * Reads the Bearer token from Authorization header, verifies it with Supabase,
 * and checks that the user's email is in the admin_emails table.
 */
export async function requireAdminEmail(): Promise<
  { ok: true; email: string } | { ok: false; status: number }
> {
  const hdrs = await headers();
  const authHeader = hdrs.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token) {
    return { ok: false, status: 403 };
  }

  const { supabaseUrl, anonKey } = getSupabaseConfig();
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 500 };
  }

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
