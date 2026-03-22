import type { Metadata } from "next";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { ErrorBoundaryWrapper } from "@/components/ErrorBoundaryWrapper";
import { CookieBanner } from "@/components/CookieBanner";

export const metadata: Metadata = {
  title: "Printica | Printare online · Încarcă PDF · Plătește sigur",
  description: "Printica — Încarcă PDF-urile, alege opțiunile de printare și spirală, plătește rapid și sigur cu Stripe.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro">
      <body suppressHydrationWarning className="antialiased min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <ErrorBoundaryWrapper>
          <div className="flex-1 flex flex-col">{children}</div>
          <Footer />
          <CookieBanner />
        </ErrorBoundaryWrapper>
      </body>
    </html>
  );
}
