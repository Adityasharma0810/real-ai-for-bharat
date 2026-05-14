import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.warn('[env] VITE_SUPABASE_URL is not set. Add it to frontend/dashboard/.env.');
}

if (!supabaseAnonKey) {
  console.warn('[env] VITE_SUPABASE_ANON_KEY is not set. Add it to frontend/dashboard/.env.');
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
