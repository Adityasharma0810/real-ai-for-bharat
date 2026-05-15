# Requirements Document

## Introduction

This feature allows candidates to upload photos of their work (portfolio/experience photos) directly from the mobile app's Profile page. These photos serve as visual evidence of a candidate's skills and past work experience. Admins viewing a Candidate Profile in the dashboard can see these photos alongside other candidate details such as interview summary, personal details, and scores. The feature requires a dedicated Supabase storage bucket, a database table to track photo metadata, and appropriate Row-Level Security (RLS) policies.

## Glossary

- **Candidate**: A user with `role = 'candidate'` in the `profiles` table who uses the mobile app.
- **Admin**: A user with `role = 'admin'` in the `profiles` table who uses the admin dashboard.
- **Work_Portfolio_Photo**: An image file uploaded by a Candidate to represent their work experience or skills.
- **Portfolio_Storage_Bucket**: The Supabase Storage bucket named `work-portfolio-photos` that stores uploaded image files.
- **Portfolio_Table**: The Supabase database table named `work_portfolio_photos` that stores metadata for each uploaded photo.
- **Photo_Upload_Service**: The mobile app service responsible for selecting, validating, and uploading photos to Supabase Storage.
- **Portfolio_Gallery**: The UI section on the mobile app Profile page that displays a Candidate's uploaded Work_Portfolio_Photos.
- **Admin_Portfolio_Viewer**: The UI section on the admin dashboard Candidate Profile panel that displays a Candidate's Work_Portfolio_Photos.
- **RLS**: Row-Level Security — Supabase's mechanism for controlling which database rows a user can read, insert, update, or delete.

---

## Requirements

### Requirement 1: Supabase Storage Bucket Setup

**User Story:** As a developer, I want a dedicated Supabase storage bucket for work portfolio photos, so that uploaded images are stored securely and separately from other assets.

#### Acceptance Criteria

1. THE Portfolio_Storage_Bucket SHALL exist in Supabase Storage with the name `work-portfolio-photos`.
2. THE Portfolio_Storage_Bucket SHALL be configured as a private bucket; files are never publicly accessible and SHALL only be served via signed URLs.
3. WHEN a Candidate uploads a Work_Portfolio_Photo, THE Portfolio_Storage_Bucket SHALL store the file at the path `{user_id}/{timestamp}_{uuid}.{extension}` to namespace files per user and guarantee uniqueness.
4. IF the uploaded file size exceeds 10 MB, THEN THE Portfolio_Storage_Bucket SHALL reject the upload with an error and SHALL NOT store the file.
5. IF the uploaded file has a MIME type other than `image/jpeg`, `image/png`, or `image/webp`, THEN THE Portfolio_Storage_Bucket SHALL reject the upload with an error and SHALL NOT store the file.
6. THE Portfolio_Storage_Bucket SHALL reject any upload whose destination path already exists, preventing silent overwrites of existing photos.

---

### Requirement 2: Supabase Database Table Setup

**User Story:** As a developer, I want a database table to track photo metadata, so that the app can list, display, and manage a candidate's portfolio photos without scanning storage directly.

#### Acceptance Criteria

1. THE Portfolio_Table SHALL exist in the Supabase `public` schema with the following columns: `id` (UUID, primary key, default `gen_random_uuid()`), `user_id` (UUID, foreign key referencing `profiles.id` with ON DELETE CASCADE, not null), `storage_path` (text, max 500 characters, not null), `caption` (text, max 300 characters, nullable), `uploaded_at` (timestamptz, default `now()`).
2. THE Portfolio_Table SHALL have an index on the `user_id` column.
3. WHEN a row in the `profiles` table is deleted, THE Portfolio_Table SHALL automatically delete all rows where `user_id` matches the deleted profile's `id` via the ON DELETE CASCADE constraint.

---

### Requirement 3: Supabase Row-Level Security Policies

**User Story:** As a developer, I want RLS policies on the portfolio table and storage bucket, so that candidates can only manage their own photos and admins can view any candidate's photos.

#### Acceptance Criteria

1. THE Portfolio_Table SHALL have RLS enabled.
2. WHEN a Candidate (a user whose JWT role claim equals `candidate`) reads from the Portfolio_Table, THE Portfolio_Table SHALL return only rows where `user_id` matches `auth.uid()`. WHEN an Admin (a user whose JWT role claim equals `admin`) reads from the Portfolio_Table, THE Portfolio_Table SHALL return all rows regardless of `user_id`.
3. WHEN any authenticated user inserts a row into the Portfolio_Table, THE Portfolio_Table SHALL allow the insert only if the `user_id` value equals `auth.uid()`.
4. WHEN any authenticated user updates a row in the Portfolio_Table, THE Portfolio_Table SHALL allow the update only if the `user_id` value of the existing row equals `auth.uid()`.
5. WHEN any authenticated user attempts to delete a row from the Portfolio_Table, THE Portfolio_Table SHALL allow the delete only if the `user_id` value equals `auth.uid()`.
6. THE Portfolio_Storage_Bucket SHALL have a storage policy that allows a Candidate to upload files only to the path prefix matching their own `auth.uid()`.
7. THE Portfolio_Storage_Bucket SHALL have a storage policy that allows a Candidate to delete files only from the path prefix matching their own `auth.uid()`.
8. THE Portfolio_Storage_Bucket SHALL have a storage policy that allows an Admin to read files from any path within the bucket.
9. THE Portfolio_Storage_Bucket SHALL have a storage policy that allows a Candidate to read files only from the path prefix matching their own `auth.uid()`.
10. WHEN an unauthenticated user attempts any operation (read, insert, update, delete) on the Portfolio_Table or Portfolio_Storage_Bucket, THE system SHALL reject the request with an authorization error.

---

### Requirement 4: Mobile App — Photo Upload

**User Story:** As a candidate, I want to upload photos of my work from the Profile page, so that I can showcase my skills and experience visually.

#### Acceptance Criteria

1. WHEN a Candidate views the Profile page, THE Portfolio_Gallery SHALL be displayed as a section below the Work & Skills section, titled "Work Portfolio".
2. IF the Portfolio_Gallery contains no photos, THEN THE Portfolio_Gallery SHALL display a placeholder message indicating no photos have been added yet.
3. WHEN a Candidate taps the "Add Photo" button in the Portfolio_Gallery, THE Photo_Upload_Service SHALL open the device's image library for photo selection.
4. IF a Candidate selects an image from the library, THEN THE Photo_Upload_Service SHALL validate that the file size does not exceed 10 MB.
5. IF the selected image exceeds 10 MB, THEN THE Photo_Upload_Service SHALL display an error message stating the file is too large and SHALL NOT proceed with the upload.
6. IF the selected image has a MIME type other than `image/jpeg`, `image/png`, or `image/webp`, THEN THE Photo_Upload_Service SHALL display an error message stating the file type is not supported and SHALL NOT proceed with the upload.
7. WHEN a valid image is selected, THE Photo_Upload_Service SHALL upload the image to the Portfolio_Storage_Bucket at the path `{user_id}/{timestamp}_{uuid}.{extension}`.
8. WHEN the upload completes successfully, THE Photo_Upload_Service SHALL insert a row into the Portfolio_Table with the `storage_path` and `user_id`.
9. WHEN the upload completes successfully, THE Portfolio_Gallery SHALL refresh to display the newly added photo without requiring a full page reload.
10. WHILE an upload is in progress, THE Photo_Upload_Service SHALL display a loading indicator and SHALL disable the "Add Photo" button to prevent concurrent duplicate uploads.
11. IF the upload fails due to a network or storage error, THEN THE Photo_Upload_Service SHALL display an error message and SHALL NOT insert a row into the Portfolio_Table.
12. IF the storage upload succeeds but the Portfolio_Table insert fails, THEN THE Photo_Upload_Service SHALL attempt to delete the uploaded file from the Portfolio_Storage_Bucket, display an error message to the Candidate, and SHALL NOT leave an orphaned file in storage.
13. IF a Candidate already has 20 photos in the Portfolio_Gallery, THEN THE Photo_Upload_Service SHALL display a message indicating the photo limit has been reached and SHALL NOT open the image library.

---

### Requirement 5: Mobile App — Photo Display

**User Story:** As a candidate, I want to see my uploaded work photos on my Profile page, so that I can review and manage my portfolio.

#### Acceptance Criteria

1. WHEN a Candidate views the Profile page, THE Portfolio_Gallery SHALL fetch and display all Work_Portfolio_Photos associated with the Candidate's `user_id` from the Portfolio_Table. IF the fetch fails, THEN THE Portfolio_Gallery SHALL display an error message and SHALL NOT crash the Profile page.
2. THE Portfolio_Gallery SHALL display photos in a horizontal scrollable grid with a minimum thumbnail size of 100×100 points.
3. WHEN a Candidate taps a photo thumbnail, THE Portfolio_Gallery SHALL display the photo in a full-screen modal view.
4. WHEN a Candidate views a photo in the full-screen modal, THE Portfolio_Gallery SHALL provide a "Delete" option.
5. WHEN a Candidate confirms deletion of a photo, THE Photo_Upload_Service SHALL first delete the file from the Portfolio_Storage_Bucket and then delete the corresponding row from the Portfolio_Table. IF the storage delete succeeds but the Portfolio_Table delete fails, THEN THE Photo_Upload_Service SHALL display an error message and SHALL attempt to restore consistency by retrying the Portfolio_Table delete.
6. WHEN deletion completes successfully, THE Portfolio_Gallery SHALL remove the deleted photo from the display without requiring a full page reload.
7. IF deletion fails at the storage step, THEN THE Photo_Upload_Service SHALL display an error message and SHALL retain the photo in both the Portfolio_Storage_Bucket and the Portfolio_Table, leaving no orphaned metadata.
8. IF a Candidate already has 20 photos in the Portfolio_Gallery, THEN THE Portfolio_Gallery SHALL display a message indicating the photo limit has been reached and SHALL hide or disable the "Add Photo" button.

---

### Requirement 6: Mobile App — Caption Support

**User Story:** As a candidate, I want to add a caption to each work photo, so that I can describe the work shown in the image.

#### Acceptance Criteria

1. WHEN a Candidate uploads a photo, THE Photo_Upload_Service SHALL present an optional text input field for a caption, with a maximum length of 300 characters, before confirming the upload.
2. WHEN a caption is provided, THE Photo_Upload_Service SHALL store the caption in the `caption` column of the Portfolio_Table row.
3. IF caption storage fails, THEN THE Photo_Upload_Service SHALL allow the photo upload to complete successfully, SHALL store a null value in the `caption` column, and SHALL display an error message informing the Candidate that the caption could not be saved.
4. WHEN a caption is not provided, THE Photo_Upload_Service SHALL store a null value in the `caption` column.
5. WHEN a Candidate views a photo in the full-screen modal, THE Portfolio_Gallery SHALL display the full caption text below the photo if one exists.
6. WHEN a caption exceeds two lines of display width in the Portfolio_Gallery thumbnail view, THE Portfolio_Gallery SHALL truncate the caption with an ellipsis after two lines.

---

### Requirement 7: Admin Dashboard — Portfolio Viewer

**User Story:** As an admin, I want to see a candidate's work portfolio photos in the Candidate Profile panel, so that I can assess their practical experience alongside their interview results.

#### Acceptance Criteria

1. WHEN an Admin opens the Candidate Profile panel in the dashboard, THE Admin_Portfolio_Viewer SHALL be displayed as a section within the panel, below the Personal Details section.
2. WHEN the candidate has no uploaded photos, THE Admin_Portfolio_Viewer SHALL display a message indicating no portfolio photos are available.
3. WHEN the candidate has uploaded photos, THE Admin_Portfolio_Viewer SHALL fetch signed URLs for each photo from the Portfolio_Storage_Bucket using the Supabase admin client.
4. THE Admin_Portfolio_Viewer SHALL display photos in a grid layout with a minimum of 2 columns and thumbnails of at least 80×80 pixels.
5. WHEN an Admin clicks a photo thumbnail, THE Admin_Portfolio_Viewer SHALL display the photo in a full-screen lightbox modal.
6. WHEN a caption exists for a photo, THE Admin_Portfolio_Viewer SHALL display the caption below the thumbnail.
7. IF fetching portfolio photos fails, THEN THE Admin_Portfolio_Viewer SHALL display an error message scoped to the portfolio section only, and the rest of the Candidate Profile panel SHALL remain interactive and functional.
8. IF signed URL generation fails for an individual photo, THEN THE Admin_Portfolio_Viewer SHALL display a broken-image placeholder for that photo and SHALL continue displaying other photos normally.

---

### Requirement 8: Signed URL Generation for Secure Access

**User Story:** As a developer, I want photos to be served via signed URLs, so that private storage files are accessible only to authorized users for a limited time.

#### Acceptance Criteria

1. WHEN the mobile app displays a Work_Portfolio_Photo, THE Portfolio_Gallery SHALL generate a signed URL with an expiry of 3600 seconds (1 hour) using the Supabase Storage API.
2. WHEN the admin dashboard displays a Work_Portfolio_Photo, THE Admin_Portfolio_Viewer SHALL generate a signed URL with an expiry of 3600 seconds (1 hour) using the Supabase Storage API.
3. IF signed URL generation fails for a photo, THEN THE Portfolio_Gallery SHALL display a broken-image placeholder for that photo and SHALL continue displaying other photos. IF signed URL generation fails in the Admin_Portfolio_Viewer, THEN THE Admin_Portfolio_Viewer SHALL display a broken-image placeholder for that photo and SHALL continue displaying other photos.
4. WHEN a signed URL expires during an active session, THE Portfolio_Gallery and Admin_Portfolio_Viewer SHALL automatically regenerate a new signed URL for the affected photo without requiring the user to reload the page or screen.
