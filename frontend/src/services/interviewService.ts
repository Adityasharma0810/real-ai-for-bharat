/**
 * Interview Service
 *
 * All API calls to the AI SkillFit backend live here.
 * Base URL and API key are read from environment config — never hardcoded.
 */

import { ENV } from '../config/env';

export class ResultNotReadyError extends Error {
  constructor() {
    super('Result not ready yet.');
    this.name = 'ResultNotReadyError';
    Object.setPrototypeOf(this, ResultNotReadyError.prototype);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StartInterviewPayload {
  user_id?: string;
  candidate_name: string;
  trade: string;
  phone_number: string;
  email: string;
  job_id?: string;
}

export interface StartInterviewResponse {
  /** LiveKit participant token */
  token: string;
  /** LiveKit room name */
  room: string;
  /** LiveKit server WebSocket URL, e.g. wss://your-livekit-host.livekit.cloud */
  url: string;
}

export interface InterviewResult {
  id: string;
  candidate_name: string;
  phone_number: string;
  trade: string;
  language: string;
  district: string | null;
  category: string;
  fitment: string;
  average_score: number;
  confidence_score: number | null;
  integrity_flag: boolean;
  scores: number[];
  weak_topics: string[];
  feedback: { strengths: string[]; improvements: string[] } | null;
  transcript: { role: string; content: string }[] | null;
  interview_date: string;
}

export interface BlockCandidatePayload {
  user_id: string;
  job_id?: string;
  company_id?: string;
  livekit_room?: string;
  reason: string;
}

export interface BlockedCandidate {
  id: string;
  company_id: string;
  user_id: string;
  reason: string;
  created_at: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * POST /start-interview
 * Creates a LiveKit room, dispatches Priya, and returns connection credentials.
 */
export async function startInterview(
  payload: StartInterviewPayload
): Promise<StartInterviewResponse> {
  const url = `${ENV.BACKEND_URL}/start-interview`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': ENV.BACKEND_API_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    throw new Error(
      'Could not reach the server. Please check your internet connection and try again.'
    );
  }

  if (!response.ok) {
    let detail = `Server error (${response.status})`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(detail);
  }

  const data = await response.json();
  return data as StartInterviewResponse;
}

/**
 * GET /results?trade=<optional>
 * Fetches interview results, optionally filtered by trade.
 */
export async function getResults(trade?: string): Promise<InterviewResult[]> {
  const params = trade ? `?trade=${encodeURIComponent(trade)}` : '';
  const url = `${ENV.BACKEND_URL}/results${params}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': ENV.BACKEND_API_KEY },
    });
  } catch {
    throw new Error('Could not reach the server. Please check your internet connection and try again.');
  }

  if (!response.ok) throw new Error(`Failed to fetch results (${response.status})`);
  return response.json() as Promise<InterviewResult[]>;
}

export async function getCandidateResults(params: {
  userId?: string;
  phoneNumber?: string;
}): Promise<InterviewResult[]> {
  const fetchBy = async (key: 'user_id' | 'phone', value: string) => {
    const query = new URLSearchParams([[key, value]]);
    const url = `${ENV.BACKEND_URL}/results?${query.toString()}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { 'X-API-Key': ENV.BACKEND_API_KEY },
      });
    } catch {
      throw new Error('Could not reach the server. Please check your internet connection and try again.');
    }

    if (!response.ok) throw new Error(`Failed to fetch candidate results (${response.status})`);
    return response.json() as Promise<InterviewResult[]>;
  };

  if (params.userId) {
    const byUser = await fetchBy('user_id', params.userId);
    if (byUser.length > 0 || !params.phoneNumber) return byUser;
  }

  if (params.phoneNumber) return fetchBy('phone', params.phoneNumber);
  return [];
}

/**
 * GET /results/latest?phone=<number>&after=<ISO>
 * Returns the most recent interview result.
 * Primary method used after an interview ends — no name matching needed.
 */
export async function getLatestResult(
  phoneNumber: string,
  afterTimestamp: string,
  email?: string
): Promise<InterviewResult> {
  const params = new URLSearchParams();
  if (phoneNumber) params.set('phone', phoneNumber);
  if (afterTimestamp) params.set('after', afterTimestamp);
  if (email) params.set('email', email);
  const url = `${ENV.BACKEND_URL}/results/latest?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': ENV.BACKEND_API_KEY },
    });
  } catch {
    throw new Error('Could not reach the server.');
  }

  if (response.status === 202) throw new ResultNotReadyError();

  if (!response.ok) {
    if (response.status === 404) throw new ResultNotReadyError();
    throw new Error(`Failed to fetch result (${response.status})`);
  }
  return response.json() as Promise<InterviewResult>;
}

/**
 * GET /results/by-name/:name?after=ISO_TIMESTAMP
 * Fallback lookup by candidate name.
 */
export async function getResultByName(
  candidateName: string,
  afterTimestamp?: string
): Promise<InterviewResult> {
  const params = afterTimestamp ? `?after=${encodeURIComponent(afterTimestamp)}` : '';
  const url = `${ENV.BACKEND_URL}/results/by-name/${encodeURIComponent(candidateName)}${params}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': ENV.BACKEND_API_KEY },
    });
  } catch {
    throw new Error('Could not reach the server. Please check your internet connection.');
  }

  if (!response.ok) {
    if (response.status === 404) throw new Error('Result not ready yet.');
    throw new Error(`Failed to fetch result (${response.status})`);
  }
  return response.json() as Promise<InterviewResult>;
}

/**
 * GET /results/candidate/by-email/:email?after=ISO_TIMESTAMP
 * Primary lookup — email is unique and always filled.
 */
export async function getResultByEmail(
  email: string,
  afterTimestamp?: string
): Promise<InterviewResult> {
  const params = afterTimestamp ? `?after=${encodeURIComponent(afterTimestamp)}` : '';
  const url = `${ENV.BACKEND_URL}/results/candidate/by-email/${encodeURIComponent(email)}${params}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': ENV.BACKEND_API_KEY },
    });
  } catch {
    throw new Error('Could not reach the server.');
  }

  if (!response.ok) {
    if (response.status === 404) throw new Error('Result not ready yet.');
    throw new Error(`Failed to fetch result (${response.status})`);
  }
  return response.json() as Promise<InterviewResult>;
}

export async function getBackendHealth(): Promise<{ status: string; service: string; db: string }> {
  const url = `${ENV.BACKEND_URL}/health`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': ENV.BACKEND_API_KEY },
    });
  } catch {
    throw new Error('Could not reach the backend health endpoint.');
  }

  if (!response.ok) throw new Error(`Backend health check failed (${response.status})`);
  return response.json();
}

export async function updateInterviewAdminStatus(
  interviewId: string,
  adminStatus: string | null
): Promise<InterviewResult> {
  const url = `${ENV.BACKEND_URL}/results/${encodeURIComponent(interviewId)}/admin-status`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': ENV.BACKEND_API_KEY,
      },
      body: JSON.stringify({ admin_status: adminStatus }),
    });
  } catch {
    throw new Error('Could not reach the backend.');
  }

  if (!response.ok) throw new Error(`Failed to update interview status (${response.status})`);
  return response.json() as Promise<InterviewResult>;
}

export async function blockCandidate(payload: BlockCandidatePayload): Promise<any> {
  // Fix 1.11 + 1.12: Insert directly into the blocked_candidates Supabase table
  // instead of routing through the backend REST API. Also resolve company_id from
  // the jobs table when a job_id is provided.
  const { supabase } = await import('../services/supabase/config');

  // Resolve company_id from the jobs table if we have a job_id
  let resolvedCompanyId: string | null = payload.company_id ?? null;
  if (!resolvedCompanyId && payload.job_id) {
    try {
      const { data: jobData } = await supabase
        .from('jobs')
        .select('company_id')
        .eq('id', payload.job_id)
        .single();
      if (jobData?.company_id) resolvedCompanyId = jobData.company_id;
    } catch {
      // company_id will remain null — acceptable fallback
    }
  }

  const { data, error } = await supabase
    .from('blocked_candidates')
    .insert({
      user_id: payload.user_id,
      company_id: resolvedCompanyId,
      reason: payload.reason,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to block candidate: ${error.message}`);
  }

  return data;
}

export async function getBlockedCandidates(params?: {
  companyId?: string;
  userId?: string;
}): Promise<BlockedCandidate[]> {
  const query = new URLSearchParams();
  if (params?.companyId) query.set('company_id', params.companyId);
  if (params?.userId) query.set('user_id', params.userId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const url = `${ENV.BACKEND_URL}/blocked-candidates${suffix}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': ENV.BACKEND_API_KEY },
    });
  } catch {
    throw new Error('Could not reach the backend.');
  }

  if (!response.ok) throw new Error(`Failed to fetch blocked candidates (${response.status})`);
  return response.json() as Promise<BlockedCandidate[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transcript saving
// ─────────────────────────────────────────────────────────────────────────────

export interface TranscriptEntry {
  id: string;
  speaker: 'assistant' | 'user';
  text: string;
  timestamp: number;
}

/**
 * Save the full interview transcript to the `interviews` table in Supabase.
 * Matches the row by livekit_room (set when the interview starts).
 * Falls back to matching by user_id + most recent row if room is unavailable.
 */
export async function saveTranscriptToSupabase(
  livekitRoom: string,
  transcript: TranscriptEntry[],
  userId?: string,
): Promise<void> {
  if (!transcript || transcript.length === 0) return;

  const { supabase } = await import('../services/supabase/config');

  // Format transcript as plain text for easy reading in admin panel
  const transcriptText = transcript
    .map((msg) => {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      const speaker = msg.speaker === 'assistant' ? 'Priya (AI)' : 'Candidate';
      return `[${time}] ${speaker}: ${msg.text}`;
    })
    .join('\n');

  // Also keep the structured JSON version
  const transcriptJson = transcript.map((msg) => ({
    role: msg.speaker === 'assistant' ? 'assistant' : 'user',
    content: msg.text,
    timestamp: msg.timestamp,
  }));

  let updateError: any = null;

  // Primary: match by livekit_room
  if (livekitRoom) {
    const { error } = await supabase
      .from('interviews')
      .update({
        transcript: transcriptJson,
        transcript_text: transcriptText,
      })
      .eq('livekit_room', livekitRoom);
    updateError = error;
  }

  // Fallback: match by user_id, most recent interview
  if ((updateError || !livekitRoom) && userId) {
    const { error } = await supabase
      .from('interviews')
      .update({
        transcript: transcriptJson,
        transcript_text: transcriptText,
      })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    updateError = error;
  }

  if (updateError) {
    console.warn('[Transcript] Failed to save transcript to Supabase:', updateError.message);
  } else {
    console.log('[Transcript] Saved successfully.');
  }
}
