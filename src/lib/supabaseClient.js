import { createClient } from '@supabase/supabase-js';

// Vite inlines VITE_* at build time, so a build that ran without them ships a
// bundle where these are literally `undefined`. supabase-js then throws
// "supabaseUrl is required." from this module — which every page imports — and
// the app renders a blank white page that says nothing about the real cause.
// Name the missing variable instead.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missing = [
  !url && 'VITE_SUPABASE_URL',
  !anonKey && 'VITE_SUPABASE_ANON_KEY'
].filter(Boolean);

if (missing.length) {
  throw new Error(
    `Missing ${missing.join(' and ')} at build time. Set ${missing.length > 1 ? 'them' : 'it'} ` +
    'in the environment that runs `vite build` — locally in .env.local, on Cloudflare under ' +
    'Settings → Build → Variables and secrets — then rebuild.'
  );
}

export const supabase = createClient(url, anonKey);
