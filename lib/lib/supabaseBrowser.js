// lib/supabaseBrowser.js
import { createClient } from '@supabase/supabase-js';

let client; // module-level singleton

// KIMI NOTE: the singleton is deliberate — one GoTrueClient so the session is shared
// across pages. detectSessionInUrl lets a user returning from an email-confirmation
// link get signed in automatically.
export function getBrowserClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}
