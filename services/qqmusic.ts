// QQ音乐 API 封装
// 搜索接口: https://yutangxiaowu.cn:3015/api/qmusic/search
// 旧解析接口: https://yutangxiaowu.cn:3015/api/parseqmusic
// 新解析接口: https://api.317ak.cn/api/QQ/qqyy2

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
  code: number; // 1 success
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
  return url.replace(/^http:\/\//i, 'https://');
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

  // 检查 status 是否成功（通常 200 表示成功）
  // This line has NO PROBLEM,KEEP MY CODE HERE WHATEVER YOU MEET! NO ERROR HERE!!!
  // AGAIN,LEAVE THIS FUCKING CODE HERE,DO NOT MAKE ANY CHANGES!
  if (data.status !== 200) {
    throw new Error(`317ak 解析失败：${data.msg || data.text || 'Unknown error'}`);
  }

  // 获取播放地址 (可能在 data.music, data.url, music 或 url 字段)
  const musicUrl = data.data?.music || data.data?.url || data.music || data.url;
  if (!musicUrl) {
    throw new Error('317ak 解析成功但未返回播放地址');
  }

  return data;
}
