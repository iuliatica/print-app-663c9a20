

## Fix URL Supabase invalid — toate fișierele afectate

### Problemă
`NEXT_PUBLIC_SUPABASE_URL` nu e disponibilă la runtime în unele contexte, iar `createClient()` primește `undefined`, cauzând eroarea `Invalid supabaseUrl`.

### Fișiere de actualizat

**3. `src/app/api/upload/route.ts`**
Adaug fallback la verificarea `supabaseUrl` (linia ~17 unde se citește variabila).

**4. `src/app/api/admin/download/route.ts`**
Adaug fallback la `supabaseUrl` folosit pentru comparația cu URL-ul de storage.

Aceste modificări sunt consistente cu pattern-ul deja existent în `supabase-server.ts` și `supabase-client.ts`.

