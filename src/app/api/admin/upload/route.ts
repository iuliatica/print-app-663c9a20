import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { requireAdminEmail } from "@/lib/supabase-server-auth";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "comenzi";

function uniquePath(prefix: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return `${prefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
}

export async function POST(request: Request) {
  const auth = await requireAdminEmail();
  if (!auth.ok) {
    return NextResponse.json({ error: "Acces interzis." }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const orderId = formData.get("orderId") as string | null;
    const docType = formData.get("docType") as string | null; // "awb" or "factura"
    const file = formData.get("file") as File | null;

    if (!orderId || !docType || !file) {
      return NextResponse.json(
        { error: "Lipsesc câmpuri obligatorii: orderId, docType, file." },
        { status: 400 }
      );
    }

    if (!["awb", "factura"].includes(docType)) {
      return NextResponse.json(
        { error: "docType trebuie să fie 'awb' sau 'factura'." },
        { status: 400 }
      );
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Fișierul depășește 20 MB." },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Upload to storage
    const path = uniquePath(docType, file.name);
    const buffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/pdf",
      });

    if (uploadError) {
      console.error("Admin upload error:", uploadError);
      return NextResponse.json(
        { error: `Eroare la încărcare: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uploadData.path);
    const publicUrl = urlData.publicUrl;

    // Update order with the URL
    const column = docType === "awb" ? "awb_url" : "factura_url";
    const { error: updateError } = await supabase
      .from("orders")
      .update({ [column]: publicUrl })
      .eq("id", orderId);

    if (updateError) {
      console.error("Admin upload update error:", updateError);
      return NextResponse.json(
        { error: `Fișierul s-a încărcat, dar nu am putut salva linkul: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, url: publicUrl, docType });
  } catch (err) {
    console.error("Admin upload API error:", err);
    return NextResponse.json(
      { error: "Eroare la încărcare. Încearcă din nou." },
      { status: 500 }
    );
  }
}
