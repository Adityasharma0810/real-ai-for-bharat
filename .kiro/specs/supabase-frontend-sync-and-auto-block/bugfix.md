# Bugfix Requirements Document

## Introduction

This document covers two related bugs in the AI interview platform (React Native frontend + React dashboard + Supabase backend):

1. **Frontend–Supabase column mapping mismatches** — Several UI components read from or write to incorrect or missing Supabase columns, causing data to be lost, displayed incorrectly, or silently dropped. Affected areas include the candidate profile, onboarding flow, job listings, interview screens, history screen, and the React admin dashboard.

2. **Missing auto-block on 5 integrity flags** — The `InterviewScreen` tracks proctoring/OCR flag counts in local state (`proctorFlagCount`) but the block trigger fires on any 5 cumulative flags regardless of type. More critically, the `integrity_flag` column in the `interviews` table (a boolean set by the backend) is never counted client-side to enforce the 5-strike auto-block rule, and the `blocked_candidates` insert does not reliably include the `company_id` derived from the associated job.

---

## Bug Analysis

### Current Behavior (Defect)

**Issue 1 — Frontend–Supabase column mapping**

1.1 WHEN the admin dashboard fetches interview data THEN the system calls the backend `/results` REST endpoint instead of querying the `admin_interview_view` Supabase view, causing joined profile fields (`full_name`, `email`, `age`, `gender`, `profile_district`, `experience_level`, `education`, `work_preference`, `skills`, `profile_trade`) to be absent from the displayed data.

1.2 WHEN a candidate completes onboarding THEN the `language_preference` field is only synced when the user explicitly changes language, not during initial onboarding submission, leaving it null in the database.

1.3 WHEN the `InterviewScreen` calls `blockCandidate` THEN the system sends the payload without a `company_id` field because the screen only receives `jobId` as a route param and never fetches the associated job's `company_id` from the `jobs` table, resulting in a `blocked_candidates` row with a null `company_id`.

1.4 WHEN the dashboard `CandidatesView` and `FlaggedView` display interview records THEN the system reads `integrity_flag` from the backend API response rather than directly from Supabase, causing the flagged-cases count and flag icon to be unreliable.

1.5 WHEN the `HistoryScreen` fetches interview history THEN the system queries `applications` without including `companies(logo_url)` or the application `status` field in the select, so application status and company logo are unavailable for display.

1.6 WHEN the `JobBrowsingScreen` filters out blocked-company jobs THEN the blocked-company filter constructs a raw string `(${blockedCompanyIds.join(',')})` for the `.not('company_id', 'in', ...)` call instead of using the array syntax expected by the Supabase JS client, causing the filter to fail silently and blocked-company jobs to remain visible.

1.7 WHEN the `InterviewerDashboardScreen` (React Native) fetches interview data THEN the system calls the backend `/results` endpoint and does not use the `admin_interview_view` or join `profiles` data, so employer-facing candidate details (education, skills, district) are missing.

**Issue 2 — Auto-block on 5 integrity flags**

1.8 WHEN the `integrity_flag` boolean on an `interviews` row is set to `true` by the backend THEN the system does not read this value from Supabase during the interview session, so a backend-detected integrity violation never contributes to the client-side flag counter.

1.9 WHEN `proctorFlagCount` reaches 5 during an active interview THEN the system calls `blockCandidate` via the backend REST API but does not update the `interviews` row `status` column to `'terminated'` in Supabase, leaving the interview record in an inconsistent state.

1.10 WHEN `blockCandidate` is called THEN the system omits `company_id` from the payload, so the `blocked_candidates` table row is inserted without a company association, breaking the job-browsing blocked-company filter.

---

### Expected Behavior (Correct)

**Issue 1 — Frontend–Supabase column mapping**

2.1 WHEN the admin dashboard fetches interview data THEN the system SHALL query the `admin_interview_view` Supabase view directly (not the backend REST endpoint), returning all joined columns including `full_name`, `email`, `age`, `gender`, `profile_district`, `experience_level`, `education`, `work_preference`, `skills`, and `profile_trade`. IF the query fails THEN the system SHALL display an error state rather than silently showing empty fields.

2.2 WHEN a candidate completes onboarding and submits the form THEN the system SHALL include `language_preference` — set to the currently active app locale (e.g., `"en"`, `"hi"`) at the time of submission — in the `updateProfile` upsert call, so the field is persisted to the `profiles` table on first save. IF the locale value is unavailable THEN the system SHALL default to `"en"` rather than omitting the field.

2.3 WHEN the `InterviewScreen` initialises and a `jobId` route param is present THEN the system SHALL fetch `company_id` from the `jobs` table for that `jobId` and store it in component state. WHEN `blockCandidate` is subsequently called THEN the system SHALL include the resolved `company_id` in the `blocked_candidates` insert payload. IF the `jobs` fetch fails or returns no row THEN the system SHALL log the error and proceed with the block using a `null` `company_id` rather than aborting the block entirely.

2.4 WHEN the dashboard fetches or refreshes interview records THEN the system SHALL read `integrity_flag` directly from the `admin_interview_view` Supabase view (column `integrity_flag`, type boolean), ensuring the flagged-cases count and flag icon reflect the authoritative database value rather than a potentially stale API response.

2.5 WHEN the `HistoryScreen` fetches interview history THEN the system SHALL include `status` and `companies(logo_url)` in the applications select query so that application status and company logo are both available for display alongside each interview card.

2.6 WHEN the `JobBrowsingScreen` filters out blocked-company jobs and `blockedCompanyIds` is a non-empty array THEN the system SHALL pass the array directly to `.not('company_id', 'in', blockedCompanyIds)` using the Supabase JS client array syntax (not a raw string), ensuring blocked companies are reliably excluded. IF `blockedCompanyIds` is empty THEN the system SHALL skip the filter entirely rather than passing an empty array.

2.7 WHEN the `InterviewerDashboardScreen` (React Native) fetches interview data for an employer THEN the system SHALL query the `admin_interview_view` filtered by the employer's job IDs (resolved from the `jobs` table where `created_by = currentUserId`) so that joined profile fields (`education`, `skills`, `district`, `experience_level`) are available for display.

**Issue 2 — Auto-block on 5 integrity flags**

2.8 WHEN an interview session is active THEN the system SHALL subscribe to Supabase Realtime changes on the `interviews` row for the current `interviewId`, listening for updates to the `integrity_flag` column. WHEN `integrity_flag` transitions to `true` on a row that was previously `false` or `null` THEN the system SHALL increment the client-side flag counter by 1. IF Realtime is unavailable THEN the system SHALL fall back to polling the `interviews` row at an interval not exceeding 10 seconds. WHEN the flag counter reaches 5 THEN the system SHALL trigger the auto-block flow.

2.9 WHEN `proctorFlagCount` reaches 5 and `blockAndStopInterview` is called THEN the system SHALL, as part of the same operation: (a) update the `interviews` row `status` to `'terminated'` in Supabase, and (b) call the backend block endpoint. IF the Supabase status update fails THEN the system SHALL log the error but SHALL NOT abort the backend block call, ensuring the candidate is still blocked even if the status write fails.

2.10 WHEN `blockCandidate` is called with a valid `jobId` THEN the system SHALL use the `company_id` resolved during screen initialisation (per 2.3) and insert a row into `blocked_candidates` with `user_id`, `company_id`, and `reason` set to `"integrity_violation"`. IF a row with the same `user_id` and `company_id` already exists THEN the system SHALL perform an upsert (on conflict do nothing) rather than throwing a duplicate-key error.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a candidate browses jobs that are not associated with a blocked company THEN the system SHALL CONTINUE TO display those jobs without filtering them out.

3.2 WHEN a candidate submits the onboarding form with all required fields THEN the system SHALL CONTINUE TO save `full_name`, `phone`, `age`, `gender`, `district`, `trade`, `experience_level`, `skills`, `education`, and `work_preference` to the `profiles` table as before.

3.3 WHEN a candidate edits their profile THEN the system SHALL CONTINUE TO update all editable fields (`full_name`, `phone`, `age`, `gender`, `district`, `trade`, `experience_level`, `skills`, `work_preference`) in the `profiles` table.

3.4 WHEN an interview session ends normally (all questions answered, `proctorFlagCount` is fewer than 5, and the backend returns a completion signal) THEN the system SHALL CONTINUE TO transition the interview `status` to `'completed'` and fetch the fitment result without triggering any block logic.

3.5 WHEN the `InterviewScreen` proctoring detects fewer than 5 cumulative flags THEN the system SHALL CONTINUE TO display the running flag count and the label of the most recent flag type without stopping the interview.

3.6 WHEN the admin dashboard loads for a user with `role = 'admin'` THEN the system SHALL CONTINUE TO display all interviews across the platform, not just those linked to a specific employer.

3.7 WHEN the `JobDetailScreen` fetches a job THEN the system SHALL CONTINUE TO read `title`, `description`, `trade`, `location`, `experience_required`, `skills_required`, `openings`, and the joined `companies` record correctly.

3.8 WHEN the `applications` table is updated with a new status (shortlisted, rejected, etc.) THEN the system SHALL CONTINUE TO reflect that status in the candidates view without requiring a full page reload beyond the existing refresh mechanism.

3.9 WHEN a candidate's `language_preference` is changed from the Profile screen THEN the system SHALL CONTINUE TO sync the new value to the `profiles` table as it does today.

3.10 WHEN the `blocked_candidates` table already contains a row for a given `user_id` and `company_id` THEN the system SHALL CONTINUE TO handle duplicate insert attempts via upsert (on conflict do nothing), returning success without throwing an unhandled error.
