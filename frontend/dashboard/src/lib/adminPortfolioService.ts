import { supabase } from './supabase';

export interface AdminPortfolioPhoto {
  id: string;
  storage_path: string;
  caption: string | null;
  uploaded_at: string;
  signedUrl: string | null;   // null if URL generation failed
  signedUrlExpiresAt: number; // Unix ms
}

export class PortfolioFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortfolioFetchError';
  }
}

/**
 * Fetch portfolio rows for a candidate and resolve signed URLs.
 * Per-photo URL failures are caught; the photo is included with signedUrl = null.
 * Throws PortfolioFetchError only if the DB query itself fails.
 */
export async function fetchCandidatePortfolio(
  candidateUserId: string
): Promise<AdminPortfolioPhoto[]> {
  const { data, error } = await supabase
    .from('work_portfolio_photos')
    .select('id, storage_path, caption, uploaded_at')
    .eq('user_id', candidateUserId)
    .order('uploaded_at', { ascending: true });

  if (error) {
    throw new PortfolioFetchError(`Failed to fetch portfolio: ${error.message}`);
  }

  const rows = data ?? [];

  const photos: AdminPortfolioPhoto[] = await Promise.all(
    rows.map(async (row) => {
      try {
        const { data: urlData, error: urlError } = await supabase.storage
          .from('work-portfolio-photos')
          .createSignedUrl(row.storage_path, 3600);

        if (urlError || !urlData?.signedUrl) {
          return {
            id: row.id,
            storage_path: row.storage_path,
            caption: row.caption,
            uploaded_at: row.uploaded_at,
            signedUrl: null,
            signedUrlExpiresAt: 0,
          };
        }

        return {
          id: row.id,
          storage_path: row.storage_path,
          caption: row.caption,
          uploaded_at: row.uploaded_at,
          signedUrl: urlData.signedUrl,
          signedUrlExpiresAt: Date.now() + 3600 * 1000,
        };
      } catch {
        return {
          id: row.id,
          storage_path: row.storage_path,
          caption: row.caption,
          uploaded_at: row.uploaded_at,
          signedUrl: null,
          signedUrlExpiresAt: 0,
        };
      }
    })
  );

  return photos;
}
