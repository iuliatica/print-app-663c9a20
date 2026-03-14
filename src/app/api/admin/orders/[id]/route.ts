import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { requireAdminEmail } from "@/lib/supabase-server-auth";

const ALLOWED_STATUSES = ["Nou", "În lucru", "Gata"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminEmail();
  if (!auth.ok) {
    return NextResponse.json({ error: "Acces interzis." }, { status: auth.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID comandă lipsă." }, { status: 400 });
  }

  let body: { status?: string; printed_files?: boolean[]; ramburs_confirmed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corp JSON invalid." }, { status: 400 });
  }

  const status = body.status?.trim();
  const printedFiles = body.printed_files;
  const rambursConfirmed = body.ramburs_confirmed;
  const updateStatus = status && ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number]);

  if (!updateStatus && printedFiles === undefined && rambursConfirmed === undefined) {
    return NextResponse.json(
      { error: `Trimite 'status' (${ALLOWED_STATUSES.join(", ")}), 'printed_files' (array boolean) și/sau 'ramburs_confirmed' (boolean).` },
      { status: 400 }
    );
  }

  try {
    const supabase = getServerSupabase();

    let updatePayload: { status?: string; config_details?: Record<string, unknown> } = {};
    if (updateStatus) {
      updatePayload.status = status;
    }
    if (Array.isArray(printedFiles) || rambursConfirmed !== undefined) {
      const { data: existing } = await supabase
        .from("orders")
        .select("config_details")
        .eq("id", id)
        .single();
      const current = (existing?.config_details as Record<string, unknown> | null) ?? {};
      updatePayload.config_details = {
        ...current,
        ...(Array.isArray(printedFiles) ? { printed_files: printedFiles } : {}),
        ...(rambursConfirmed !== undefined ? { ramburs_confirmed: rambursConfirmed } : {}),
      };
    }

    const { data, error } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", id)
      .select("id, status, config_details")
      .single();

    if (error) {
      console.error("Admin order update error:", error);
      return NextResponse.json(
        { error: error.message || "Eroare la actualizare." },
        { status: 500 }
      );
    }

    return NextResponse.json({ order: data });
  } catch (err) {
    console.error("Admin order PATCH error:", err);
    return NextResponse.json(
      { error: "Eroare la actualizare." },
      { status: 500 }
    );
  }
}
