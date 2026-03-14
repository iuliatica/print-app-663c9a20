-- Rulează în SQL Editor în Supabase (Dashboard → SQL Editor) pentru a crea tabela orders.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',
  total_pages integer not null,
  print_mode text not null,
  duplex boolean not null default false,
  spiral_type text not null,
  spiral_color text,
  cover_color text,
  file_names jsonb not null default '[]',
  total_amount_lei numeric not null,
  payment_method text not null default 'stripe',
  shipping_name text,
  shipping_phone text,
  shipping_email text,
  shipping_address text,
  stripe_session_id text,
  created_at timestamptz not null default now()
);

-- Dacă ai creat deja tabela fără aceste coloane, rulează în SQL Editor:
/*
alter table public.orders add column if not exists payment_method text default 'stripe';
alter table public.orders add column if not exists shipping_name text;
alter table public.orders add column if not exists shipping_phone text;
alter table public.orders add column if not exists shipping_email text;
alter table public.orders add column if not exists shipping_address text;
*/

-- Opțional: enable RLS și policy pentru service role (inserări din API)
alter table public.orders enable row level security;

create policy "Service role can do anything on orders"
  on public.orders
  for all
  using (true)
  with check (true);
