-- ============================================================
--  WIPE ORDERS + STORAGE FILES
--  Rulează în Supabase Dashboard → SQL Editor
--
--  ⚠️  IRECUPERABIL! Fă întâi un backup:
--      Settings → Database → Backups → Download
--
--  Pași:
--   1. Rulează blocul DRY-RUN ca să vezi ce se va șterge.
--   2. Dacă ești sigur, rulează blocul DELETE.
-- ============================================================


-- ─────────────────────────────────────────────
-- 1) DRY-RUN: vezi ce ai în DB și în Storage
-- ─────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.orders) AS total_comenzi,
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'comenzi') AS total_fisiere_storage;

-- Detaliu pe comenzi (primele 50)
SELECT id, status, customer_email, total_price, created_at
FROM public.orders
ORDER BY created_at DESC
LIMIT 50;

-- Detaliu pe fișiere (primele 50)
SELECT name, created_at, (metadata->>'size')::bigint AS size_bytes
FROM storage.objects
WHERE bucket_id = 'comenzi'
ORDER BY created_at DESC
LIMIT 50;


-- ─────────────────────────────────────────────
-- 2) DELETE — rulează DOAR dacă rezultatul de mai sus e OK
-- ─────────────────────────────────────────────
-- Decomentează blocul de mai jos (selectează liniile și CTRL+/) și rulează.

-- BEGIN;
--
--   -- Șterge toate fișierele din bucket-ul "comenzi"
--   DELETE FROM storage.objects WHERE bucket_id = 'comenzi';
--
--   -- Șterge toate comenzile
--   DELETE FROM public.orders;
--
-- COMMIT;


-- ─────────────────────────────────────────────
-- 3) Verificare după ștergere (ar trebui să returneze 0, 0)
-- ─────────────────────────────────────────────
-- SELECT
--   (SELECT count(*) FROM public.orders) AS ramase_comenzi,
--   (SELECT count(*) FROM storage.objects WHERE bucket_id = 'comenzi') AS ramase_fisiere;
