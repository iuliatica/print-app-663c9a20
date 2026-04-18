#!/usr/bin/env node
/**
 * scripts/wipe-orders.mjs
 *
 * Șterge TOATE comenzile din tabela `orders` și TOATE fișierele asociate
 * din Supabase Storage (bucket-ul configurat în SUPABASE_STORAGE_BUCKET,
 * default "comenzi").
 *
 * Mod de utilizare:
 *   node scripts/wipe-orders.mjs              # DRY-RUN: doar listează ce ar șterge
 *   node scripts/wipe-orders.mjs --confirm    # ȘTERGE EFECTIV (irecuperabil!)
 *
 * Variabile de mediu necesare (le ai deja în .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY    (NU anon key — service role bypass-ează RLS)
 *   SUPABASE_STORAGE_BUCKET      (opțional, default "comenzi")
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Încarcă manual .env.local dacă există (fără dependențe externe)
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "comenzi";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Lipsesc NEXT_PUBLIC_SUPABASE_URL sau SUPABASE_SERVICE_ROLE_KEY în .env.local");
  process.exit(1);
}

const CONFIRM = process.argv.includes("--confirm");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Extrage path-ul din URL-ul public Supabase Storage. */
function getStoragePath(publicUrl) {
  if (!publicUrl || typeof publicUrl !== "string") return null;
  try {
    const url = new URL(publicUrl);
    const match = url.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** Adună toate path-urile dintr-o comandă (file_url JSON sau string + awb_url + factura_url). */
function collectPaths(order) {
  const paths = [];
  if (order.file_url) {
    try {
      const parsed = JSON.parse(order.file_url);
      if (Array.isArray(parsed)) {
        for (const u of parsed) {
          const p = getStoragePath(u);
          if (p) paths.push(p);
        }
      } else {
        const p = getStoragePath(order.file_url);
        if (p) paths.push(p);
      }
    } catch {
      const p = getStoragePath(order.file_url);
      if (p) paths.push(p);
    }
  }
  if (order.awb_url) {
    const p = getStoragePath(order.awb_url);
    if (p) paths.push(p);
  }
  if (order.factura_url) {
    const p = getStoragePath(order.factura_url);
    if (p) paths.push(p);
  }
  return paths;
}

async function main() {
  console.log("─".repeat(60));
  console.log(`📦 Bucket Storage: ${BUCKET}`);
  console.log(`🌐 Supabase URL:  ${SUPABASE_URL}`);
  console.log(`🚦 Mod:           ${CONFIRM ? "⚠️  ȘTERGERE REALĂ" : "🔍 DRY-RUN (nu se șterge nimic)"}`);
  console.log("─".repeat(60));

  // 1. Citește toate comenzile (paginated)
  const { data: orders, error: fetchErr } = await supabase
    .from("orders")
    .select("id, file_url, awb_url, factura_url, status, created_at");

  if (fetchErr) {
    console.error("❌ Eroare la citirea comenzilor:", fetchErr.message);
    process.exit(1);
  }

  console.log(`\n📋 Comenzi găsite: ${orders.length}`);
  if (orders.length === 0) {
    console.log("✅ Nimic de șters. Tabela e deja goală.");
    return;
  }

  const allPaths = [];
  for (const o of orders) {
    const paths = collectPaths(o);
    allPaths.push(...paths);
    console.log(
      `  • ${o.id.slice(0, 8)}… [${o.status ?? "?"}] ${o.created_at?.slice(0, 10) ?? ""} — ${paths.length} fișier(e)`,
    );
  }

  console.log(`\n📁 Fișiere de șters din Storage: ${allPaths.length}`);

  // 2. Listează și fișierele orfane direct din bucket (root + subfoldere de 1 nivel)
  const orphans = [];
  const { data: rootList } = await supabase.storage.from(BUCKET).list("", { limit: 1000 });
  for (const item of rootList ?? []) {
    if (item.id) {
      // este fișier la rădăcină
      if (!allPaths.includes(item.name)) orphans.push(item.name);
    } else {
      // folder
      const { data: subList } = await supabase.storage.from(BUCKET).list(item.name, { limit: 1000 });
      for (const sub of subList ?? []) {
        const fullPath = `${item.name}/${sub.name}`;
        if (!allPaths.includes(fullPath)) orphans.push(fullPath);
      }
    }
  }
  if (orphans.length > 0) {
    console.log(`📁 Fișiere orfane în bucket (nereferite de comenzi): ${orphans.length}`);
  }

  if (!CONFIRM) {
    console.log("\n🔍 DRY-RUN terminat. Pentru a șterge efectiv, rulează:");
    console.log("    node scripts/wipe-orders.mjs --confirm");
    return;
  }

  // 3. Șterge fișierele (în batch-uri de 100)
  const allFilesToDelete = [...new Set([...allPaths, ...orphans])];
  let deletedFiles = 0;
  for (let i = 0; i < allFilesToDelete.length; i += 100) {
    const batch = allFilesToDelete.slice(i, i + 100);
    const { error: delErr } = await supabase.storage.from(BUCKET).remove(batch);
    if (delErr) {
      console.error(`⚠️  Eroare la ștergerea batch ${i}-${i + batch.length}:`, delErr.message);
    } else {
      deletedFiles += batch.length;
    }
  }
  console.log(`\n🗑️  Fișiere șterse: ${deletedFiles}/${allFilesToDelete.length}`);

  // 4. Șterge toate rândurile din `orders`
  const { error: deleteErr, count } = await supabase
    .from("orders")
    .delete({ count: "exact" })
    .not("id", "is", null);

  if (deleteErr) {
    console.error("❌ Eroare la ștergerea comenzilor:", deleteErr.message);
    process.exit(1);
  }

  console.log(`🗑️  Comenzi șterse din DB: ${count ?? orders.length}`);
  console.log("\n✅ Wipe complet.");
}

main().catch((err) => {
  console.error("❌ Eroare neașteptată:", err);
  process.exit(1);
});
