# Implementation Plan: Work Portfolio Photos

## Overview

Implement the work portfolio photo feature across the mobile app (Expo/React Native) and the admin dashboard (React + Vite). All Supabase infrastructure (table, bucket, RLS policies) is already in place. The implementation follows the existing service-layer pattern established by `interviewService.ts` and `backend.ts`.

## Tasks

- [x] 1. Implement `portfolioService.ts` — pure functions and types
  - [x] 1.1 Create `frontend/src/services/portfolioService.ts` with types and pure utility functions
    - Define `PortfolioPhoto` and `UploadPhotoOptions` interfaces as specified in the design
    - Implement `validatePhotoFile(mimeType, fileSize)` — returns `null` if valid, error string if not; allowed MIME types: `image/jpeg`, `image/png`, `image/webp`; max size 10,485,760 bytes; size must be > 0
    - Implement `buildStoragePath(userId, extension)` — returns `{userId}/{Date.now()}_{crypto.randomUUID()}.{ext}`
    - Import the existing Supabase client from `../services/supabase/config`
    - _Requirements: 1.3, 1.4, 1.5, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 1.2 Write property tests for `validatePhotoFile` and `buildStoragePath`
    - **Property 1: Storage path format** — for any UUID userId and extension from `['jpg','png','webp']`, `buildStoragePath` output matches `/^[0-9a-f-]{36}\/\d+_[0-9a-f-]{36}\.(jpg|png|webp)$/`
    - **Property 2: MIME type validation** — for any string, `validatePhotoFile` returns `null` iff MIME is exactly one of the three allowed types
    - **Property 3: File size validation** — for any integer 0–20,000,000, `validatePhotoFile` returns `null` iff size > 0 and size ≤ 10,485,760
    - Use `fast-check`; minimum 100 runs per property
    - _Requirements: 1.3, 1.4, 1.5, 4.4, 4.5, 4.6, 4.7_

- [x] 2. Implement `portfolioService.ts` — async Supabase operations
  - [x] 2.1 Implement `getSignedUrl(storagePath)` in `portfolioService.ts`
    - Call `supabase.storage.from('work-portfolio-photos').createSignedUrl(storagePath, 3600)`
    - Return `{ url: string, expiresAt: number }` where `expiresAt = Date.now() + 3600 * 1000`
    - Throw `SignedUrlError` on failure
    - _Requirements: 8.1, 8.2_

  - [ ]* 2.2 Write property test for `getSignedUrl` expiry window
    - **Property 11: Signed URL expiry** — for any storage path, `expiresAt` is within `[Date.now() + 3595000, Date.now() + 3605000]` (5 s tolerance)
    - Mock the Supabase storage client
    - _Requirements: 8.1, 8.2_

  - [x] 2.3 Implement `fetchPortfolioPhotos(userId)` in `portfolioService.ts`
    - Query `work_portfolio_photos` table filtered by `user_id`, ordered by `uploaded_at` ascending
    - For each row, call `getSignedUrl`; on per-photo failure set `signedUrl = undefined` and continue (do not throw)
    - Return `PortfolioPhoto[]`
    - Throw `PortfolioFetchError` only if the DB query itself fails
    - _Requirements: 5.1, 8.3_

  - [ ]* 2.4 Write property test for partial URL failure resilience (mobile)
    - **Property 12: Partial URL failure resilience** — for N photos where M fail URL generation, result has length N with M entries having `signedUrl = undefined`
    - Mock Supabase DB and storage clients
    - _Requirements: 5.1, 8.3_

  - [x] 2.5 Implement `uploadPortfolioPhoto(opts)` in `portfolioService.ts`
    - Call `validatePhotoFile` first; throw `PortfolioValidationError` if invalid
    - Call `buildStoragePath` to compute path
    - Upload file bytes to storage via `supabase.storage.from('work-portfolio-photos').upload(path, fileBlob)`; throw `PortfolioUploadError` (storage) on failure
    - Insert row into `work_portfolio_photos`; on DB failure call `storage.remove(path)` as compensating delete, then throw `PortfolioUploadError` (db)
    - On success, call `getSignedUrl` and return the complete `PortfolioPhoto`
    - _Requirements: 4.7, 4.8, 4.11, 4.12_

  - [ ]* 2.6 Write property test for orphan prevention on DB failure
    - **Property 5: Orphan prevention** — when storage upload succeeds but DB insert is mocked to fail, `storage.remove` is called exactly once with the uploaded path
    - _Requirements: 4.12_

  - [x] 2.7 Implement `deletePortfolioPhoto(photo)` in `portfolioService.ts`
    - Call `storage.remove([photo.storage_path])`; throw `PortfolioDeleteError` (storage) on failure without touching DB
    - On storage success, call `supabase.from('work_portfolio_photos').delete().eq('id', photo.id)`
    - On DB failure, retry once; throw `PortfolioDeleteError` (db) if retry also fails
    - _Requirements: 5.5, 5.7_

  - [ ]* 2.8 Write property test for delete atomicity — storage failure leaves state unchanged
    - **Property 7: Delete atomicity** — when `storage.remove` is mocked to fail, no DB delete is called and the function throws
    - _Requirements: 5.7_

- [x] 3. Checkpoint — service layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `usePortfolio` hook
  - [x] 4.1 Create `frontend/src/hooks/usePortfolio.ts`
    - Define `UsePortfolioResult` interface as per design
    - On mount, call `fetchPortfolioPhotos(userId)` and populate `photos`; set `isLoading` correctly
    - Implement `addPhoto(fileUri, mimeType, fileSize, caption?)`:
      - Guard: if `photos.length >= 20`, set `uploadError` and return without calling service
      - Set `isUploading = true`; call `uploadPortfolioPhoto`; append result to `photos`; clear `uploadError`
      - On failure, set `uploadError` with the error message
    - Implement `removePhoto(photo)`:
      - Optimistically remove from `photos` immediately
      - Call `deletePortfolioPhoto`; on failure, roll back by re-inserting the photo and set `error`
    - Implement `refresh()` — re-fetches photos
    - Expose `atLimit` as `photos.length >= 20`
    - _Requirements: 4.9, 4.10, 4.13, 5.1, 5.6, 5.8_

  - [ ]* 4.2 Write unit tests for `usePortfolio` hook
    - Test initial load sets `isLoading` then resolves with photos
    - Test `addPhoto` appends photo on success and sets `uploadError` on failure
    - Test `removePhoto` optimistic removal and rollback on error
    - Test `atLimit` is `true` when `photos.length >= 20`
    - Use React Native Testing Library
    - _Requirements: 4.9, 4.10, 4.13, 5.1, 5.6, 5.8_

  - [ ]* 4.3 Write property test for photo limit enforcement
    - **Property 6: Photo limit enforcement** — for any user with exactly 20 photos, `addPhoto` rejects without calling any storage or DB function
    - _Requirements: 4.13, 5.8_

- [x] 5. Implement `PortfolioGallery` component
  - [x] 5.1 Create `frontend/src/components/PortfolioGallery.tsx`
    - Accept `{ userId: string }` props; call `usePortfolio(userId)` for all data and actions
    - Render section header "Work Portfolio"
    - Render horizontal `ScrollView` with `FlatList` of 100×100 pt thumbnails using signed URLs; show broken-image placeholder when `signedUrl` is undefined
    - Render "Add Photo" button (disabled when `isUploading` or `atLimit`); show limit-reached message when `atLimit`
    - Render empty-state placeholder when `photos.length === 0`
    - Show loading overlay / spinner while `isUploading`
    - Show `uploadError` and `error` messages inline (do not crash the screen)
    - On "Add Photo" tap: call `expo-image-picker` `launchImageLibraryAsync` with `mediaTypes: 'images'`, `quality: 1`, `allowsEditing: false`; present caption input (optional, max 300 chars) before confirming upload; call `addPhoto`
    - _Requirements: 4.1, 4.2, 4.3, 4.9, 4.10, 4.13, 5.1, 5.2, 5.8, 6.1, 6.4_

  - [x] 5.2 Implement full-screen photo modal in `PortfolioGallery`
    - On thumbnail tap, open a `Modal` with the full-resolution image
    - Display caption below the image (full text, not truncated)
    - Provide a "Delete" button that calls `removePhoto(photo)` after confirmation
    - Close modal on successful deletion
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 6.5_

  - [ ]* 5.3 Write unit tests for `PortfolioGallery`
    - Test empty-state renders when no photos
    - Test thumbnails render when photos present
    - Test broken-image placeholder renders when `signedUrl` is undefined
    - Test "Add Photo" button is disabled when `atLimit`
    - Test limit-reached message appears when `atLimit`
    - _Requirements: 4.2, 5.2, 5.8, 8.3_

- [x] 6. Integrate `PortfolioGallery` into `ProfileScreen`
  - [x] 6.1 Modify `frontend/src/screens/home/ProfileScreen.tsx`
    - Import `PortfolioGallery` from `../../components/PortfolioGallery`
    - Add a new `<View style={styles.section}>` block after the existing "Work & Skills" section (inside the `profile?.role === 'candidate'` guard)
    - Render `<PortfolioGallery userId={user!.id} />` inside that section
    - No other changes to `ProfileScreen` are needed
    - _Requirements: 4.1_

- [x] 7. Checkpoint — mobile app complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement `adminPortfolioService.ts`
  - [x] 8.1 Create `frontend/dashboard/src/lib/adminPortfolioService.ts`
    - Define `AdminPortfolioPhoto` interface as per design
    - Implement `fetchCandidatePortfolio(candidateUserId)`:
      - Query `work_portfolio_photos` filtered by `user_id = candidateUserId`, ordered by `uploaded_at` ascending, using the existing `supabase` client from `./supabase`
      - For each row, call `supabase.storage.from('work-portfolio-photos').createSignedUrl(row.storage_path, 3600)`
      - On per-photo URL failure, set `signedUrl = null` and `signedUrlExpiresAt = 0`; continue with remaining photos
      - Throw `PortfolioFetchError` only if the DB query itself fails
    - _Requirements: 7.3, 8.2, 8.3_

  - [ ]* 8.2 Write property test for partial URL failure resilience (admin)
    - **Property 12: Partial URL failure resilience (admin)** — for N photos where M fail URL generation, result has length N with M entries having `signedUrl = null`
    - Mock Supabase DB and storage clients
    - _Requirements: 7.8, 8.3_

- [x] 9. Implement `AdminPortfolioViewer` component
  - [x] 9.1 Create `frontend/dashboard/src/components/AdminPortfolioViewer.tsx`
    - Accept `{ candidateUserId: string }` props
    - On mount, call `fetchCandidatePortfolio(candidateUserId)` and store results in local state
    - Render section header "Work Portfolio"
    - Render 2-column CSS grid of 80×80 px thumbnails; show caption below each thumbnail
    - Render `<ImageOff />` (from `lucide-react`) placeholder when `signedUrl === null`
    - Render empty-state message when no photos exist
    - Render scoped error banner (does not unmount sibling components) when the entire fetch fails
    - _Requirements: 7.1, 7.2, 7.4, 7.6, 7.7, 7.8_

  - [x] 9.2 Implement lightbox modal in `AdminPortfolioViewer`
    - On thumbnail click, open a full-screen overlay modal with the full-resolution image
    - Display caption below the image
    - Close on overlay click or close button
    - _Requirements: 7.5_

  - [x] 9.3 Implement signed URL auto-refresh in `AdminPortfolioViewer`
    - Use a `useEffect` with a 30-second interval to check whether any URL expires within the next 60 seconds
    - For expiring URLs, call `createSignedUrl` and update state; do not re-fetch the full list
    - _Requirements: 8.4_

  - [ ]* 9.4 Write unit tests for `AdminPortfolioViewer`
    - Test empty-state renders when no photos
    - Test grid renders thumbnails when photos present
    - Test `<ImageOff />` placeholder renders when `signedUrl === null`
    - Test scoped error banner renders on fetch failure without unmounting sibling elements
    - Use React Testing Library (Vitest)
    - _Requirements: 7.2, 7.4, 7.7, 7.8_

- [x] 10. Integrate `AdminPortfolioViewer` into the Candidate Profile panel
  - [x] 10.1 Modify `frontend/dashboard/src/App.tsx`
    - Import `AdminPortfolioViewer` from `./components/AdminPortfolioViewer`
    - Inside `CandidateDetailModal`, add `<AdminPortfolioViewer candidateUserId={interview.user_id!} />` as a new section after the "Personal Details" / score summary block, wrapped in a guard `{interview.user_id && ...}`
    - Import `ImageOff` from `lucide-react` if not already imported (needed by `AdminPortfolioViewer` internally, but also add to the top-level import if the component is inline)
    - _Requirements: 7.1_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- The Supabase infrastructure (table, bucket, RLS policies) is already created — no SQL migration tasks are included
- `fast-check` is the property-based testing library for both Jest (mobile) and Vitest (dashboard)
- The mobile app uses `expo-image-picker` (already in `package.json`) for photo selection
- The dashboard uses `lucide-react` (already in `dashboard/package.json`) for the `ImageOff` broken-image icon
- Signed URL TTL is 3600 seconds; auto-refresh triggers when a URL is within 60 seconds of expiry
- The `usePortfolio` hook lives in `frontend/src/hooks/` (directory to be created)
- The `PortfolioGallery` component lives alongside existing components in `frontend/src/components/`
- The `AdminPortfolioViewer` component lives in `frontend/dashboard/src/components/` (directory to be created)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5"] },
    { "id": 4, "tasks": ["2.6", "2.7"] },
    { "id": 5, "tasks": ["2.8", "4.1", "8.1"] },
    { "id": 6, "tasks": ["4.2", "4.3", "8.2", "5.1"] },
    { "id": 7, "tasks": ["5.2", "9.1"] },
    { "id": 8, "tasks": ["5.3", "9.2", "9.3"] },
    { "id": 9, "tasks": ["6.1", "9.4"] },
    { "id": 10, "tasks": ["10.1"] }
  ]
}
```
