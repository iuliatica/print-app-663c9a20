import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { requireAdminEmail } from "@/lib/supabase-server-auth";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "comenzi";
const RETENTION_DAYS = 30;

/**
 * Extrage path-ul din URL-ul public Supabase Storage.
 */
function getStoragePath(publicUrl: string): string | null {
  try {
    const url = new URL(publicUrl);
    const match = url.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/admin/cleanup
 * Șterge fișierele din Storage pentru comenzile mai vechi de 30 de zile.
 * Păstrează metadatele (nume fișiere, pagini) în config_details.
 */
export async function POST() {
  const auth = await requireAdminEmail();
  if (!auth.ok) {
    return NextResponse.json({ error: "Acces interzis." }, { status: auth.status });
  }

  try {
    const supabase = getServerSupabase();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Find orders older than 30 days that haven't been cleaned yet
    const { data: orders, error: fetchErr } = await supabase
      .from("orders")
      .select("id, file_url, awb_url, factura_url")
      .lt("created_at", cutoff)
      .is("files_deleted_at", null);

    if (fetchErr) {
      console.error("Cleanup fetch error:", fetchErr);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ cleaned: 0, message: "Nu sunt comenzi mai vechi de 30 de zile de curățat." });
    }

    let cleaned = 0;
    const errors: string[] = [];

    for (const order of orders) {
      const pathsToDelete: string[] = [];

      // Collect file paths from file_url (JSON array or single URL)
      if (order.file_url) {
        try {
          const parsed = JSON.parse(order.file_url);
          if (Array.isArray(parsed)) {
            for (const u of parsed) {
              const p = getStoragePath(u);
              if (p) pathsToDelete.push(p);
            }
          }
        } catch {
          const p = getStoragePath(order.file_url);
          if (p) pathsToDelete.push(p);
        }
      }

      // AWB and factura paths
      if (order.awb_url) {
        const p = getStoragePath(order.awb_url);
        if (p) pathsToDelete.push(p);
      }
      if (order.factura_url) {
        const p = getStoragePath(order.factura_url);
        if (p) pathsToDelete.push(p);
      }

      // Delete files from storage (best effort)
      if (pathsToDelete.length > 0) {
        const { error: delErr } = await supabase.storage.from(BUCKET).remove(pathsToDelete);
        if (delErr) {
          console.error(`Cleanup storage delete error for order ${order.id}:`, delErr);
          errors.push(`Comanda ${order.id.slice(0, 8)}: ${delErr.message}`);
        }
      }

      // Mark order as cleaned - nullify URLs but keep config_details intact
      const { error: updateErr } = await supabase
        .from("orders")
        .update({
          file_url: order.file_url, // keep original URLs for reference
          awb_url: null,
          factura_url: null,
          files_deleted_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateErr) {
        console.error(`Cleanup update error for order ${order.id}:`, updateErr);
        errors.push(`Comanda ${order.id.slice(0, 8)}: nu am putut actualiza`);
      } else {
        cleaned++;
      }
    }

    return NextResponse.json({
      cleaned,
      total: orders.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${cleaned} ${cleaned === 1 ? "comandă curățată" : "comenzi curățate"}. Fișierele au fost șterse din Storage, metadatele rămân vizibile.`,
    });
  } catch (err) {
    console.error("Cleanup API error:", err);
    return NextResponse.json({ error: "Eroare la curățare." }, { status: 500 });
  }
}
