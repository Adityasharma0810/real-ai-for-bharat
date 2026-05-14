import { supabase } from './supabase';

// Fix 1.9: Query admin_interview_view directly via Supabase client instead of
// calling the backend REST API. This respects row-level security and always
// returns the latest data from Supabase.
export async function getInterviewResults() {
  const { data, error } = await supabase
    .from('admin_interview_view')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch interviews: ${error.message}`);
  }

  return data ?? [];
}
