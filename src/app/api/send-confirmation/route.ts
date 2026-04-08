import { NextResponse } from "next/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

type FileInfo = {
  name: string;
  pages: number | null;
  printMode: "bw" | "color";
  duplex: boolean;
  copies: number;
};

type ConfirmationBody = {
  to: string;
  customerName?: string;
  totalPrice: number;
  paymentMethod: string;
  files: FileInfo[];
  spiralType?: string;
  spiralColor?: string;
  coverBackColor?: string;
  shippingAddress?: string;
};

function buildEmailHtml(data: ConfirmationBody): string {
  const filesHtml = data.files
    .map(
      (f) =>
        `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;">${f.name}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;text-align:center;">${f.pages ?? "—"}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;text-align:center;">${f.printMode === "color" ? "Color" : "Alb-negru"}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;text-align:center;">${f.duplex ? "Da" : "Nu"}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;text-align:center;">${f.copies}</td>
        </tr>`
    )
    .join("");

  const spiralLabel =
    data.spiralType === "spirala"
      ? `Spirală ${data.spiralColor ?? "neagră"}`
      : data.spiralType === "perforare2"
      ? "Perforare cu 2 găuri"
      : data.spiralType === "capsare"
      ? "Capsare"
      : "Fără legare";

  const greeting = data.customerName
    ? `Salut, ${data.customerName}!`
    : "Salut!";

  const paymentLabel =
    data.paymentMethod === "ramburs"
      ? "Plată la livrare (ramburs)"
      : "Plată online (card)";

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#06b6d4,#0ea5a0,#10b981);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Printica</h1>
            <p style="margin:8px 0 0;font-size:14px;color:#bfdbfe;">Servicii de printare profesionale</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <!-- Greeting -->
            <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;">${greeting}</h2>
            <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
              Comanda ta a fost primită cu succes și va fi procesată în cel mai scurt timp.
            </p>

            <!-- Status badge -->
            <div style="background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center;">
              <span style="font-size:24px;">✓</span>
              <p style="margin:8px 0 0;font-size:16px;font-weight:700;color:#065f46;">Comanda confirmată</p>
            </div>

            <!-- Files table -->
            <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1e293b;">Documente comandate</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <thead>
                <tr style="background-color:#f8fafc;">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;">Fișier</th>
                  <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;">Pagini</th>
                  <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;">Tip</th>
                  <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;">Față-verso</th>
                  <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;">Copii</th>
                </tr>
              </thead>
              <tbody>
                ${filesHtml}
              </tbody>
            </table>

            <!-- Order details -->
            <div style="background-color:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#64748b;">Legare</td>
                  <td style="padding:6px 0;font-size:14px;color:#1e293b;font-weight:600;text-align:right;">${spiralLabel}</td>
                </tr>
                ${data.coverBackColor && data.spiralType === "spirala" ? `<tr>
                  <td style="padding:6px 0;font-size:14px;color:#64748b;">Copertă spate</td>
                  <td style="padding:6px 0;font-size:14px;color:#1e293b;font-weight:600;text-align:right;">${data.coverBackColor}</td>
                </tr>` : ""}
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#64748b;">Metodă plată</td>
                  <td style="padding:6px 0;font-size:14px;color:#1e293b;font-weight:600;text-align:right;">${paymentLabel}</td>
                </tr>
                ${data.shippingAddress ? `<tr>
                  <td style="padding:6px 0;font-size:14px;color:#64748b;">Adresă livrare</td>
                  <td style="padding:6px 0;font-size:14px;color:#1e293b;font-weight:600;text-align:right;">${data.shippingAddress}</td>
                </tr>` : ""}
                <tr>
                  <td colspan="2" style="padding:12px 0 0;border-top:2px solid #e2e8f0;"></td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:18px;font-weight:800;color:#1e293b;">Total</td>
                  <td style="padding:6px 0;font-size:18px;font-weight:800;color:#0ea5a0;text-align:right;">${data.totalPrice.toFixed(2)} lei</td>
                </tr>
              </table>
            </div>

            <!-- Info -->
            <div style="background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
              <p style="margin:0;font-size:14px;color:#065f46;line-height:1.6;">
                📦 Comanda va fi procesată și livrată prin curier în <strong>2-4 zile lucrătoare</strong>.
              </p>
            </div>

            <p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">
              Dacă ai întrebări, nu ezita să ne contactezi la <a href="mailto:contact@printica.ro" style="color:#0ea5a0;text-decoration:underline;">contact@printica.ro</a>.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background-color:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:13px;color:#94a3b8;">Printica — Tica M. Genoveva PFA · CUI 51541140</p>
            <p style="margin:4px 0 0;font-size:12px;color:#cbd5e1;">Acest email a fost trimis automat. Nu răspunde la acest mesaj.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(request: Request) {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY nu este configurată.");
    return NextResponse.json({ error: "Email service nu este configurat." }, { status: 500 });
  }

  try {
    const body: ConfirmationBody = await request.json();

    if (!body.to || typeof body.to !== "string") {
      return NextResponse.json({ error: "Adresa email lipsește." }, { status: 400 });
    }

    const html = buildEmailHtml(body);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Printica <noreply@printica.ro>",
        to: [body.to],
        subject: "Comanda ta Printica a fost primită ✓",
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend error:", data);
      return NextResponse.json(
        { error: data.message ?? "Eroare la trimiterea emailului." },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("Send confirmation error:", err);
    return NextResponse.json(
      { error: "Eroare la trimiterea emailului de confirmare." },
      { status: 500 }
    );
  }
}
