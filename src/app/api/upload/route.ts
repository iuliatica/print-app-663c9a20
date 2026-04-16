import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "comenzi";
const MAX_FILES = 20;

// Simple in-memory IP rate limiter
const ipRequests = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipRequests.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRequests.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

if (typeof globalThis !== "undefined") {
  const CLEANUP_INTERVAL = 5 * 60_000;
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipRequests) {
      if (now > entry.resetAt) ipRequests.delete(ip);
    }
  }, CLEANUP_INTERVAL).unref?.();
}

function uniquePath(fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${safe}`;
}

/**
 * POST — Generate signed upload URLs for direct-to-storage uploads.
 * Body: JSON { files: [{ name: string }] }
 * Returns: { signed: [{ path, token, url }] }
 */
export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Prea multe încărcări. Așteaptă un minut și încearcă din nou." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const fileNames: { name: string }[] = body?.files;

    if (!Array.isArray(fileNames) || fileNames.length === 0) {
      return NextResponse.json(
        { error: "Trimite cel puțin un fișier." },
        { status: 400 }
      );
    }

    if (fileNames.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES} fișiere permise.` },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();
    const signed: { path: string; signedUrl: string }[] = [];

    for (const { name } of fileNames) {
      const path = uniquePath(name || "document.pdf");

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(path);

      if (error || !data) {
        console.error("Signed URL error:", error);
        return NextResponse.json(
          { error: `Eroare la generare URL: ${error?.message || "necunoscută"}` },
          { status: 500 }
        );
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

      signed.push({
        path,
        signedUrl: data.signedUrl,
        publicUrl: urlData.publicUrl,
      });
    }

    return NextResponse.json({ signed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Eroare la pregătirea încărcării.";
    if (message.includes("supabaseUrl") || message.includes("SUPABASE")) {
      return NextResponse.json(
        { error: "Serverul nu este configurat pentru upload. Verifică variabilele de mediu." },
        { status: 503 }
      );
    }
    console.error("Upload API error:", err);
    return NextResponse.json(
      { error: "Eroare la pregătirea încărcării. Încearcă din nou." },
      { status: 500 }
    );
  }
}
