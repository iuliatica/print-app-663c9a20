-- Adaugă coloanele customer_name și shipping_address la tabela orders
-- Rulează în SQL Editor în Supabase (Dashboard → SQL Editor)

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_address text;
