// lib/demoLogin.js
import { getBrowserClient } from './supabaseBrowser';

// DEV-PHASE ONLY (Karum, 22 Nov 2026: "this is development phase, no sign up
// required"). One-tap demo entry: signs in as the shared Dave test user so
// anyone can view the full app without creating an account. The credentials
// are anon-key-equivalent — visible in the bundle by design; this is a
// throwaway test identity on a dev deployment, NOT a production pattern.
// Remove this file and its call sites before launch.
export const DEMO_EMAIL = 'karumsandhu+herbtest2@gmail.com';
export const DEMO_PASSWORD = 'herb-demo-2026';

export async function signInAsDemo() {
  const supabase = getBrowserClient();
  return supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
}
