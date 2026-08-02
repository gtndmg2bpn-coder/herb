import { createClient } from '@supabase/supabase-js';

// Only the PUBLIC values are used here. The anon key is designed to be
// exposed to the client — the service-role key must NEVER appear in this app.
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.'
    );
  }

  return createClient(url, anonKey);
}
