import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Sincronizează sesiunea Supabase din cookies pe rutele protejate.
 * Astfel, după login, serverul vede imediat userul pe /admin-comenzi și API-urile aferente.
 */
export async function proxy(req: NextRequest) {
  let response = NextResponse.next({
    request: req,
  });

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

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && req.nextUrl.pathname.startsWith("/admin-comenzi")) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin-comenzi", "/admin-comenzi/:path*"],
};
