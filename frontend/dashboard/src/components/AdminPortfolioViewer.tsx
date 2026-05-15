import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ImageOff, X, ZoomIn } from 'lucide-react';
import {
  fetchCandidatePortfolio,
  AdminPortfolioPhoto,
  PortfolioFetchError,
} from '../lib/adminPortfolioService';

const SIGNED_URL_TTL_MS = 3600 * 1000; // 1 hour in ms
const REFRESH_CHECK_INTERVAL_MS = 30_000; // check every 30 s
const REFRESH_THRESHOLD_MS = 60_000; // refresh if expiring within 60 s

interface AdminPortfolioViewerProps {
  candidateUserId: string;
}

export function AdminPortfolioViewer({ candidateUserId }: AdminPortfolioViewerProps) {
  const [photos, setPhotos] = useState<AdminPortfolioPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<AdminPortfolioPhoto | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Initial fetch ──────────────────────────────────────────────────────────

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await fetchCandidatePortfolio(candidateUserId);
      setPhotos(data);
    } catch (err) {
      if (err instanceof PortfolioFetchError) {
        setFetchError(err.message);
      } else {
        setFetchError('Could not load portfolio photos.');
      }
    } finally {
      setLoading(false);
    }
  }, [candidateUserId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  // ── Signed URL auto-refresh (Requirement 8.4) ─────────────────────────────

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      const now = Date.now();
      const expiring = photos.filter(
        (p) => p.signedUrl !== null && p.signedUrlExpiresAt - now < REFRESH_THRESHOLD_MS
      );
      if (expiring.length === 0) return;

      // Re-fetch only expiring photos' signed URLs
      const { supabase } = await import('../lib/supabase');
      const refreshed = await Promise.all(
        expiring.map(async (p) => {
          try {
            const { data, error } = await supabase.storage
              .from('work-portfolio-photos')
              .createSignedUrl(p.storage_path, 3600);
            if (error || !data?.signedUrl) return p;
            return {
              ...p,
              signedUrl: data.signedUrl,
              signedUrlExpiresAt: now + SIGNED_URL_TTL_MS,
            };
          } catch {
            return p;
          }
        })
      );

      setPhotos((prev) =>
        prev.map((p) => {
          const updated = refreshed.find((r) => r.id === p.id);
          return updated ?? p;
        })
      );
    }, REFRESH_CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [photos]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="portfolio-section">
      <h4 className="portfolio-section-title">Work Portfolio</h4>

      {/* Scoped error — does not affect rest of panel (Requirement 7.7) */}
      {fetchError && (
        <div className="portfolio-error-banner" role="alert">
          <span>{fetchError}</span>
        </div>
      )}

      {loading && (
        <div className="portfolio-loading">
          <span className="portfolio-spinner" aria-label="Loading portfolio photos" />
        </div>
      )}

      {!loading && !fetchError && photos.length === 0 && (
        <p className="portfolio-empty">No portfolio photos available.</p>
      )}

      {!loading && photos.length > 0 && (
        <div className="portfolio-grid" role="list" aria-label="Work portfolio photos">
          {photos.map((photo) => (
            <div key={photo.id} className="portfolio-item" role="listitem">
              <button
                className="portfolio-thumb-btn"
                onClick={() => setLightboxPhoto(photo)}
                aria-label={photo.caption ?? 'View work photo'}
                title={photo.caption ?? 'View work photo'}
              >
                {photo.signedUrl ? (
                  <>
                    <img
                      src={photo.signedUrl}
                      alt={photo.caption ?? 'Work photo'}
                      className="portfolio-thumb-img"
                      loading="lazy"
                    />
                    <div className="portfolio-thumb-overlay">
                      <ZoomIn size={18} color="#fff" />
                    </div>
                  </>
                ) : (
                  <div className="portfolio-thumb-broken" aria-label="Image unavailable">
                    <ImageOff size={24} color="#9ca3af" />
                  </div>
                )}
              </button>
              {photo.caption && (
                <p className="portfolio-thumb-caption" title={photo.caption}>
                  {photo.caption}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Lightbox modal (Requirement 7.5) ── */}
      {lightboxPhoto && (
        <div
          className="portfolio-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Photo lightbox"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="portfolio-lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="portfolio-lightbox-close"
              onClick={() => setLightboxPhoto(null)}
              aria-label="Close lightbox"
            >
              <X size={20} />
            </button>

            {lightboxPhoto.signedUrl ? (
              <img
                src={lightboxPhoto.signedUrl}
                alt={lightboxPhoto.caption ?? 'Work photo'}
                className="portfolio-lightbox-img"
              />
            ) : (
              <div className="portfolio-lightbox-broken">
                <ImageOff size={48} color="#9ca3af" />
                <p>Image unavailable</p>
              </div>
            )}

            {lightboxPhoto.caption && (
              <p className="portfolio-lightbox-caption">{lightboxPhoto.caption}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
