# Bugfix Requirements Document

## Introduction

This document covers two related bugs in the frontend application:

**Bug 1 — Supabase Connectivity Gaps:** Several frontend components and screens interact with Supabase using incorrect table names, missing columns, or wrong query patterns that do not match the actual database schema. This causes silent data loss, incorrect data display, or failed writes that are swallowed without surfacing errors to the user.

**Bug 2 — 5-Flag Blocking Logic Incomplete:** During an interview, the proctoring system counts integrity flags (camera violations, OCR failures). When the count reaches 5, the system is supposed to block the candidate by writing a record to the `blocked_candidates` table and immediately terminate the interview. Currently, the `blockCandidate` call routes through the backend REST API (`/blocked-candidates`) instead of writing directly to Supabase, the `company_id` field is never populated in the payload, and the interview termination does not reliably fire on exactly the 5th flag — it can fire multiple times or be skipped due to a race condition in the `useEffect` dependency chain.

---

## Bug Analysis

### Current Behavior (Defect)

**Supabase Connectivity Issues:**

1.1 WHEN the `HistoryScreen` fetches interview history THEN the system queries the backend REST API (`/results`) for interview data instead of reading directly from the `interviews` table in Supabase, causing the `admin_status` column (which only exists in Supabase) to always be `null` in the displayed history cards.

1.2 WHEN the `HistoryScreen` joins applications with jobs THEN the system uses `.select('job_id, status, jobs(id, title, companies(company_name))')` which omits the `updated_at` column from `applications` and does not join `companies.logo_url`, causing incomplete data to be returned.

1.3 WHEN the `HomeScreen` loads candidate stats THEN the system calls the backend REST API (`getCandidateResults`) instead of querying the `interviews` table directly in Supabase, so stats do not reflect the latest Supabase state and ignore the `integrity_flag` column entirely.

1.4 WHEN the `InterviewIntroScreen` fetches a job's trade THEN the system queries `jobs` with `.select('trade')` but does not select `language` or `district` columns, so the interview is started without the job's preferred language or district context even though those columns exist on the `interviews` table.

1.5 WHEN the `JobBrowsingScreen` filters blocked companies THEN the system queries `blocked_candidates` with `.eq('user_id', user?.id)` but `user` can be `null` at render time, causing the query to run with `user_id = null` and returning no blocked companies, so blocked candidates can still see jobs from companies that blocked them.

1.6 WHEN the `JobDetailScreen` applies for a job THEN the system calls `supabase.from('applications').upsert(...)` without specifying `onConflict`, so the upsert may insert a duplicate row instead of updating the existing one when a unique constraint exists on `(user_id, job_id)`.

1.7 WHEN the `AuthContext.updateProfile` saves profile data THEN the system passes `onboarding_completed` as a field in the upsert payload, but the `profiles` table schema does not include an `onboarding_completed` column, causing the upsert to fail silently or throw a schema mismatch error.

1.8 WHEN the `auth.ts` `registerUser` function creates a new profile THEN the system upserts with only `id`, `full_name`, `email`, and `updated_at`, omitting the `role` column, so new users have no role set and the admin dashboard rejects them with "Admin access required".

1.9 WHEN the `dashboard/src/lib/backend.ts` `getInterviewResults` function fetches data THEN the system calls the backend REST API instead of querying the `admin_interview_view` Supabase view directly, bypassing row-level security and returning data that may be stale relative to the Supabase state.

1.10 WHEN the dashboard `CandidatesView` updates an application status THEN the system calls `supabase.from('applications').update({ status }).eq('id', candidate.id)` where `candidate.id` is a synthetic `iv_<uuid>` string for interview-only candidates, causing the update to match zero rows silently.

**5-Flag Blocking Logic Issues:**

1.11 WHEN a candidate accumulates exactly 5 proctoring/OCR flags during an interview THEN the system calls `blockCandidate(...)` which routes to the backend REST API (`POST /blocked-candidates`) instead of inserting directly into the `blocked_candidates` Supabase table, so the block record may not be created if the backend is unreachable.

1.12 WHEN `blockCandidate` is called THEN the system sends a payload without a `company_id` field (it is `undefined` when no `jobId` is present), but the `blocked_candidates` table has a `company_id` column that is expected to be populated, resulting in a null `company_id` in the database record.

1.13 WHEN the `proctorFlagCount` state reaches 5 THEN the `useEffect` that calls `blockAndStopInterview` can fire multiple times before `blockInProgressRef.current` is set to `true`, because React batches state updates and the ref check happens asynchronously, potentially creating duplicate block records.

1.14 WHEN the interview is in `"connecting"` state and 5 flags are reached THEN the system calls `blockAndStopInterview`, but the LiveKit room may not yet be connected, so `disconnectCleanly` operates on a null room reference and the interview state is set to `"blocked"` without a proper room teardown.

1.15 WHEN a candidate is blocked after 5 flags THEN the system does NOT update the `interviews` table row's `integrity_flag` column to `true` in Supabase, so the admin dashboard's "Flagged Cases" view does not show this candidate as flagged.

---

### Expected Behavior (Correct)

**Supabase Connectivity Fixes:**

2.1 WHEN the `HistoryScreen` fetches interview history THEN the system SHALL query the `interviews` table directly in Supabase using `.select('*').eq('user_id', user.id).order('created_at', { ascending: false })` so that `admin_status` and all other columns are correctly populated.

2.2 WHEN the `HistoryScreen` joins applications with jobs THEN the system SHALL include `updated_at` in the applications select and join `companies(company_name, logo_url)` to return complete data.

2.3 WHEN the `HomeScreen` loads candidate stats THEN the system SHALL query the `interviews` table in Supabase directly with `.eq('user_id', user.id)` so that stats reflect the live Supabase state including `integrity_flag`.

2.4 WHEN the `InterviewIntroScreen` fetches a job's trade THEN the system SHALL query `jobs` with `.select('trade, language, district')` and pass the job's `language` and `district` to the interview start payload.

2.5 WHEN the `JobBrowsingScreen` filters blocked companies THEN the system SHALL guard the `blocked_candidates` query with a null check on `user?.id` and only execute the query when `user.id` is defined, returning an empty blocked list otherwise.

2.6 WHEN the `JobDetailScreen` applies for a job THEN the system SHALL call `supabase.from('applications').upsert({ user_id, job_id, status: 'applied' }, { onConflict: 'user_id,job_id' })` to correctly handle duplicate applications.

2.7 WHEN the `AuthContext.updateProfile` saves profile data THEN the system SHALL only include columns that exist in the `profiles` table schema and SHALL NOT pass `onboarding_completed` unless the column is confirmed to exist in the schema.

2.8 WHEN the `auth.ts` `registerUser` creates a new profile THEN the system SHALL include `role: 'candidate'` in the upsert payload so that new users have a default role set.

2.9 WHEN the dashboard `getInterviewResults` fetches data THEN the system SHALL query the `admin_interview_view` Supabase view directly using the dashboard's Supabase client instead of calling the backend REST API.

2.10 WHEN the dashboard `CandidatesView` updates an application status for an interview-only candidate THEN the system SHALL use the real application `id` returned from the upsert/insert operation, not the synthetic `iv_<uuid>` string.

**5-Flag Blocking Logic Fixes:**

2.11 WHEN a candidate accumulates exactly 5 proctoring/OCR flags during an interview THEN the system SHALL insert a record directly into the `blocked_candidates` Supabase table using the Supabase client with `{ company_id, user_id, reason }` fields populated.

2.12 WHEN `blockAndStopInterview` is called THEN the system SHALL resolve the `company_id` by looking up the `jobs` table for the current `jobId` and using `jobs.company_id`, falling back to `null` only if no `jobId` is available.

2.13 WHEN the `proctorFlagCount` state reaches 5 THEN the system SHALL use a ref-based guard (`blockInProgressRef.current`) that is set synchronously before any async operation begins, ensuring `blockAndStopInterview` is called exactly once regardless of React re-render timing.

2.14 WHEN the interview is in `"connecting"` state and 5 flags are reached THEN the system SHALL still call `blockAndStopInterview` but SHALL handle the case where the LiveKit room is null gracefully, completing the block record write and setting state to `"blocked"` without throwing.

2.15 WHEN a candidate is blocked after 5 flags THEN the system SHALL update the corresponding `interviews` table row in Supabase by setting `integrity_flag = true` using the interview's `id` (obtained from `livekitRoomRef` or the latest result), so the admin dashboard reflects the flag immediately.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a candidate logs in with valid credentials THEN the system SHALL CONTINUE TO authenticate via Supabase Auth and load the profile from the `profiles` table without errors.

3.2 WHEN a candidate completes onboarding THEN the system SHALL CONTINUE TO save all profile fields (`full_name`, `phone`, `age`, `gender`, `district`, `trade`, `experience_level`, `skills`, `education`, `work_preference`) to the `profiles` table.

3.3 WHEN a candidate browses jobs THEN the system SHALL CONTINUE TO filter jobs by `status = 'open'` and by the candidate's trade from the `jobs` table joined with `companies`.

3.4 WHEN a candidate applies for a job THEN the system SHALL CONTINUE TO create a record in the `applications` table and navigate to the `InterviewIntro` screen.

3.5 WHEN an interview starts THEN the system SHALL CONTINUE TO call the backend `/start-interview` endpoint to obtain LiveKit credentials and connect to the room.

3.6 WHEN an interview ends normally (fewer than 5 flags) THEN the system SHALL CONTINUE TO fetch the result via the backend `/results/latest` endpoint and display it on the `ResultScreen`.

3.7 WHEN the admin dashboard loads THEN the system SHALL CONTINUE TO authenticate via Supabase Auth, check the user's role from the `profiles` table, and restrict access to `admin` and `employer` roles only.

3.8 WHEN an admin posts or edits a job THEN the system SHALL CONTINUE TO write to the `jobs` and `companies` tables in Supabase with all required fields.

3.9 WHEN an admin updates a candidate's application status THEN the system SHALL CONTINUE TO update the `status` column in the `applications` table.

3.10 WHEN a candidate's language preference is changed THEN the system SHALL CONTINUE TO persist the preference to the `language_preference` column in the `profiles` table and update local state immediately.
