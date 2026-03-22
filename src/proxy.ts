import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "admin_token";

/**
 * Middleware simplu: verifică doar dacă cookie-ul admin_token există.
 * Validarea reală se face în API routes (requireAdminEmail).
 */
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token && req.nextUrl.pathname.startsWith("/admin-comenzi")) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin-comenzi", "/admin-comenzi/:path*"],
};
