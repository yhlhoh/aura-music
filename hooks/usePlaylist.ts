import { useCallback, useState, useEffect } from "react";
import { Song, getSongUniqueKey } from "../types";
import {
  extractColors,
  parseAudioMetadata,
  parseNeteaseLink,
} from "../services/utils";
import { parseLyrics } from "../services/lyrics";
import {
  fetchNeteasePlaylist,
  fetchNeteaseSong,
  getNeteaseAudioUrl,
} from "../services/lyricsService";
import { audioResourceCache } from "../services/cache";

// Levenshtein distance for fuzzy matching
const levenshteinDistance = (str1: string, str2: string): number => {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
};
// Calculate similarity score (0-1, higher is better)
const calculateSimilarity = (str1: string, str2: string): number => {
  const distance = levenshteinDistance(str1, str2);
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
};
export interface ImportResult {
  success: boolean;
  message?: string;
  songs: Song[];
}

export const usePlaylist = () => {
  // 自动恢复 queue
  const [queue, setQueue] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem('aura_playlist_queue');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [originalQueue, setOriginalQueue] = useState<Song[]>([]);

  // 自动存储 queue
  useEffect(() => {
    try {
      localStorage.setItem('aura_playlist_queue', JSON.stringify(queue));
    } catch {}
  }, [queue]);

  const updateSongInQueue = useCallback(
    (id: string, updates: Partial<Song>) => {
      setQueue((prev) =>
        prev.map((song) => (song.id === id ? { ...song, ...updates } : song)),
      );
      setOriginalQueue((prev) =>
        prev.map((song) => (song.id === id ? { ...song, ...updates } : song)),
      );
    },
    [],
  );

  const appendSongs = useCallback((songs: Song[]) => {
    if (songs.length === 0) return;
    setOriginalQueue((prev) => [...prev, ...songs]);
    setQueue((prev) => [...prev, ...songs]);
  }, []);

  const removeSongs = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setQueue((prev) => {
      prev.forEach((song) => {
        if (ids.includes(song.id) && song.fileUrl && !song.fileUrl.startsWith("blob:")) {
          audioResourceCache.delete(song.fileUrl);
        }
      });
      return prev.filter((song) => !ids.includes(song.id));
    });
    setOriginalQueue((prev) => prev.filter((song) => !ids.includes(song.id)));
  }, []);

  /**
   * 去重清理函数：删除队列中的重复歌曲
   * 基于平台+ID 判断，保留第一次出现的版本
   * 用于对历史队列/歌单执行一次性清理
   * @returns 被删除的歌曲数量
   */
  const deduplicateQueue = useCallback(() => {
    const seen = new Set<string>();
    const toKeep: Song[] = [];
    const toRemove: string[] = [];

    queue.forEach((song) => {
      // 使用统一的唯一标识生成函数
      const key = getSongUniqueKey(song);

      if (seen.has(key)) {
        // 重复，标记删除
        toRemove.push(song.id);
      } else {
        // 首次出现，保留
        seen.add(key);
        toKeep.push(song);
      }
    });

    if (toRemove.length > 0) {
      removeSongs(toRemove);
    }

    return toRemove.length;
  }, [queue, removeSongs]);

  /**
   * 导出歌单为 JSON 文件
   * 包含歌曲的所有必要信息，可用于备份和迁移
   */
  const exportPlaylist = useCallback(() => {
    // 准备导出数据（排除 blob URL 和不必要的字段）
    const exportData = queue.map(song => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      coverUrl: song.coverUrl,
      // 平台信息
      isNetease: song.isNetease,
      neteaseId: song.neteaseId,
      isQQMusic: song.isQQMusic,
      qqMusicMid: song.qqMusicMid,
      // 注意：本地文件的 fileUrl (blob:) 不导出，导入时需要重新添加
      fileUrl: song.fileUrl?.startsWith('blob:') ? undefined : song.fileUrl,
    }));

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `aura-playlist-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [queue]);

  /**
   * 从 JSON 文件导入歌单
   * @param file JSON 文件
   * @returns 导入结果统计
   */
  const importPlaylist = useCallback(async (file: File): Promise<{
    success: number;
    skipped: number;
    failed: number;
    errors: string[];
  }> => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) {
        return {
          success: 0,
          skipped: 0,
          failed: 1,
          errors: ['导入失败：文件格式错误，应为歌曲数组'],
        };
      }

      let successCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      // 构建现有歌曲的唯一键集合（用于去重）
      const existingKeys = new Set<string>();
      queue.forEach(song => {
        existingKeys.add(getSongUniqueKey(song));
      });

      const songsToAdd: Song[] = [];

      for (let i = 0; i < data.length; i++) {
        const item = data[i];

        // 校验必要字段
        if (!item.title || !item.artist) {
          failedCount++;
          errors.push(`第 ${i + 1} 首歌曲缺少必要字段（标题或艺术家）`);
          continue;
        }

        // 构建临时 Song 对象用于生成唯一键
        const tempSong: Song = {
          id: item.id || '',
          title: item.title,
          artist: item.artist,
          fileUrl: '',
          isNetease: item.isNetease,
          neteaseId: item.neteaseId,
          isQQMusic: item.isQQMusic,
          qqMusicMid: item.qqMusicMid,
        };
        
        const key = getSongUniqueKey(tempSong);

        // 检查是否重复
        if (existingKeys.has(key)) {
          skippedCount++;
          continue;
        }

        // 构建 Song 对象
        const song: Song = {
          id: item.id || `imported-${Date.now()}-${i}`,
          title: item.title,
          artist: item.artist,
          album: item.album,
          coverUrl: item.coverUrl,
          fileUrl: item.fileUrl || '',
          isNetease: item.isNetease,
          neteaseId: item.neteaseId,
          isQQMusic: item.isQQMusic,
          qqMusicMid: item.qqMusicMid,
          lyrics: [],
          needsLyricsMatch: true,
        };

        // 对于云音乐平台，重新生成 fileUrl
        if (song.isNetease && song.neteaseId) {
          song.fileUrl = getNeteaseAudioUrl(song.id);
        }

        songsToAdd.push(song);
        existingKeys.add(key);
        successCount++;
      }

      // 批量添加歌曲
      if (songsToAdd.length > 0) {
        appendSongs(songsToAdd);
      }

      return {
        success: successCount,
        skipped: skippedCount,
        failed: failedCount,
        errors,
      };
    } catch (error) {
      return {
        success: 0,
        skipped: 0,
        failed: 1,
        errors: [`导入失败：${error instanceof Error ? error.message : '未知错误'}`],
      };
    }
  }, [queue, appendSongs]);

  const addLocalFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileList =
        files instanceof FileList ? Array.from(files) : Array.from(files);

      // Separate audio and lyrics files
      const audioFiles: File[] = [];
      const lyricsFiles: File[] = [];

      fileList.forEach((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (ext === "lrc" || ext === "txt") {
          lyricsFiles.push(file);
        } else {
          audioFiles.push(file);
        }
      });

      const newSongs: Song[] = [];

      // Build lyrics map: extract song title from filename (part after first "-")
      // Remove Netease IDs like (12345678) from title
      const lyricsMap = new Map<string, File>();
      lyricsFiles.forEach((file) => {
        const basename = file.name.replace(/\.[^/.]+$/, "");
        const firstDashIndex = basename.indexOf("-");

        // If has "-", use part after first dash as title, otherwise use full basename
        let title = firstDashIndex > 0 && firstDashIndex < basename.length - 1
          ? basename.substring(firstDashIndex + 1).trim()
          : basename;

        // Remove Netease ID pattern like (12345678) or [12345678]
        title = title.replace(/[\(\[]?\d{7,9}[\)\]]?/g, "").trim();

        lyricsMap.set(title.toLowerCase(), file);
      });

      // Process audio files
      for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        const url = URL.createObjectURL(file);
        const basename = file.name.replace(/\.[^/.]+$/, "");
        let title = basename;
        let artist = "Unknown Artist";
        let coverUrl: string | undefined;
        let colors: string[] | undefined;
        let lyrics: { time: number; text: string }[] = [];

        const nameParts = title.split("-");
        if (nameParts.length > 1) {
          artist = nameParts[0].trim();
          title = nameParts[1].trim();
        }

        try {
          const metadata = await parseAudioMetadata(file);
          if (metadata.title) title = metadata.title;
          if (metadata.artist) artist = metadata.artist;
          if (metadata.picture) {
            coverUrl = metadata.picture;
            colors = await extractColors(coverUrl);
          }

          // Check for embedded lyrics first (highest priority)
          if (metadata.lyrics && metadata.lyrics.trim().length > 0) {
            try {
              lyrics = parseLyrics(metadata.lyrics);
            } catch (err) {
              console.warn("Failed to parse embedded lyrics", err);
            }
          }

          // If no embedded lyrics, try to match lyrics by fuzzy matching
          if (lyrics.length === 0) {
            // Normalize song title for matching
            const songTitle = title.toLowerCase().trim();

            // Try exact match first
            let matchedLyricsFile = lyricsMap.get(songTitle);

            // If no exact match, try fuzzy matching
            if (!matchedLyricsFile && lyricsMap.size > 0) {
              let bestMatch: { file: File; score: number } | null = null;
              const minSimilarity = 0.75; // Require 75% similarity (allows 1-2 errors for typical song titles)

              for (const [lyricsTitle, lyricsFile] of lyricsMap.entries()) {
                const similarity = calculateSimilarity(songTitle, lyricsTitle);

                if (similarity >= minSimilarity) {
                  if (!bestMatch || similarity > bestMatch.score) {
                    bestMatch = { file: lyricsFile, score: similarity };
                  }
                }
              }

              if (bestMatch) {
                matchedLyricsFile = bestMatch.file;
              }
            }

            // Load matched lyrics file
            if (matchedLyricsFile) {
              const reader = new FileReader();
              const lrcText = await new Promise<string>((resolve) => {
                reader.onload = (e) =>
                  resolve((e.target?.result as string) || "");
                reader.readAsText(matchedLyricsFile!);
              });
              if (lrcText) {
                lyrics = parseLyrics(lrcText);
              }
            }
          }
        } catch (err) {
          console.warn("Local metadata extraction failed", err);
        }

        newSongs.push({
          id: `local-${Date.now()}-${i}`,
          title,
          artist,
          fileUrl: url,
          coverUrl,
          lyrics,
          colors: colors && colors.length > 0 ? colors : undefined,
          needsLyricsMatch: lyrics.length === 0, // Flag for cloud matching
        });
      }

      appendSongs(newSongs);
      return newSongs;
    },
    [appendSongs],
  );

  const importFromUrl = useCallback(
    async (input: string): Promise<ImportResult> => {
      const parsed = parseNeteaseLink(input);
      if (!parsed) {
        return {
          success: false,
          message:
            "Invalid Netease URL. Use https://music.163.com/#/song?id=... or playlist",
          songs: [],
        };
      }

      const newSongs: Song[] = [];
      try {
        if (parsed.type === "playlist") {
          const songs = await fetchNeteasePlaylist(parsed.id);
          songs.forEach((song) => {
            newSongs.push({
              ...song,
              fileUrl: getNeteaseAudioUrl(song.id),
              lyrics: [],
              colors: [],
              needsLyricsMatch: true,
            });
          });
        } else {
          const song = await fetchNeteaseSong(parsed.id);
          if (song) {
            newSongs.push({
              ...song,
              fileUrl: getNeteaseAudioUrl(song.id),
              lyrics: [],
              colors: [],
              needsLyricsMatch: true,
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch Netease music", err);
        return {
          success: false,
          message: "Failed to load songs from URL",
          songs: [],
        };
      }

      appendSongs(newSongs);
      if (newSongs.length === 0) {
        return {
          success: false,
          message: "Failed to load songs from URL",
          songs: [],
        };
      }

      return { success: true, songs: newSongs };
    },
    [appendSongs],
  );

  return {
    queue,
    originalQueue,
    updateSongInQueue,
    removeSongs,
    addLocalFiles,
    importFromUrl,
    setQueue,
    setOriginalQueue,
    deduplicateQueue,
    exportPlaylist,
    importPlaylist,
  };
};
