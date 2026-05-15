/**
 * Portfolio Service
 *
 * Handles all Supabase interactions for the work portfolio photos feature.
 * Pure utility functions (validatePhotoFile, buildStoragePath) are kept
 * side-effect-free so they can be unit- and property-tested without mocking.
 */

import { supabase } from './supabase/config';

// ─── Custom error classes ─────────────────────────────────────────────────────

export class PortfolioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortfolioValidationError';
    Object.setPrototypeOf(this, PortfolioValidationError.prototype);
  }
}

export class PortfolioUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortfolioUploadError';
    Object.setPrototypeOf(this, PortfolioUploadError.prototype);
  }
}

export class PortfolioDeleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortfolioDeleteError';
    Object.setPrototypeOf(this, PortfolioDeleteError.prototype);
  }
}

export class PortfolioFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortfolioFetchError';
    Object.setPrototypeOf(this, PortfolioFetchError.prototype);
  }
}

export class SignedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignedUrlError';
    Object.setPrototypeOf(this, SignedUrlError.prototype);
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BUCKET_NAME = 'work-portfolio-photos';
const TABLE_NAME = 'work_portfolio_photos';
const MAX_FILE_SIZE_BYTES = 10_485_760; // 10 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour
const MAX_PHOTOS_PER_USER = 20;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PortfolioPhoto {
  id: string;
  user_id: string;
  storage_path: string;
  caption: string | null;
  uploaded_at: string;
  /** Resolved client-side, not stored in DB */
  signedUrl?: string;
  /** Unix ms timestamp when the signed URL expires */
  signedUrlExpiresAt?: number;
}

export interface UploadPhotoOptions {
  userId: string;
  fileUri: string;
  mimeType: string;
  fileSize: number;
  caption?: string;
}

// ─── Pure utility functions ───────────────────────────────────────────────────

/**
 * Validate a photo file before upload.
 *
 * Returns `null` if the file is valid, or a human-readable error string if not.
 *
 * Validates:
 * - MIME type must be exactly one of image/jpeg, image/png, image/webp
 * - File size must be > 0 and ≤ 10,485,760 bytes (10 MB)
 *
 * Validates: Requirements 1.4, 1.5, 4.4, 4.5, 4.6
 */
export function validatePhotoFile(mimeType: string, fileSize: number): string | null {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return 'File type not supported. Please upload a JPEG, PNG, or WebP image.';
  }

  if (fileSize <= 0) {
    return 'File is empty or invalid.';
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return 'File is too large. Maximum allowed size is 10 MB.';
  }

  return null;
}

/**
 * Build the storage path for a new photo upload.
 *
 * Format: `{userId}/{Date.now()}_{crypto.randomUUID()}.{ext}`
 *
 * The timestamp + UUID combination guarantees uniqueness and prevents
 * silent overwrites of existing files (Requirement 1.6).
 *
 * Validates: Requirements 1.3, 4.7
 */
export function buildStoragePath(userId: string, extension: string): string {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  return `${userId}/${timestamp}_${uuid}.${extension}`;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Generate (or refresh) a signed URL for a single storage path.
 * Returns the URL and its expiry timestamp in Unix ms.
 *
 * Validates: Requirements 8.1, 8.2
 */
export async function getSignedUrl(
  storagePath: string
): Promise<{ url: string; expiresAt: number }> {
  const before = Date.now();
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new SignedUrlError(
      `Failed to generate signed URL for path "${storagePath}": ${error?.message ?? 'unknown error'}`
    );
  }

  const expiresAt = before + SIGNED_URL_TTL_SECONDS * 1000;
  return { url: data.signedUrl, expiresAt };
}

/**
 * Fetch all portfolio rows for a user and resolve signed URLs.
 * Per-photo URL failures are caught; the photo is included with signedUrl = undefined.
 *
 * Validates: Requirements 5.1, 8.3
 */
export async function fetchPortfolioPhotos(userId: string): Promise<PortfolioPhoto[]> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    throw new PortfolioFetchError(`Could not load portfolio photos: ${error.message}`);
  }

  const rows = (data ?? []) as PortfolioPhoto[];

  // Resolve signed URLs; failures are silently swallowed per Requirement 8.3
  const photosWithUrls = await Promise.all(
    rows.map(async (photo) => {
      try {
        const { url, expiresAt } = await getSignedUrl(photo.storage_path);
        return { ...photo, signedUrl: url, signedUrlExpiresAt: expiresAt };
      } catch {
        return { ...photo, signedUrl: undefined, signedUrlExpiresAt: undefined };
      }
    })
  );

  return photosWithUrls;
}

/**
 * Validate, upload to storage, insert DB row. Returns the new PortfolioPhoto.
 *
 * Throws PortfolioValidationError for invalid files.
 * Throws PortfolioUploadError on storage or DB failure.
 * Guarantees no orphaned storage files: if the DB insert fails after a
 * successful storage upload, the file is immediately removed from storage.
 *
 * Validates: Requirements 4.4–4.12
 */
export async function uploadPortfolioPhoto(opts: UploadPhotoOptions): Promise<PortfolioPhoto> {
  const { userId, fileUri, mimeType, fileSize, caption } = opts;

  // 1. Client-side validation
  const validationError = validatePhotoFile(mimeType, fileSize);
  if (validationError) {
    throw new PortfolioValidationError(validationError);
  }

  // 2. Derive file extension from MIME type
  const extensionMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const extension = extensionMap[mimeType];

  // 3. Build storage path
  const storagePath = buildStoragePath(userId, extension);

  // 4. Fetch the file as a Blob for upload
  let fileBlob: Blob;
  try {
    const response = await fetch(fileUri);
    fileBlob = await response.blob();
  } catch (fetchErr) {
    throw new PortfolioUploadError(
      `Could not read the selected file: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`
    );
  }

  // 5. Upload to Supabase Storage
  const { error: storageError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileBlob, {
      contentType: mimeType,
      upsert: false, // Requirement 1.6: reject if path already exists
    });

  if (storageError) {
    throw new PortfolioUploadError(`Upload failed. Please try again. (${storageError.message})`);
  }

  // 6. Insert metadata row — compensating delete if this fails (Requirement 4.12)
  const { data: insertedRow, error: dbError } = await supabase
    .from(TABLE_NAME)
    .insert({
      user_id: userId,
      storage_path: storagePath,
      caption: caption ?? null,
    })
    .select()
    .single();

  if (dbError || !insertedRow) {
    // Compensating delete to prevent orphaned storage file
    await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
    throw new PortfolioUploadError('Upload failed. Please try again.');
  }

  // 7. Resolve signed URL for the new photo
  let signedUrl: string | undefined;
  let signedUrlExpiresAt: number | undefined;
  try {
    const result = await getSignedUrl(storagePath);
    signedUrl = result.url;
    signedUrlExpiresAt = result.expiresAt;
  } catch {
    // Non-fatal: photo was uploaded successfully; URL can be fetched later
  }

  return {
    ...(insertedRow as PortfolioPhoto),
    signedUrl,
    signedUrlExpiresAt,
  };
}

/**
 * Delete a portfolio photo: removes the storage file first, then the DB row.
 *
 * - If storage delete fails, throws PortfolioDeleteError and leaves DB row intact.
 * - If DB delete fails after storage succeeds, retries once before throwing.
 *
 * Validates: Requirements 5.5, 5.7
 */
export async function deletePortfolioPhoto(photo: PortfolioPhoto): Promise<void> {
  // 1. Delete from storage first
  const { error: storageError } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([photo.storage_path]);

  if (storageError) {
    throw new PortfolioDeleteError(
      `Could not delete photo. Please try again. (${storageError.message})`
    );
  }

  // 2. Delete DB row; retry once on failure (Requirement 5.5)
  const deleteRow = () =>
    supabase.from(TABLE_NAME).delete().eq('id', photo.id);

  const { error: dbError } = await deleteRow();

  if (dbError) {
    // One automatic retry
    const { error: retryError } = await deleteRow();
    if (retryError) {
      throw new PortfolioDeleteError(
        'Photo removed from storage but metadata could not be deleted. Please try again.'
      );
    }
  }
}

// ─── Re-export constants for use in hooks/components ─────────────────────────

export { MAX_PHOTOS_PER_USER, SIGNED_URL_TTL_SECONDS };
