-- Adaugă coloanele awb_url și factura_url la tabela orders
-- Rulează în SQL Editor în Supabase (Dashboard → SQL Editor)

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS awb_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS factura_url text;
