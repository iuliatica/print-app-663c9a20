/**
 * Email-uri de tip "lifecycle" trimise din webhook-ul Stripe.
 * Folosesc același template vizual ca emailul de confirmare comandă (Printica branding).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = "Printica <noreply@printica.ro>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://printica.ro";

export type LifecycleKind = "paid" | "failed" | "expired" | "canceled";

type LifecycleCopy = {
  subject: string;
  badge: { icon: string; label: string; bg: string; border: string; color: string };
  heading: string;
  message: string;
  cta?: { label: string; url: string };
  extraNote?: string;
};

function buildCopy(kind: LifecycleKind, ctaUrl?: string): LifecycleCopy {
  switch (kind) {
    case "paid":
      return {
        subject: "✅ Plata confirmată pentru comanda ta Printica",
        badge: {
          icon: "✓",
          label: "Plată confirmată",
          bg: "#ecfdf5",
          border: "#a7f3d0",
          color: "#065f46",
        },
        heading: "Bună! Avem vești bune 🎉",
        message:
          "Plata pentru comanda ta a fost procesată cu succes. Echipa noastră verifică acum fișierele tale și vom începe tipărirea imediat.",
        cta: { label: "Vizitează site-ul", url: SITE_URL },
      };
    case "failed":
      return {
        subject: "⚠️ Problemă cu plata comenzii tale",
        badge: {
          icon: "⚠",
          label: "Plată eșuată",
          bg: "#fef2f2",
          border: "#fecaca",
          color: "#991b1b",
        },
        heading: "Plata nu a putut fi procesată",
        message:
          "Se pare că plata nu a putut fi procesată. Nu îți face griji, fișierele tale sunt salvate și poți reîncerca plata folosind butonul de mai jos.",
        cta: ctaUrl
          ? { label: "Reîncearcă plata", url: ctaUrl }
          : { label: "Reîncearcă plata", url: SITE_URL },
      };
    case "expired":
      return {
        subject: "⏳ Mai ai nevoie de documentele tale printate?",
        badge: {
          icon: "⏳",
          label: "Comandă neterminată",
          bg: "#fffbeb",
          border: "#fde68a",
          color: "#92400e",
        },
        heading: "Coșul tău te așteaptă",
        message:
          "Am observat că ai lăsat o configurație de documente neterminată. Dacă ai întâmpinat dificultăți tehnice sau ai întrebări, te rog să ne contactezi la adresa de email contact@printica.ro sau la numărul de telefon 0778 124 553.",
        cta: { label: "Finalizează comanda", url: SITE_URL },
      };
    case "canceled":
      return {
        subject: "Confirmare anulare comandă",
        badge: {
          icon: "✕",
          label: "Comandă anulată",
          bg: "#f1f5f9",
          border: "#cbd5e1",
          color: "#475569",
        },
        heading: "Comanda ta a fost anulată",
        message:
          "Comanda ta a fost anulată conform solicitării. Te așteptăm înapoi oricând ai nevoie de printuri de calitate.",
      };
  }
}

function buildHtml(customerName: string | null | undefined, copy: LifecycleCopy): string {
  const greeting = customerName ? `Salut, ${customerName}!` : "Salut!";
  const ctaHtml = copy.cta
    ? `
    <div style="text-align:center;margin:8px 0 24px;">
      <a href="${copy.cta.url}"
         style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#0ea5a0,#10b981);color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:10px;">
        ${copy.cta.label}
      </a>
    </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#06b6d4,#0ea5a0,#10b981);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Printica</h1>
            <p style="margin:8px 0 0;font-size:14px;color:#bfdbfe;">Servicii de printare profesionale</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;">${greeting}</h2>
            <h3 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#334155;">${copy.heading}</h3>

            <div style="background-color:${copy.badge.bg};border:1px solid ${copy.badge.border};border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center;">
              <span style="font-size:24px;color:${copy.badge.color};">${copy.badge.icon}</span>
              <p style="margin:8px 0 0;font-size:16px;font-weight:700;color:${copy.badge.color};">${copy.badge.label}</p>
            </div>

            <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
              ${copy.message}
            </p>

            ${ctaHtml}

            <p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">
              Dacă ai întrebări, ne poți scrie la <a href="mailto:contact@printica.ro" style="color:#0ea5a0;text-decoration:underline;">contact@printica.ro</a> sau ne poți suna la <a href="tel:+40778124553" style="color:#0ea5a0;text-decoration:underline;">0778 124 553</a>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:13px;color:#94a3b8;">Printica</p>
            <p style="margin:4px 0 0;font-size:12px;color:#cbd5e1;">Acest email a fost trimis automat. Nu răspunde la acest mesaj.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendLifecycleEmail(params: {
  to: string;
  customerName?: string | null;
  kind: LifecycleKind;
  /** URL pentru retry la plată (folosit pentru "failed" și "expired" dacă e disponibil). */
  retryUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn("[lifecycle-emails] RESEND_API_KEY lipsă – emailul nu a fost trimis.");
    return { ok: false, error: "RESEND_API_KEY missing" };
  }
  if (!params.to) {
    return { ok: false, error: "Destinatar lipsă" };
  }

  const copy = buildCopy(params.kind, params.retryUrl);
  const html = buildHtml(params.customerName ?? null, copy);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [params.to],
        subject: copy.subject,
        html,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("[lifecycle-emails] Resend error:", res.status, data);
      return { ok: false, error: `Resend ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[lifecycle-emails] Send error:", err);
    return { ok: false, error: "Network error" };
  }
}
