"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase-client";
import { Loader2 } from "lucide-react";

function isAdmin(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }): boolean {
  const role = user?.app_metadata?.role ?? user?.user_metadata?.role;
  return role === "admin";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoadingLogin, setIsLoadingLogin] = useState(false);
  const [isLoadingSignUp, setIsLoadingSignUp] = useState(false);
  const [isLoadingForgot, setIsLoadingForgot] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!email.trim() || !password) {
      setError("Te rugăm completează emailul și parola.");
      return;
    }
    setIsLoadingLogin(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) {
        const msg = signInError.message || "";
        if (msg.toLowerCase().includes("invalid") && msg.toLowerCase().includes("credentials")) {
          setError("Email sau parolă greșită. Verifică datele sau folosește „Ai uitat parola?”.");
        } else {
          setError(signInError.message);
        }
        return;
      }
      if (data.session || data.user) {
        await supabase.auth.getSession();
        if (typeof window !== "undefined") {
          window.location.assign("/admin-comenzi");
          return;
        }
        router.replace("/admin-comenzi");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "A apărut o problemă la autentificare. Încearcă din nou.");
    } finally {
      setIsLoadingLogin(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError("Introdu adresa de email pentru a primi linkul de resetare.");
      return;
    }
    setIsLoadingForgot(true);
    try {
      const supabase = getSupabaseClient();
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "";
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setMessage("Verifică-ți emailul – ți-am trimis un link pentru resetarea parolei.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la trimitere.");
    } finally {
      setIsLoadingForgot(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!email.trim() || !password) {
      setError("Completează emailul și parola.");
      return;
    }
    if (password.length < 6) {
      setError("Parola trebuie să aibă cel puțin 6 caractere.");
      return;
    }
    setIsLoadingSignUp(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.user && !data.session) {
        setMessage("Cont creat. Verifică emailul pentru confirmare (dacă este activată).");
      } else if (data.session) {
        router.replace("/admin-comenzi");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la înregistrare.");
    } finally {
      setIsLoadingSignUp(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg sm:p-8">
        <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">Autentificare</h1>
        <p className="mt-1 text-sm text-slate-500">Introdu emailul și parola</p>

        <form className="mt-6 space-y-4" onSubmit={handleLogin}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="tu@email.com"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Parolă</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={isLoadingForgot || isLoadingLogin || isLoadingSignUp}
              className="mt-1.5 text-sm font-medium text-blue-600 hover:underline disabled:opacity-50"
            >
              {isLoadingForgot ? "Se trimite…" : "Ai uitat parola?"}
            </button>
          </label>

          {error && (
            <p className="text-sm font-medium text-red-600" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="text-sm font-medium text-green-700" role="status">
              {message}
            </p>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              disabled={isLoadingLogin || isLoadingSignUp || isLoadingForgot}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoadingLogin ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : null}
              Login
            </button>
            <button
              type="button"
              onClick={handleSignUp}
              disabled={isLoadingLogin || isLoadingSignUp || isLoadingForgot}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isLoadingSignUp ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : null}
              Sign Up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
