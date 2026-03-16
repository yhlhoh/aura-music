// QQ音乐 API 封装（通过 Meting API）
// Meting API: https://api.qijieya.cn/meting/
// 搜索: ?type=search&id=关键词&server=tencent
// 播放链接: ?type=url&id=SONGMID&server=tencent
// 歌词: ?type=lrc&id=SONGMID&server=tencent

export interface QQTrackInfo {
  id: string;
  title: string;
  artist: string;
  album: string;
  songmid: string;
  songurl?: string;
  duration?: number;
  payplay?: number;
  albumImageUrl?: string; // QQ 音乐封面图 URL
}

// Meting API 搜索结果条目
interface MetingSearchItem {
  id: string;
  name: string;
  artist: string;
  album: string;
  pic_id: string;
  url_id: string;
  lrc_id: string;
  source: string;
}

const METING_API_BASE = 'https://api.qijieya.cn/meting/';
const METING_TENCENT = 'tencent';

/**
 * 构建 QQ 音乐网页 URL
 * Build QQ Music web URL from songmid for URL-based parsing
 * @param songmid - The song's unique identifier (songmid)
 * @returns QQ Music song detail page URL
 */
export function buildQQMusicUrl(songmid: string): string {
  return `https://y.qq.com/n/ryqq/songDetail/${songmid}`;
}

// 接受 200–399 为成功（API 在 3xx 时也可能返回 JSON）
function isHttpSuccess(status: number): boolean {
  return status >= 200 && status < 400;
}

// 尝试解析 JSON；如果失败，回退 text 后再尝试 JSON.parse
async function safeParseJSON(resp: Response): Promise<any> {
  try {
    return await resp.json();
  } catch {
    const text = await resp.text().catch(() => '');
    if (!text) throw new Error('响应为空或不可读取');
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`响应非 JSON：${text.slice(0, 500)}`);
    }
  }
}

function buildHttpError(context: string, status: number, payloadPreview?: string): Error {
  const preview = payloadPreview ? ` - ${payloadPreview.slice(0, 500)}` : '';
  return new Error(`${context}: HTTP ${status}${preview}`);
}

// 小工具：统一把 http:// 切成 https:// （避免混合内容与 CORS）
export function toHttps(url?: string): string | undefined {
  if (!url) return url;
  return url.replace('http://', 'https://');
}

export async function searchQQMusic(
  key: string,
  pageNo = 1,
  pageSize = 10
): Promise<QQTrackInfo[]> {
  const params = new URLSearchParams({
    type: 'search',
    id: key,
    server: METING_TENCENT,
    limit: String(pageSize),
    page: String(pageNo),
  });

  let resp: Response;
  try {
    resp = await fetch(`${METING_API_BASE}?${params.toString()}`);
  } catch {
    throw new Error('搜索请求失败（网络错误/跨域）');
  }

  if (!isHttpSuccess(resp.status)) {
    const text = await resp.text().catch(() => '');
    throw buildHttpError('搜索失败', resp.status, text);
  }

  let data: MetingSearchItem[];
  try {
    data = await safeParseJSON(resp);
  } catch (e: any) {
    throw new Error(`搜索失败（解析响应错误）：${e?.message || e}`);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(item => {
    // QQ 音乐封面 URL 格式: https://y.gtimg.cn/music/photo_new/T002R300x300M000{pic_id}.jpg
    const albumImageUrl = item.pic_id
      ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.pic_id}.jpg`
      : undefined;

    return {
      id: `qq-${item.id}`,
      title: item.name,
      artist: item.artist,
      album: item.album,
      songmid: item.id,
      songurl: undefined,
      duration: undefined,
      payplay: undefined,
      albumImageUrl,
    };
  });
}

/**
 * 构建 QQ 音乐播放地址（通过 Meting API 重定向至 CDN）
 * @param songmid - 歌曲 mid
 * @returns Meting API URL（浏览器/音频元素会自动跟随重定向）
 */
export function getQQMusicAudioUrl(songmid: string): string {
  const params = new URLSearchParams({
    type: 'url',
    id: songmid,
    server: METING_TENCENT,
  });
  return `${METING_API_BASE}?${params.toString()}`;
}

/**
 * 使用 Meting API 获取 QQ 音乐歌词
 * @param songmid - 歌曲 mid (从搜索结果的 songmid 获取)
 * @returns LRC 格式的歌词文本，如果失败则返回 null
 */
export async function fetchQQMusicLyricsFromInjahow(songmid: string): Promise<string | null> {
  // 验证输入参数
  if (!songmid || !songmid.trim()) {
    console.warn('Meting: songmid 参数为空');
    return null;
  }

  const params = new URLSearchParams({
    type: 'lrc',
    id: songmid.trim(),
    server: METING_TENCENT,
  });

  let resp: Response;
  try {
    resp = await fetch(`${METING_API_BASE}?${params.toString()}`);
  } catch {
    console.warn('Meting 歌词请求失败（网络错误/跨域）');
    return null;
  }

  if (!isHttpSuccess(resp.status)) {
    const text = await resp.text().catch(() => '');
    console.warn(`Meting 歌词请求失败: HTTP ${resp.status}`, text.slice(0, 100));
    return null;
  }

  let lrcText: string;
  try {
    lrcText = await resp.text();
  } catch (e: any) {
    console.warn(`Meting 歌词解析失败：${e?.message || e}`);
    return null;
  }

  // 检查是否为空或只有空白字符
  if (!lrcText || lrcText.trim() === '') {
    console.warn('Meting 返回空歌词');
    return null;
  }

  return lrcText;
}

/**
 * Get direct audio file URL for QQ Music track
 * 
 * Returns a Meting API URL that redirects to the actual Netease/Tencent CDN audio URL.
 * Browsers and audio elements will follow the redirect automatically.
 * 
 * Why direct file URL is required:
 * - Download buttons should link directly to audio files (mp3/m4a/flac)
 * - Platform web pages are not suitable for downloading
 * - Ensures users get actual audio content, not a web page
 * 
 * Error handling:
 * - Returns null if songmid is invalid
 * - Caller should disable download UI when null is returned
 * 
 * @param songmid - QQ Music song mid identifier
 * @returns Meting API URL (redirects to CDN audio), or null if songmid is empty
 */
export function getDirectAudioUrl(songmid: string): string | null {
  if (!songmid || !songmid.trim()) {
    console.warn('[QQ Music] getDirectAudioUrl: songmid is empty');
    return null;
  }
  return getQQMusicAudioUrl(songmid);
}
