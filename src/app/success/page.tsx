"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Home, Loader2, AlertTriangle, FileText, Printer, Phone, Mail } from "lucide-react";

type FileInfo = {
  name: string;
  pages: number | null;
  printMode: "bw" | "color";
  duplex: boolean;
  copies: number;
};

type GroupInfo = {
  files: FileInfo[];
  spiralType?: string;
  spiralColor?: string;
  coverBackColor?: string;
};

const COVER_BACK_LABELS: Record<string, string> = {
  negru: "Negru",
  alb: "Alb",
  albastru_inchis: "Albastru închis",
  galben: "Galben",
  rosu: "Roșu",
  verde: "Verde",
};

type OrderDetails = {
  id: string;
  created_at: string;
  phone: string;
  customer_email: string;
  total_price: number;
  payment_method: string;
  status: string;
  config_details: {
    files?: FileInfo[];
    bindingGroupSizes?: number[];
    bindingOptions?: { spiralType?: string; spiralColor?: string; coverBackColor?: string }[];
    spiralType?: string;
    spiralColor?: string;
    coverBackColor?: string;
    deliveryMethod?: "curier" | "ridicare";
  } | null;
};

type VerifyResponse = {
  paid: boolean;
  payment_status: string;
  customer_email: string | null;
  amount_total: number | null;
  currency: string | null;
  order: OrderDetails | null;
  error?: string;
};

function formatPrice(bani: number) {
  return (bani / 100).toFixed(2).replace(".", ",") + " RON";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getGroups(order: OrderDetails): GroupInfo[] {
  const files = order.config_details?.files ?? [];
  const sizes = order.config_details?.bindingGroupSizes;
  const options = order.config_details?.bindingOptions;

  if (!sizes || sizes.length === 0) {
    return [{
      files,
      spiralType: order.config_details?.spiralType,
      spiralColor: order.config_details?.spiralColor,
      coverBackColor: order.config_details?.coverBackColor,
    }];
  }

  const groups: GroupInfo[] = [];
  let idx = 0;
  sizes.forEach((size, gIdx) => {
    groups.push({
      files: files.slice(idx, idx + size),
      spiralType: options?.[gIdx]?.spiralType ?? "none",
      spiralColor: options?.[gIdx]?.spiralColor,
      coverBackColor: options?.[gIdx]?.coverBackColor,
    });
    idx += size;
  });
  return groups;
}

const PICKUP_ADDRESS = "Alba Iulia, localitatea Barabant, strada Mureșului";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [state, setState] = useState<"loading" | "paid" | "unpaid" | "error">("loading");
  const [data, setData] = useState<VerifyResponse | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setState("error");
      return;
    }

    fetch(`/api/verify-payment?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((res: VerifyResponse) => {
        setData(res);
        if (res.error) setState("error");
        else if (res.paid) setState("paid");
        else setState("unpaid");
      })
      .catch(() => setState("error"));
  }, [sessionId]);

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-10 shadow-lg border border-slate-200/80">
          <Loader2 className="h-12 w-12 animate-spin text-cyan-600" />
          <p className="text-slate-600 font-medium">Se verifică plata…</p>
        </div>
      </div>
    );
  }

  if (state === "error" || state === "unpaid") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200/80 overflow-hidden">
          <div className="bg-amber-50 px-6 py-10 text-center">
            <AlertTriangle className="mx-auto h-16 w-16 text-amber-500" />
            <h1 className="mt-4 text-2xl font-bold text-slate-900">
              {state === "unpaid" ? "Plata nu a fost finalizată" : "Nu am putut verifica plata"}
            </h1>
            <p className="mt-3 text-slate-600">
              {state === "unpaid"
                ? "Sesiunea de plată nu a fost confirmată. Încearcă din nou."
                : "Link invalid sau eroare la verificare. Contactează-ne dacă ai efectuat plata."}
            </p>
          </div>
          <div className="px-6 py-6">
            <Link
              href="/"
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-800 py-3 font-semibold text-white hover:bg-slate-900 transition-colors"
            >
              <Home className="h-5 w-5" />
              Înapoi la pagina principală
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const order = data?.order;
  const groups = order ? getGroups(order) : [];
  const isPickup = order?.config_details?.deliveryMethod === "ridicare";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200/80 overflow-hidden">
        {/* Header */}
        <div className="bg-green-50 px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto h-20 w-20 text-green-600" />
          <h1 className="mt-5 text-2xl font-bold text-slate-900 sm:text-3xl">
            Mulțumim pentru comandă!
          </h1>
          <p className="mt-3 text-slate-700">Plata a fost confirmată cu succes.</p>
          {isPickup ? (
            <div className="mt-4 rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-3 text-left">
              <p className="text-sm font-semibold text-cyan-800">📍 Ridicare de la sediu</p>
              <p className="mt-1 text-xs text-cyan-700">{PICKUP_ADDRESS}</p>
              <p className="mt-1 text-xs text-cyan-700">📱 Vei fi informat prin mesaj când documentele sunt pregătite.</p>
              <p className="mt-0.5 text-xs text-cyan-700">⏰ Ai la dispoziție <strong>3 zile lucrătoare</strong> pentru ridicare.</p>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
              Livrarea se face în <strong>2-4 zile lucrătoare</strong>.
            </p>
          )}
        </div>

        {/* Detalii comandă */}
        <div className="px-6 py-6 space-y-5">
          {/* Sumă și email */}
          <div className="rounded-xl bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Total plătit</span>
              <span className="text-lg font-bold text-green-700">
                {data?.amount_total ? formatPrice(data.amount_total) : order ? `${order.total_price.toFixed(2).replace(".", ",")} RON` : "—"}
              </span>
            </div>

            {(data?.customer_email || order?.customer_email) && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="truncate">{data?.customer_email || order?.customer_email}</span>
              </div>
            )}

            {order?.phone && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                <span>{order.phone}</span>
              </div>
            )}

            {order?.created_at && (
              <div className="text-xs text-slate-400">
                Comandă plasată: {formatDate(order.created_at)}
              </div>
            )}
          </div>

          {/* Fișiere grupate cu legare */}
          {groups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              {groups.length > 1 && (
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Volum {gIdx + 1}
                </p>
              )}
              <div className="space-y-2">
                {group.files.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                    <Printer className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{f.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {f.pages ?? "?"} pag. · {f.printMode === "color" ? "Color" : "Alb-negru"}
                        {f.duplex ? " · Față-verso" : ""} · {f.copies} {f.copies === 1 ? "copie" : "copii"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Legare sub fișiere */}
              {group.spiralType && group.spiralType !== "none" && (
                <div className="rounded-lg bg-cyan-50 px-4 py-2.5 text-sm text-cyan-800">
                  🔗 Legare: <strong>
                    {group.spiralType === "spirala"
                      ? `Spirală ${group.spiralColor ?? "neagră"}`
                      : group.spiralType === "perforare2"
                      ? "Perforare cu 2 găuri"
                      : group.spiralType === "capsare"
                      ? "Capsare"
                      : group.spiralType}
                  </strong>
                  {group.spiralType === "spirala" && group.coverBackColor && (
                    <span> · Copertă spate: <strong>{COVER_BACK_LABELS[group.coverBackColor] ?? group.coverBackColor}</strong></span>
                  )}
                </div>
              )}
            </div>
          ))}

          <p className="text-sm text-slate-600 text-center">
            Veți primi un email de confirmare.
          </p>

          <Link
            href="/"
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-800 py-3 font-semibold text-white hover:bg-slate-900 transition-colors"
          >
            <Home className="h-5 w-5" />
            Înapoi la pagina principală
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white">
          <Loader2 className="h-12 w-12 animate-spin text-cyan-600" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
