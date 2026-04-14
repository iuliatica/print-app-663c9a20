-- Adaugă coloana stripe_session_id la tabela orders
-- Rulează în SQL Editor în Supabase (Dashboard → SQL Editor)

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_session_id text;
