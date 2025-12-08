/**
 * lrc.cx Lyrics API Service
 * 
 * Provides lyrics fetching from lrc.cx API using song metadata.
 * Supports both single LRC text and batch JSON responses.
 */

const LRC_CX_API_BASE = 'https://api.lrc.cx/api/v1/lyrics';

/**
 * Batch lyrics response format from lrc.cx API
 */
export interface LrcCxBatchResult {
  id: string;
  title: string;
  artist: string;
  lyrics: string;
}

/**
 * Fetch single LRC lyrics from lrc.cx API
 * 
 * @param title - Song title (optional)
 * @param album - Album name (optional)
 * @param artist - Artist name (optional)
 * @returns Promise resolving to LRC text content, or null if not found
 * 
 * @example
 * const lyrics = await fetchLyricsSingle('Perfect', 'Divide', 'Ed Sheeran');
 * console.log(lyrics); // "[00:00.00]Perfect\n[00:12.34]I found a love..."
 */
export async function fetchLyricsSingle(
  title?: string,
  album?: string,
  artist?: string
): Promise<string | null> {
  // Build query parameters
  const params = new URLSearchParams();
  if (title) params.append('title', title);
  if (album) params.append('album', album);
  if (artist) params.append('artist', artist);

  // Return null if no search parameters provided
  if (params.toString() === '') {
    console.warn('lrc.cx: No search parameters provided');
    return null;
  }

  const url = `${LRC_CX_API_BASE}/single?${params.toString()}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`lrc.cx: Failed to fetch lyrics (HTTP ${response.status})`);
      return null;
    }

    // Response is text/html containing LRC content
    const text = await response.text();
    
    // Check if response is empty or contains error indicators
    if (!text || text.trim() === '' || text.includes('404') || text.includes('Not Found')) {
      console.warn('lrc.cx: No lyrics found');
      return null;
    }

    return text;
  } catch (error) {
    console.error('lrc.cx: Error fetching lyrics:', error);
    return null;
  }
}

/**
 * Fetch batch lyrics from lrc.cx API (returns JSON array)
 * 
 * @param title - Song title (optional)
 * @param album - Album name (optional)
 * @param artist - Artist name (optional)
 * @returns Promise resolving to array of lyrics results, or empty array if error
 * 
 * @example
 * const results = await fetchLyricsBatch('Perfect', 'Divide', 'Ed Sheeran');
 * console.log(results[0].lyrics); // LRC content
 */
export async function fetchLyricsBatch(
  title?: string,
  album?: string,
  artist?: string
): Promise<LrcCxBatchResult[]> {
  // Build query parameters
  const params = new URLSearchParams();
  if (title) params.append('title', title);
  if (album) params.append('album', album);
  if (artist) params.append('artist', artist);

  // Return empty array if no search parameters provided
  if (params.toString() === '') {
    console.warn('lrc.cx: No search parameters provided');
    return [];
  }

  const url = `${LRC_CX_API_BASE}/advance?${params.toString()}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`lrc.cx: Failed to fetch batch lyrics (HTTP ${response.status})`);
      return [];
    }

    // Response is application/json
    const data = await response.json();
    
    // Validate response is an array
    if (!Array.isArray(data)) {
      console.warn('lrc.cx: Invalid batch response format');
      return [];
    }

    return data;
  } catch (error) {
    console.error('lrc.cx: Error fetching batch lyrics:', error);
    return [];
  }
}
