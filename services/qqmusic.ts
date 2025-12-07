// QQ Music API Service
// Provides search and playback URL parsing for QQ Music

const QQ_SEARCH_API = "https://yutangxiaowu.cn:3015/api/qmusic/search";
const QQ_PARSE_API = "https://yutangxiaowu.cn:3015/api/parseqmusic";

// Response types from QQ Music API
export interface QQSongItem {
  songmid: string;
  songname: string;
  singer?: Array<{ name: string }>;
  albumname?: string;
  albummid?: string;
  interval?: number; // duration in seconds
}

export interface QQSearchResponse {
  code?: number;
  message?: string;
  data?: {
    list?: QQSongItem[];
    total?: number;
  };
}

export interface QQParseResponse {
  code?: number;
  message?: string;
  data?: {
    url?: string;
    songmid?: string;
    songname?: string;
    singer?: string;
    albumname?: string;
    interval?: number;
    lyric?: string;
  };
}

export interface QQTrackInfo {
  id: string;
  title: string;
  artist: string;
  album: string;
  songmid: string;
  duration?: number;
  isQQMusic: true;
}

/**
 * Search QQ Music for songs
 * @param key - Search keyword
 * @param pageNo - Page number (default: 1)
 * @param pageSize - Results per page (default: 10)
 * @returns Array of QQTrackInfo
 */
export const searchQQMusic = async (
  key: string,
  pageNo: number = 1,
  pageSize: number = 10,
): Promise<QQTrackInfo[]> => {
  if (!key.trim()) {
    throw new Error("Search keyword cannot be empty");
  }

  const params = new URLSearchParams({
    key: key.trim(),
    t: "0", // 0 for songs
    pageNo: pageNo.toString(),
    pageSize: pageSize.toString(),
  });

  try {
    const response = await fetch(`${QQ_SEARCH_API}?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`QQ Music search failed: ${response.status} ${response.statusText}`);
    }

    const data: QQSearchResponse = await response.json();

    if (data.code !== 0) {
      throw new Error(data.message || "QQ Music search failed");
    }

    const songs = data.data?.list || [];
    
    return songs.map(mapQQSongToTrack);
  } catch (error) {
    console.error("QQ Music search error:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to search QQ Music");
  }
};

/**
 * Parse a QQ Music song to get playable URL and metadata
 * @param songmid - QQ Music song mid
 * @returns Parse response with URL and metadata
 */
export const parseQQSongByMid = async (
  songmid: string,
): Promise<QQParseResponse> => {
  if (!songmid.trim()) {
    throw new Error("Song mid cannot be empty");
  }

  const params = new URLSearchParams({
    songmid: songmid.trim(),
  });

  try {
    const response = await fetch(`${QQ_PARSE_API}?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`QQ Music parse failed: ${response.status} ${response.statusText}`);
    }

    const data: QQParseResponse = await response.json();

    if (data.code !== 0) {
      throw new Error(data.message || "Failed to parse QQ Music song");
    }

    if (!data.data?.url) {
      throw new Error("No playable URL returned");
    }

    return data;
  } catch (error) {
    console.error("QQ Music parse error:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to parse QQ Music song");
  }
};

/**
 * Parse a QQ Music song URL to get playable URL and metadata
 * @param url - QQ Music song URL
 * @returns Parse response with URL and metadata
 */
export const parseQQSongByUrl = async (url: string): Promise<QQParseResponse> => {
  if (!url.trim()) {
    throw new Error("URL cannot be empty");
  }

  const params = new URLSearchParams({
    url: url.trim(),
  });

  try {
    const response = await fetch(`${QQ_PARSE_API}?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`QQ Music parse failed: ${response.status} ${response.statusText}`);
    }

    const data: QQParseResponse = await response.json();

    if (data.code !== 0) {
      throw new Error(data.message || "Failed to parse QQ Music URL");
    }

    if (!data.data?.url) {
      throw new Error("No playable URL returned");
    }

    return data;
  } catch (error) {
    console.error("QQ Music parse error:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to parse QQ Music URL");
  }
};

/**
 * Helper function to format artists from QQ Music response
 */
const formatQQArtists = (singers?: Array<{ name: string }>): string => {
  if (!singers || singers.length === 0) return "Unknown Artist";
  return singers.map((s) => s.name).join("/");
};

/**
 * Map QQ Music song item to track info
 */
const mapQQSongToTrack = (song: QQSongItem): QQTrackInfo => ({
  id: song.songmid,
  title: song.songname || "Unknown",
  artist: formatQQArtists(song.singer),
  album: song.albumname || "Unknown Album",
  songmid: song.songmid,
  duration: song.interval,
  isQQMusic: true,
});
