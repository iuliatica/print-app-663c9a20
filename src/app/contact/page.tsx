import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Phone, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact | Printica",
  description: "Contactează echipa Printica prin telefon sau email. Suntem aici să te ajutăm!",
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:py-20">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Înapoi la pagina principală
      </Link>

      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        Contactează-ne
      </h1>
      <p className="mt-3 text-base text-slate-600 sm:text-lg">
        Ai o întrebare sau ai nevoie de ajutor cu o comandă? Nu ezita să ne contactezi!
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {/* Phone */}
        <a
          href="tel:0778124553"
          className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-cyan-200 hover:shadow-md"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 transition-colors group-hover:bg-cyan-100">
            <Phone className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Telefon</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">0778 124 553</p>
            <p className="mt-1 text-xs text-slate-500">Luni – Vineri, 9:00 – 18:00</p>
          </div>
        </a>

        {/* Email */}
        <a
          href="mailto:contact@printica.ro"
          className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-cyan-200 hover:shadow-md"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 transition-colors group-hover:bg-cyan-100">
            <Mail className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Email</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">contact@printica.ro</p>
          </div>
        </a>
      </div>

      <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-lg font-semibold text-slate-800">Despre livrare</h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Comenzile sunt procesate și expediate prin curier în toată România. 
          Timpul estimat de livrare este de 2-4 zile lucrătoare de la confirmarea plății.
        </p>
      </div>
    </main>
  );
}
