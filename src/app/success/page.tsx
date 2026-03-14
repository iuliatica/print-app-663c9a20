import Link from "next/link";
import { CheckCircle2, Home } from "lucide-react";

export default function SuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200/80 overflow-hidden">
        <div className="bg-green-50 px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto h-20 w-20 text-green-600" />
          <h1 className="mt-5 text-2xl font-bold text-slate-900 sm:text-3xl">
            Mulțumim pentru comandă!
          </h1>
          <p className="mt-3 text-slate-700">
            Plata a fost efectuată cu succes. Comanda a fost înregistrată.
          </p>
          <p className="mt-4 rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
            Livrarea se face în <strong>3 zile lucrătoare</strong>.
          </p>
        </div>
        <div className="px-6 py-6 space-y-4">
          <p className="text-sm text-slate-600 text-center">
            Veți primi un email de confirmare. Coletul va fi livrat la adresa indicată.
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
