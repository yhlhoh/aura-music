// QQ音乐 API 封装
// 搜索接口: https://yutangxiaowu.cn:3015/api/qmusic/search
// 解析接口: https://yutangxiaowu.cn:3015/api/parseqmusic

export type QQSongItem = {
  albumid: number;
  albummid: string;
  albumname: string;
  songid: number;
  songmid: string;
  songname: string;
  singer: Array<{ id: number; mid: string; name: string }>;
  interval: number;
  size128?: number;
  size320?: number;
  sizeflac?: number;
  pay?: { payplay?: number; paydownload?: number };
};

export type QQSearchResponse = {
  result: number;
  data: {
    list: QQSongItem[];
    pageNo: number;
    pageSize: number;
    total: number;
    key: string;
    t: string;
    type: string;
  };
};

export type QQParseResponse = {
  success: boolean;
  detail: {
    songName: string;
    singer?: string;
    singerName?: string;
    album?: string;
    duration?: string;
    interval?: number;
  };
  songmid: string;
  url: string; // 播放地址
  lyric?: string;
};

export interface QQTrackInfo {
  id: string;
  title: string;
  artist: string;
  album: string;
  songmid: string;
  songurl?: string;
  duration?: number;
  payplay?: number;
}

const SEARCH_URL = 'https://yutangxiaowu.cn:3015/api/qmusic/search';
const PARSE_URL = 'https://yutangxiaowu.cn:3015/api/parseqmusic';

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

export async function searchQQMusic(
  key: string,
  pageNo = 1,
  pageSize = 10
): Promise<QQTrackInfo[]> {
  const params = new URLSearchParams({
    key,
    t: '0', // 0=单曲
    pageNo: String(pageNo),
    pageSize: String(pageSize),
  });

  let resp: Response;
  try {
    resp = await fetch(`${SEARCH_URL}?${params.toString()}`);
  } catch {
    throw new Error('搜索请求失败（网络错误/跨域）');
  }

  if (!isHttpSuccess(resp.status)) {
    const text = await resp.text().catch(() => '');
    throw buildHttpError('搜索失败', resp.status, text);
  }

  let data: QQSearchResponse;
  try {
    data = await safeParseJSON(resp);
  } catch (e: any) {
    throw new Error(`搜索失败（解析响应错误）：${e?.message || e}`);
  }

  if (!data?.data?.list) {
    // 有些实现会把数据直接放在 data.list，没有 data 包装时返回空数组防止 UI 报错
    const list = (data as any)?.list;
    if (Array.isArray(list)) {
      return transformToTrackInfo(list as QQSongItem[]);
    }
    return [];
  }
  return transformToTrackInfo(data.data.list);
}

// 将 QQSongItem 转换为 QQTrackInfo
function transformToTrackInfo(items: QQSongItem[]): QQTrackInfo[] {
  return items.map(item => {
    const artistNames = item.singer.map(s => s.name).join(' / ');
    return {
      id: `qq-${item.songmid}`,
      title: item.songname,
      artist: artistNames,
      album: item.albumname,
      songmid: item.songmid,
      songurl: undefined, // API doesn't provide direct song URL in search results
      duration: item.interval,
      payplay: item.pay?.payplay,
    };
  });
}

export async function parseQQSongByMid(songmid: string): Promise<QQParseResponse> {
  const params = new URLSearchParams({ songmid });

  let resp: Response;
  try {
    resp = await fetch(`${PARSE_URL}?${params.toString()}`);
  } catch {
    throw new Error('解析请求失败（网络错误/跨域）');
  }

  if (!isHttpSuccess(resp.status)) {
    const text = await resp.text().catch(() => '');
    throw buildHttpError('解析失败', resp.status, text);
  }

  let data: QQParseResponse;
  try {
    data = await safeParseJSON(resp);
  } catch (e: any) {
    throw new Error(`解析失败（解析响应错误）：${e?.message || e}`);
  }

  if (!data?.success) {
    throw new Error('解析返回 success=false');
  }
  if (!data?.url) {
    throw new Error('解析成功但未返回播放地址');
  }
  return data;
}

export async function parseQQSongByUrl(url: string): Promise<QQParseResponse> {
  const params = new URLSearchParams({ url });

  let resp: Response;
  try {
    resp = await fetch(`${PARSE_URL}?${params.toString()}`);
  } catch {
    throw new Error('解析请求失败（网络错误/跨域）');
  }

  if (!isHttpSuccess(resp.status)) {
    const text = await resp.text().catch(() => '');
    throw buildHttpError('解析失败', resp.status, text);
  }

  let data: QQParseResponse;
  try {
    data = await safeParseJSON(resp);
  } catch (e: any) {
    throw new Error(`解析失败（解析响应错误）：${e?.message || e}`);
  }

  if (!data?.success) {
    throw new Error('解析返回 success=false');
  }
  if (!data?.url) {
    throw new Error('解析成功但未返回播放地址');
  }
  return data;
}
