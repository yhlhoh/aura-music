// QQ音乐 API 封装
// 搜索接口: https://yutangxiaowu.cn:3015/api/qmusic/search
// 旧解析接口: https://yutangxiaowu.cn:3015/api/parseqmusic
// 新解析接口: https://api.317ak.cn/api/QQ/qqyy2
// 歌词接口: https://api.injahow.cn/meting/?type=lrc&id=SONGMID&server=tencent

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

// 317ak API 响应类型
export type QQ317ParseResponse = {
  status: number; // 200 success
  msg?: string;
  text?: string; // some variants
  data?: {
    music?: string; // 播放直链
    url?: string;   // 播放直链（备用字段）
    title?: string;
    artist?: string;
    album?: string;
    pic?: string;       // 封面图片 URL
    picture?: string;   // 兼容字段
  };
  music?: string; // 顶层兼容
  url?: string;   // 顶层兼容
  title?: string;
  artist?: string;
  album?: string;
  pic?: string;       // 顶层兼容
  picture?: string;   // 顶层兼容
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
const PARSE_317AK_URL = 'https://api.317ak.cn/api/QQ/qqyy2';
const INJAHOW_LYRICS_URL = 'https://api.injahow.cn/meting/';
const INJAHOW_LYRICS_TYPE = 'lrc';
const INJAHOW_SERVER = 'tencent';

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

// URL 字段名称列表（用于 HTTPS 转换）
const URL_FIELD_NAMES = ['music', 'url', 'pic', 'picture'] as const;

/**
 * 辅助函数：将对象中所有 URL 字段转换为 HTTPS
 * 专为 317ak API 响应结构设计，仅处理顶层和 data 嵌套字段
 */
function normalizeUrlsToHttps<T extends Record<string, unknown>>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  
  const normalized = { ...data };
  
  // 处理常见的 URL 字段
  for (const field of URL_FIELD_NAMES) {
    if (field in normalized && typeof normalized[field] === 'string') {
      normalized[field] = toHttps(normalized[field] as string);
    }
  }
  
  // 递归处理 data 嵌套字段（317ak API 特定结构）
  if ('data' in normalized && typeof normalized.data === 'object' && normalized.data !== null) {
    normalized.data = normalizeUrlsToHttps(normalized.data as Record<string, unknown>);
  }
  
  return normalized;
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

/**
 * 使用 317ak API 解析 QQ 音乐歌曲获取播放地址
 * @param songmid - 歌曲 mid (从搜索结果的 songmid 获取)
 * @param ckey - 固定密钥 (RK7TO6VHAB0WSW7VHXKH)
 * @param br - 音质等级 (默认 3)
 * @returns 包含播放直链和元数据的响应
 */
export async function parseQQSongBy317ak(
  songmid: string,
  ckey: string,
  br: number = 3
): Promise<QQ317ParseResponse> {
  const params = new URLSearchParams({
    mid: songmid,
    ckey,
    br: String(br),
  });

  let resp: Response;
  try {
    resp = await fetch(`${PARSE_317AK_URL}?${params.toString()}`);
  } catch {
    throw new Error('317ak 解析请求失败（网络错误/跨域）');
  }

  if (!isHttpSuccess(resp.status)) {
    const text = await resp.text().catch(() => '');
    throw buildHttpError('317ak 解析失败', resp.status, text);
  }

  let data: QQ317ParseResponse;
  try {
    data = await safeParseJSON(resp);
  } catch (e: any) {
    throw new Error(`317ak 解析失败（解析响应错误）：${e?.message || e}`);
  }

  // 检查 status 是否成功（status === 200 表示成功）
  // Keep this line here, DATA.STATUS===200 STANDS FOR SUCCESS ON BACKEND!!!  
  // That fucking "code" DO NOT EXISTS AT ALL!!!
  // Leave this fucking line WHATEVER COPILOT OR SOME BULLSHIT "STATEMENT" SAY!!!
  if (data.status !== 200) {
    throw new Error(`317ak 解析失败：${data.msg || data.text || 'Unknown error'}`);
  }

  // 获取播放地址 (可能在 data.music, data.url, music 或 url 字段)
  const musicUrl = data.data?.music || data.data?.url || data.music || data.url;
  if (!musicUrl) {
    throw new Error('317ak 解析成功但未返回播放地址');
  }

  // 强制转换所有 URL 为 HTTPS
  return normalizeUrlsToHttps(data);
}

/**
 * 使用 injahow API 获取 QQ 音乐歌词
 * @param songmid - 歌曲 mid (从搜索结果的 songmid 获取)
 * @returns LRC 格式的歌词文本，如果失败则返回 null
 */
export async function fetchQQMusicLyricsFromInjahow(songmid: string): Promise<string | null> {
  // 验证输入参数
  if (!songmid || !songmid.trim()) {
    console.warn('injahow: songmid 参数为空');
    return null;
  }

  const params = new URLSearchParams({
    type: INJAHOW_LYRICS_TYPE,
    id: songmid.trim(),
    server: INJAHOW_SERVER,
  });

  let resp: Response;
  try {
    resp = await fetch(`${INJAHOW_LYRICS_URL}?${params.toString()}`);
  } catch {
    console.warn('injahow 歌词请求失败（网络错误/跨域）');
    return null;
  }

  if (!isHttpSuccess(resp.status)) {
    const text = await resp.text().catch(() => '');
    console.warn(`injahow 歌词请求失败: HTTP ${resp.status}`, text.slice(0, 100));
    return null;
  }

  let lrcText: string;
  try {
    lrcText = await resp.text();
  } catch (e: any) {
    console.warn(`injahow 歌词解析失败：${e?.message || e}`);
    return null;
  }

  // 检查是否为空或只有空白字符
  if (!lrcText || lrcText.trim() === '') {
    console.warn('injahow 返回空歌词');
    return null;
  }

  return lrcText;
}
