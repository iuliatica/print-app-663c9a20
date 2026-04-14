-- Adaugă coloanele lipsă la tabela orders (cele folosite de API)
-- Rulează în SQL Editor în Supabase (Dashboard → SQL Editor)

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_price numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS config_details jsonb;

-- Fă coloanele vechi opționale (dacă există și au NOT NULL)
ALTER TABLE public.orders ALTER COLUMN total_pages DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN print_mode DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN duplex DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN spiral_type DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN file_names DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN total_amount_lei DROP NOT NULL;
