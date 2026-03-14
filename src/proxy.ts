import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy minimal. Protecția pentru /admin-comenzi: doar utilizatori autentificați
 * la /login cu emailul de admin (verificat în API prin Supabase session).
 */
export async function proxy(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin-comenzi", "/admin-comenzi/:path*"],
};
