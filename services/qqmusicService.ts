// qqmusicService.ts
// QQ音乐API服务封装，支持搜索和自定义cookie
import qqMusic from 'qq-music-api';

// 设置QQ音乐cookie（字符串或对象）
export function setQqMusicCookie(cookie: string | Record<string, string>) {
  qqMusic.setCookie(cookie);
}

// 搜索QQ音乐歌曲
export async function searchQqMusic(key: string, pageNo = 1, pageSize = 20) {
  try {
    const res = await qqMusic.api('search', { key, pageNo, pageSize });
    // 统一返回格式，便于前端展示
    if (res.result === 100 && res.data && Array.isArray(res.data.list)) {
      return res.data.list.map((item: any) => ({
        id: item.songmid,
        title: item.songname,
        artist: item.singer?.map((s: any) => s.name).join('/') || '',
        album: item.albumname,
        coverUrl: item.albummid
          ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.albummid}.jpg`
          : '',
        fileUrl: '', // 需要二次请求/song/urls获取真实播放链接
        isQq: true,
        qqId: item.songmid,
        duration: item.interval ? item.interval * 1000 : 0,
        lyrics: [],
        needsLyricsMatch: true,
      }));
    }
    return [];
  } catch (err) {
    console.error('QQ音乐搜索失败', err);
    return [];
  }
}

// 获取QQ音乐歌曲播放链接
export async function getQqMusicSongUrl(songmid: string) {
  try {
    const res = await qqMusic.api('song/urls', { id: songmid });
    if (res.result === 100 && res.data && res.data[songmid]) {
      return res.data[songmid];
    }
    return '';
  } catch (err) {
    console.error('获取QQ音乐播放链接失败', err);
    return '';
  }
}
