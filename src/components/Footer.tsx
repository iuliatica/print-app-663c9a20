import Link from "next/link";

const ANPC_URL = "https://www.anpc.ro/";
const SOL_ODR_URL = "https://ec.europa.eu/consumers/odr";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50 py-6">
      <div className="mx-auto max-w-4xl px-4">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
          <Link
            href="/legal/termeni-si-conditii"
            className="hover:text-slate-900 underline-offset-2 hover:underline"
          >
            Termeni și condiții
          </Link>
          <Link
            href="/legal/politica-confidentialitate"
            className="hover:text-slate-900 underline-offset-2 hover:underline"
          >
            Politica de confidențialitate
          </Link>
          <Link
            href="/legal/politica-cookies"
            className="hover:text-slate-900 underline-offset-2 hover:underline"
          >
            Politica de cookies
          </Link>
          <a
            href={ANPC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 underline-offset-2 hover:underline"
          >
            ANPC
          </a>
          <a
            href={SOL_ODR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 underline-offset-2 hover:underline"
          >
            SOL (ODR)
          </a>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">
          Conform legislației româniei: link-uri către Autoritatea Națională pentru Protecția Consumatorilor (ANPC) și
          platforma de Soluționare Online a Litigiilor (SOL/ODR UE).
        </p>
      </div>
    </footer>
  );
}
