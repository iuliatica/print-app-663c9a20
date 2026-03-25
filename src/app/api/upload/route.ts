import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { assertPdfFile } from "@/lib/pdf-validation";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "comenzi";
const MAX_FILES = 20;
const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_TOTAL_BYTES = MAX_FILES * MAX_FILE_SIZE_BYTES; // 1 GB

// Simple in-memory IP rate limiter
const ipRequests = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 uploads per IP per minute

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

// Periodically clean up stale entries (every 5 min)
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

export async function POST(request: Request) {
  try {
    // Rate limit by IP
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

    // Content-Length check — fail fast on oversized requests
    const contentLength = request.headers.get("content-length");
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > MAX_TOTAL_BYTES) {
        return NextResponse.json(
          { error: `Dimensiunea totală depășește limita de ${MAX_FILES * MAX_FILE_SIZE_MB} MB.` },
          { status: 413 }
        );
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "https://opwtigccuxvfnkjykjdg.supabase.co";
    const serviceRoleKey = process.env.SB_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl?.trim() || !serviceRoleKey?.trim()) {
      const missing: string[] = [];
      if (!supabaseUrl?.trim()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
      if (!serviceRoleKey?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
      console.error("Upload: variabile lipsă:", missing.join(", "));
      return NextResponse.json(
        {
          error: "Serverul nu este configurat pentru upload (lipsesc variabile de mediu).",
          missing: missing,
          hint: "Adaugă în .env.local: NEXT_PUBLIC_SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY (din Supabase → Settings → API).",
        },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files");
    const fileList = Array.isArray(files) ? files : [files].filter(Boolean);

    if (fileList.length === 0) {
      return NextResponse.json(
        { error: "Trimite cel puțin un fișier (câmpul 'files')." },
        { status: 400 }
      );
    }

    if (fileList.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES} fișiere permise.` },
        { status: 400 }
      );
    }

    const validFiles: { file: File; name: string }[] = [];
    for (const f of fileList) {
      if (!(f instanceof File)) continue;
      if (f.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `Fișierul "${f.name}" depășește ${MAX_FILE_SIZE_MB} MB.` },
          { status: 400 }
        );
      }
      await assertPdfFile(f);
      validFiles.push({ file: f, name: f.name });
    }

    if (validFiles.length === 0) {
      return NextResponse.json(
        { error: "Niciun fișier valid (trimite fișiere PDF)." },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();
    const urls: string[] = [];

    for (const { file, name } of validFiles) {
      const path = uniquePath(name);
      const buffer = await file.arrayBuffer();
      const { data, error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
        cacheControl: "3600",
        upsert: false,
        contentType: "application/pdf",
      });

      if (error) {
        console.error("Upload error:", error);
        return NextResponse.json(
          {
            error: `Eroare Storage: ${error.message}. Verifică că bucket-ul "${BUCKET}" există în Supabase.`,
          },
          { status: 500 }
        );
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
      urls.push(urlData.publicUrl);
    }

    return NextResponse.json({ urls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Eroare la încărcare.";
    if (message.includes("nu este un PDF") || message.includes("nu pare a fi")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Upload API error:", err);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "development"
            ? message
            : "Eroare la încărcarea fișierelor. Încearcă din nou.",
      },
      { status: 500 }
    );
  }
}
