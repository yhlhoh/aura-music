export interface LyricWord {
  text: string;
  startTime: number;
  endTime: number;
}

export interface LyricLine {
  time: number; // Start time in seconds
  text: string; // Main text (e.g. Original Language)
  translation?: string; // Secondary text (e.g. Translation)
  words?: LyricWord[]; // For enhanced LRC animation of the main text
  isPreciseTiming?: boolean; // If true, end times are exact (from YRC) and shouldn't be auto-extended
  isInterlude?: boolean; // If true, this is an instrumental interlude line ("...")
  isMetadata?: boolean; // If true, line represents metadata and shouldn't drive playback
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  fileUrl: string;
  coverUrl?: string;
  lyrics?: LyricLine[];
  colors?: string[]; // Array of dominant colors
  needsLyricsMatch?: boolean; // Flag indicating song needs cloud lyrics matching
  // Netease specific fields
  isNetease?: boolean;
  neteaseId?: string;
  album?: string;
  // QQ Music specific fields
  isQQMusic?: boolean;
  qqMusicMid?: string;
  // 标记数据是否需要补全 ID (用于历史数据迁移)
  needsIdBackfill?: boolean;
}

/**
 * 获取歌曲的唯一标识键
 * 使用 "平台:ID" 作为唯一标识，避免歌名重复导致的混淆
 * @param song 歌曲对象
 * @returns 唯一标识字符串，格式为 "平台:ID"
 */
export function getSongUniqueKey(song: Song): string {
  // 网易云音乐：使用 netease:neteaseId
  if (song.isNetease && song.neteaseId) {
    return `netease:${song.neteaseId}`;
  }
  // QQ 音乐：使用 qq:qqMusicMid
  if (song.isQQMusic && song.qqMusicMid) {
    return `qq:${song.qqMusicMid}`;
  }
  
  // 降级方案：如果没有平台 ID，使用原 id 或 "平台:title" 组合
  // 这适用于：1) 本地文件 (id 格式为 local-timestamp-index)
  //         2) 历史数据（标记为 needsIdBackfill）
  if (song.id && song.id.startsWith('local-')) {
    return song.id; // 本地文件使用原 ID
  }
  
  // 对于缺失 ID 的网易云或 QQ 音乐歌曲，使用 "平台:title" 降级
  // 并在键中添加 @pending 标记，表明这是临时标识
  if (song.isNetease && song.needsIdBackfill) {
    return `netease:${song.title}@pending`;
  }
  if (song.isQQMusic && song.needsIdBackfill) {
    return `qq:${song.title}@pending`;
  }
  
  // 最终降级：使用原 id 或 "unknown:title"
  return song.id || `unknown:${song.title}`;
}

/**
 * 判断两首歌曲是否相同
 * 基于平台+ID 判断，而非歌名
 * @param song1 歌曲1
 * @param song2 歌曲2
 * @returns 是否为同一首歌
 */
export function isSameSong(song1: Song, song2: Song): boolean {
  return getSongUniqueKey(song1) === getSongUniqueKey(song2);
}

export enum PlayState {
  PAUSED,
  PLAYING,
}

export enum PlayMode {
  LOOP_ALL,
  LOOP_ONE,
  SHUFFLE
}
