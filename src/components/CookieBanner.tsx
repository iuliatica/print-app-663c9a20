"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";

const COOKIE_CONSENT_KEY = "printica_cookie_consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
      if (!consent) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    try { localStorage.setItem(COOKIE_CONSENT_KEY, "accepted"); } catch { /* ignore */ }
    setVisible(false);
  };

  const decline = () => {
    try { localStorage.setItem(COOKIE_CONSENT_KEY, "declined"); } catch { /* ignore */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[90] p-4 sm:p-6 animate-[fade-in_0.4s_ease-out]">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-md p-5 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
            <Cookie className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900">Acest site folosește cookies</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Folosim cookie-uri <strong>strict necesare</strong> pentru autentificare și funcționarea
              site-ului, precum și <strong>stocare locală</strong> pentru a salva preferințele tale
              (date de livrare, metoda de plată). Nu folosim cookie-uri de marketing sau tracking.
              Află mai multe în{" "}
              <Link
                href="/legal/politica-cookies"
                className="font-medium text-cyan-600 underline underline-offset-2 hover:text-cyan-800"
              >
                Politica de cookies
              </Link>{" "}
              și{" "}
              <Link
                href="/legal/politica-confidentialitate"
                className="font-medium text-cyan-600 underline underline-offset-2 hover:text-cyan-800"
              >
                Politica de confidențialitate
              </Link>.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={accept}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 transition-colors"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={decline}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Doar esențiale
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={decline}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Închide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
