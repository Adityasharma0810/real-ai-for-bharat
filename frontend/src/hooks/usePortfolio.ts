import { useState, useEffect, useCallback } from 'react';
import {
  PortfolioPhoto,
  fetchPortfolioPhotos,
  uploadPortfolioPhoto,
  deletePortfolioPhoto,
  MAX_PHOTOS_PER_USER,
} from '../services/portfolioService';

export interface UsePortfolioResult {
  photos: PortfolioPhoto[];
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;
  uploadError: string | null;
  addPhoto: (
    fileUri: string,
    mimeType: string,
    fileSize: number,
    caption?: string
  ) => Promise<void>;
  removePhoto: (photo: PortfolioPhoto) => Promise<void>;
  refresh: () => Promise<void>;
  /** true when photos.length >= MAX_PHOTOS_PER_USER (20) */
  atLimit: boolean;
}

export function usePortfolio(userId: string): UsePortfolioResult {
  const [photos, setPhotos] = useState<PortfolioPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const loadPhotos = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPortfolioPhotos(userId);
      setPhotos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load portfolio photos.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Load on mount and when userId changes
  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const addPhoto = useCallback(
    async (fileUri: string, mimeType: string, fileSize: number, caption?: string) => {
      // Guard: enforce 20-photo cap (Requirement 4.13)
      if (photos.length >= MAX_PHOTOS_PER_USER) {
        setUploadError(
          `You've reached the maximum of ${MAX_PHOTOS_PER_USER} photos. Delete a photo to add a new one.`
        );
        return;
      }

      setIsUploading(true);
      setUploadError(null);

      try {
        const newPhoto = await uploadPortfolioPhoto({
          userId,
          fileUri,
          mimeType,
          fileSize,
          caption,
        });
        // Append new photo to list without full reload (Requirement 4.9)
        setPhotos((prev) => [newPhoto, ...prev]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      } finally {
        setIsUploading(false);
      }
    },
    [userId, photos.length]
  );

  const removePhoto = useCallback(
    async (photo: PortfolioPhoto) => {
      // Optimistic removal (Requirement 5.6)
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      setError(null);

      try {
        await deletePortfolioPhoto(photo);
      } catch (err) {
        // Roll back optimistic removal on failure
        setPhotos((prev) => {
          // Re-insert at original position (by uploaded_at desc order)
          const updated = [...prev, photo].sort(
            (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
          );
          return updated;
        });
        setError(err instanceof Error ? err.message : 'Could not delete photo. Please try again.');
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    await loadPhotos();
  }, [loadPhotos]);

  return {
    photos,
    isLoading,
    isUploading,
    error,
    uploadError,
    addPhoto,
    removePhoto,
    refresh,
    atLimit: photos.length >= MAX_PHOTOS_PER_USER,
  };
}
