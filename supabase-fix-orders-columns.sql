-- Adaugă coloanele lipsă la tabela orders (cele folosite de API)
-- Rulează în SQL Editor în Supabase (Dashboard → SQL Editor)

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_price numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS config_details jsonb;
