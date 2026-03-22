-- Tabel pentru emailurile de admin (înlocuiește emailul hardcodat din cod)
CREATE TABLE IF NOT EXISTS public.admin_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Dezactivează RLS (doar service role key accesează acest tabel)
ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

-- Nu adăugăm politici publice – doar service_role poate citi/scrie.

-- Inserează emailurile de admin
INSERT INTO public.admin_emails (email) VALUES
  ('iulia.tica05@gmail.com'),
  ('printicaalba@gmail.com')
ON CONFLICT (email) DO NOTHING;
