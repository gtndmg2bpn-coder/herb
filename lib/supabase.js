import { createClient } from '@supabase/supabase-js';

// Only the PUBLIC values are used here. The anon key is designed to be
// exposed to the client — the service-role key must NEVER appear in this app.
//
// Server components call this. Next 14 caches every fetch() a server component
// makes unless told otherwise, which is how a recipe page came to show a cost
// from before the pantry change while the homepage showed today's. Every read
// goes to the database: cache: 'no-store'.
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.'
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}
