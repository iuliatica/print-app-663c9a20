import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { requireAdminEmail } from "@/lib/supabase-server-auth";

/**
 * Extrage bucket și path din URL-ul public Supabase.
 * Format: https://PROJECT.supabase.co/storage/v1/object/public/BUCKET/PATH
 */
function getBucketAndPathFromPublicUrl(publicUrl: string): { bucket: string; path: string } | null {
  try {
    const url = new URL(publicUrl);
    const match = url.pathname.match(
      /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/
    );
    if (!match) return null;
    return {
      bucket: decodeURIComponent(match[1]),
      path: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await requireAdminEmail();
  if (!auth.ok) {
    return NextResponse.json({ error: "Acces interzis." }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  if (!rawUrl?.trim()) {
    return NextResponse.json({ error: "Parametrul url lipsește." }, { status: 400 });
  }

  const fileUrl = decodeURIComponent(rawUrl.trim());
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "https://opwtigccuxvfnkjykjdg.supabase.co";
  const isSupabaseStorage =
    supabaseUrl && fileUrl.startsWith(supabaseUrl) && fileUrl.includes("/storage/v1/object/");

  if (isSupabaseStorage) {
    const parsed = getBucketAndPathFromPublicUrl(fileUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: "URL de storage invalid." },
        { status: 400 }
      );
    }
    const { bucket, path } = parsed;
    const configuredBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "comenzi";
    try {
      const supabase = getServerSupabase();
      let data: Blob | null = null;
      let error: { message?: string } | null = null;

      const tryBucket = async (b: string) => supabase.storage.from(b).download(path);

      const result = await tryBucket(bucket);
      data = result.data;
      error = result.error;

      if (error && (error.message?.toLowerCase().includes("bucket") || error.message?.toLowerCase().includes("not found")) && configuredBucket !== bucket) {
        const fallback = await tryBucket(configuredBucket);
        if (!fallback.error && fallback.data) {
          data = fallback.data;
          error = null;
        }
      }

      if (error) {
        console.error("Admin download storage error:", error);
        if (error.message?.toLowerCase().includes("bucket") || error.message?.toLowerCase().includes("not found")) {
          return NextResponse.json(
            {
              error: `Bucket-ul "${bucket}" nu există. Creează în Supabase → Storage un bucket numit "${configuredBucket}" (sau setează SUPABASE_STORAGE_BUCKET în .env.local).`,
            },
            { status: 404 }
          );
        }
        return NextResponse.json(
          { error: error.message ?? "Eroare la descărcare." },
          { status: 500 }
        );
      }

      if (!data) {
        return NextResponse.json({ error: "Fișier negăsit." }, { status: 404 });
      }

      const filename = path.split("/").pop() ?? "document.pdf";
      return new NextResponse(data, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch (err) {
      console.error("Admin download error:", err);
      return NextResponse.json(
        { error: "Eroare la descărcare." },
        { status: 500 }
      );
    }
  }

  return NextResponse.redirect(fileUrl);
}
