-- Adaugă coloana files_deleted_at la tabela orders
-- Marchează momentul când fișierele au fost șterse automat (după 30 de zile)
-- Rulează în SQL Editor în Supabase (Dashboard → SQL Editor)

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS files_deleted_at timestamptz;
