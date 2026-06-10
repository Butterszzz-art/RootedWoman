// ─── SUPABASE CONFIGURATION ───────────────────────────────────────────────────
//
// Fill in your project credentials below.
// Find them at: https://app.supabase.com → your project → Settings → API
//
// After setting credentials, run schema.sql in the Supabase SQL Editor.
// Create a Storage bucket named "client-photos" (public: false).
//
const SUPABASE_URL  = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON = 'YOUR-ANON-PUBLIC-KEY';

// ─── DO NOT EDIT BELOW THIS LINE ─────────────────────────────────────────────
const _sbConfigured = (
  !SUPABASE_URL.includes('YOUR') &&
  !SUPABASE_ANON.includes('YOUR') &&
  SUPABASE_URL.startsWith('https://')
);

if (!_sbConfigured) {
  console.warn(
    '[Supabase] Placeholder credentials detected.\n' +
    'Open supabase.js and replace SUPABASE_URL and SUPABASE_ANON with your real project values.\n' +
    'The app runs in offline/localStorage mode until credentials are set.'
  );
}

let sb = null;

try {
  if (_sbConfigured && window.supabase?.createClient) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
} catch (e) {
  console.error('[Supabase] Init error:', e);
}

// Convenience: run a Supabase call, returns null on any failure or if not configured.
async function sbCall(fn) {
  if (!sb) return null;
  try { return await fn(sb); }
  catch (e) { console.warn('[Supabase]', e); return null; }
}
