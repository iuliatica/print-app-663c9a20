"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase-client";
import { Loader2 } from "lucide-react";

/** Parse URL hash fragment into key-value map (Supabase pune token-urile aici la redirect). */
function parseHash(hash: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!hash || !hash.startsWith("#")) return params;
  const part = hash.slice(1);
  part.split("&").forEach((pair) => {
    const [key, value] = pair.split("=").map(decodeURIComponent);
    if (key && value) params[key] = value;
  });
  return params;
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"verifying" | "set-password" | "done" | "error">("verifying");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const verified = useRef(false);

  const tokenHash = searchParams.get("token_hash");
  const typeQuery = searchParams.get("type");

  useEffect(() => {
    if (verified.current) return;
    const supabase = getSupabaseClient();

    const succeed = () => {
      verified.current = true;
      setStep("set-password");
      if (typeof window !== "undefined" && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };

    const fail = (msg: string) => {
      setError(msg);
      setStep("error");
    };

    // 1) Token în hash (implicit flow) – Supabase redirectează cu #access_token=...&refresh_token=...&type=recovery
    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = parseHash(window.location.hash);
      const accessToken = hashParams.access_token;
      const refreshToken = hashParams.refresh_token;
      const typeHash = hashParams.type;
      if (typeHash === "recovery" && accessToken && refreshToken) {
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ error: sessionError }) => {
            if (sessionError) {
              fail(sessionError.message || "Link invalid sau expirat.");
              return;
            }
            succeed();
          })
          .catch(() => fail("Eroare la verificare. Încearcă din nou."));
        return;
      }
    }

    // 2) Token în query (PKCE / token_hash)
    if (tokenHash && typeQuery === "recovery") {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: "recovery" })
        .then(({ error: verifyError }) => {
          if (verifyError) {
            fail(verifyError.message || "Link invalid sau expirat.");
            return;
          }
          succeed();
        })
        .catch(() => fail("Eroare la verificare. Încearcă din nou."));
      return;
    }

    fail("Link invalid sau expirat. Solicită din nou resetarea parolei.");
  }, [tokenHash, typeQuery]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Parola trebuie să aibă cel puțin 6 caractere.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Parolele nu coincid.");
      return;
    }
    setIsSubmitting(true);
    try {
      const supabase = getSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setStep("done");
      setTimeout(() => router.replace("/login"), 2000);
    } catch {
      setError("Eroare la actualizarea parolei.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "verifying") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-4">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-8 shadow-lg">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" aria-hidden />
          <p className="text-slate-600">Verificare link...</p>
        </div>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg">
          <h1 className="text-xl font-bold text-slate-800">Link invalid</h1>
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
          <p className="mt-4 text-sm text-slate-600">
            Mergi la{" "}
            <a href="/login" className="font-medium text-blue-600 underline hover:no-underline">
              Login
            </a>{" "}
            și apasă „Ai uitat parola?” pentru un link nou.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Dacă linkul expiră imediat, adaugă în Supabase (Authentication → URL Configuration) URL-ul de redirect:{" "}
            <code className="rounded bg-slate-100 px-1">{typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "/auth/callback"}</code>
          </p>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg text-center">
          <h1 className="text-xl font-bold text-slate-800">Parola a fost actualizată</h1>
          <p className="mt-2 text-sm text-slate-600">Ești redirecționat la login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg sm:p-8">
        <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">Parolă nouă</h1>
        <p className="mt-1 text-sm text-slate-500">Alege o parolă de cel puțin 6 caractere.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSetPassword}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Parolă nouă</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="••••••••"
              minLength={6}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Confirmă parola</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="••••••••"
              minLength={6}
            />
          </label>
          {error && (
            <p className="text-sm font-medium text-red-600" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
            Setează parola
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" aria-hidden />
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
