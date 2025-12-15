import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Song, PlayState, PlayMode } from "../types";
import { extractColors, shuffleArray } from "../services/utils";
import { parseLyrics } from "../services/lyrics";
import {
  fetchLyricsById,
  searchAndMatchLyrics,
} from "../services/lyricsService";
import { audioResourceCache } from "../services/cache";
import { parseQQSongBy317ak, toHttps } from "../services/qqmusic";

// QQ 音乐 URL 刷新所需的常量
const CKEY = 'RK7TO6VHAB0WSW7VHXKH';
const DEFAULT_BR = 3;

// QQ 音乐播放重试配置
// Configuration for QQ Music playback retry logic
const QQ_MUSIC_RETRY_CONFIG = {
  MAX_RETRIES: 3,        // Maximum number of retry attempts after initial failure
  RETRY_DELAY_MS: 1000,  // Delay between retry attempts in milliseconds
} as const;

type MatchStatus = "idle" | "matching" | "success" | "failed";

interface UsePlayerParams {
  queue: Song[];
  originalQueue: Song[];
  updateSongInQueue: (id: string, updates: Partial<Song>) => void;
  setQueue: Dispatch<SetStateAction<Song[]>>;
  setOriginalQueue: Dispatch<SetStateAction<Song[]>>;
}

const MATCH_TIMEOUT_MS = 8000;
const PLAYER_STATE_KEY = "aura-music-player-state";

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Lyrics request timed out"));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

export const usePlayer = ({
  queue,
  originalQueue,
  updateSongInQueue,
  setQueue,
  setOriginalQueue,
}: UsePlayerParams) => {
  // Initialize from localStorage if available
  const [currentIndex, setCurrentIndex] = useState(() => {
    try {
      const saved = localStorage.getItem(PLAYER_STATE_KEY);
      if (saved) {
        const { songId } = JSON.parse(saved);
        const index = queue.findIndex((song) => song.id === songId);
        return index !== -1 ? index : -1;
      }
    } catch (error) {
      console.warn("Failed to restore player state:", error);
    }
    return -1;
  });
  
  const [playState, setPlayState] = useState<PlayState>(PlayState.PAUSED);
  
  const [currentTime, setCurrentTime] = useState(() => {
    try {
      const saved = localStorage.getItem(PLAYER_STATE_KEY);
      if (saved) {
        const { time } = JSON.parse(saved);
        return typeof time === "number" && time >= 0 ? time : 0;
      }
    } catch (error) {
      console.warn("Failed to restore player time:", error);
    }
    return 0;
  });
  
  const [duration, setDuration] = useState(0);
  const [playMode, setPlayMode] = useState<PlayMode>(PlayMode.LOOP_ALL);
  const [matchStatus, setMatchStatus] = useState<MatchStatus>("idle");
  const audioRef = useRef<HTMLAudioElement>(null);
  const isSeekingRef = useRef(false);
  const isInitialMount = useRef(true);
  
  // Track retry attempts for QQ Music URL refresh
  // Reset when song changes or playback succeeds
  const qqMusicRetryCount = useRef<number>(0);
  const isRetryingQQMusic = useRef<boolean>(false);

  const pauseAndResetCurrentAudio = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  }, []);

  const currentSong = queue[currentIndex] ?? null;
  const accentColor = currentSong?.colors?.[0] || "#a855f7";

  const reorderForShuffle = useCallback(() => {
    if (originalQueue.length === 0) return;
    const currentId = currentSong?.id;
    const pool = originalQueue.filter((song) => song.id !== currentId);
    const shuffled = shuffleArray([...pool]);
    if (currentId) {
      const current = originalQueue.find((song) => song.id === currentId);
      if (current) {
        setQueue([current, ...shuffled]);
        setCurrentIndex(0);
        return;
      }
    }
    setQueue(shuffled);
    setCurrentIndex(0);
  }, [currentSong, originalQueue, setQueue]);

  const toggleMode = useCallback(() => {
    let nextMode: PlayMode;
    if (playMode === PlayMode.LOOP_ALL) nextMode = PlayMode.LOOP_ONE;
    else if (playMode === PlayMode.LOOP_ONE) nextMode = PlayMode.SHUFFLE;
    else nextMode = PlayMode.LOOP_ALL;

    setPlayMode(nextMode);
    setMatchStatus("idle");

    if (nextMode === PlayMode.SHUFFLE) {
      reorderForShuffle();
    } else {
      setQueue(originalQueue);
      if (currentSong) {
        const idx = originalQueue.findIndex(
          (song) => song.id === currentSong.id,
        );
        setCurrentIndex(idx !== -1 ? idx : 0);
      } else {
        setCurrentIndex(originalQueue.length > 0 ? 0 : -1);
      }
    }
  }, [playMode, reorderForShuffle, originalQueue, currentSong, setQueue]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (playState === PlayState.PLAYING) {
      audioRef.current.pause();
      setPlayState(PlayState.PAUSED);
    } else {
      const duration = audioRef.current.duration || 0;
      const isAtEnd =
        duration > 0 && audioRef.current.currentTime >= duration - 0.01;
      if (isAtEnd) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
      audioRef.current.play().catch((err) => console.error("Play failed", err));
      setPlayState(PlayState.PLAYING);
    }
  }, [playState]);

  const play = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current
      .play()
      .catch((err) => console.error("Play failed", err));
    setPlayState(PlayState.PLAYING);
  }, []);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setPlayState(PlayState.PAUSED);
  }, []);

  const handleSeek = useCallback(
    (
      time: number,
      playImmediately: boolean = false,
      defer: boolean = false,
    ) => {
      if (!audioRef.current) return;

      if (defer) {
        // Only update visual state during drag, don't actually seek
        isSeekingRef.current = true;
        setCurrentTime(time);
      } else {
        // Actually perform the seek
        audioRef.current.currentTime = time;
        setCurrentTime(time);
        isSeekingRef.current = false;
        if (playImmediately) {
          audioRef.current
            .play()
            .catch((err) => console.error("Play failed", err));
          setPlayState(PlayState.PLAYING);
        }
      }
    },
    [],
  );

  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current || isSeekingRef.current) return;
    const value = audioRef.current.currentTime;
    setCurrentTime(Number.isFinite(value) ? value : 0);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (!audioRef.current) return;
    const value = audioRef.current.duration;
    setDuration(Number.isFinite(value) ? value : 0);
    
    // Seek to restored time only on initial mount when currentTime > 0
    if (isInitialMount.current && currentTime > 0 && Number.isFinite(value)) {
      try {
        audioRef.current.currentTime = Math.min(currentTime, value);
      } catch (error) {
        console.warn("Failed to seek to restored time:", error);
      }
    }
    
    if (playState === PlayState.PLAYING) {
      audioRef.current
        .play()
        .catch((err) => console.error("Auto-play failed", err));
    }
  }, [playState, currentTime]);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;

    if (playMode === PlayMode.LOOP_ONE) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      return;
    }

    pauseAndResetCurrentAudio();
    const next = (currentIndex + 1) % queue.length;
    setCurrentIndex(next);
    setMatchStatus("idle");
    setPlayState(PlayState.PLAYING);
  }, [queue.length, playMode, currentIndex, pauseAndResetCurrentAudio]);

  const playPrev = useCallback(() => {
    if (queue.length === 0) return;
    pauseAndResetCurrentAudio();
    const prev = (currentIndex - 1 + queue.length) % queue.length;
    setCurrentIndex(prev);
    setMatchStatus("idle");
    setPlayState(PlayState.PLAYING);
  }, [queue.length, currentIndex, pauseAndResetCurrentAudio]);

  const playIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= queue.length) return;
      pauseAndResetCurrentAudio();
      setCurrentIndex(index);
      setPlayState(PlayState.PLAYING);
      setMatchStatus("idle");
    },
    [queue.length, pauseAndResetCurrentAudio],
  );

  const handleAudioEnded = useCallback(() => {
    if (playMode === PlayMode.LOOP_ONE) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current
          .play()
          .catch((err) => console.error("Play failed", err));
      }
      setPlayState(PlayState.PLAYING);
      return;
    }

    if (queue.length === 1) {
      setPlayState(PlayState.PAUSED);
      return;
    }

    playNext();
  }, [playMode, queue.length, playNext]);

  const addSongAndPlay = useCallback(
    (song: Song) => {
      // Update both queues atomically
      setQueue((prev) => {
        const newQueue = [...prev, song];
        const newIndex = newQueue.length - 1;

        // Set index and play state immediately in the same update cycle
        setCurrentIndex(newIndex);
        setPlayState(PlayState.PLAYING);
        setMatchStatus("idle");

        return newQueue;
      });

      setOriginalQueue((prev) => [...prev, song]);
    },
    [setQueue, setOriginalQueue],
  );

  const handlePlaylistAddition = useCallback(
    (added: Song[], wasEmpty: boolean) => {
      if (added.length === 0) return;
      setMatchStatus("idle");
      if (wasEmpty || currentIndex === -1) {
        setCurrentIndex(0);
        setPlayState(PlayState.PLAYING);
      }
      if (playMode === PlayMode.SHUFFLE) {
        reorderForShuffle();
      }
    },
    [currentIndex, playMode, reorderForShuffle],
  );

  const mergeLyricsWithMetadata = useCallback(
    (result: { lrc: string; yrc?: string; tLrc?: string; metadata: string[] }) => {
      const parsed = parseLyrics(result.lrc, result.tLrc, {
        yrcContent: result.yrc,
      });
      const metadataCount = result.metadata.length;
      const metadataLines = result.metadata.map((text, idx) => ({
        time: -0.1 * (metadataCount - idx),
        text,
        isMetadata: true,
      }));
      return [...metadataLines, ...parsed].sort((a, b) => a.time - b.time);
    },
    [],
  );

  const loadLyricsFile = useCallback(
    (file?: File) => {
      if (!file || !currentSong) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          const parsedLyrics = parseLyrics(text);
          updateSongInQueue(currentSong.id, { lyrics: parsedLyrics });
          setMatchStatus("success");
        }
      };
      reader.readAsText(file);
    },
    [currentSong, updateSongInQueue],
  );

  useEffect(() => {
    if (!currentSong) {
      if (matchStatus !== "idle") {
        setMatchStatus("idle");
      }
      return;
    }

    const songId = currentSong.id;
    const songTitle = currentSong.title;
    const songArtist = currentSong.artist;
    const needsLyricsMatch = currentSong.needsLyricsMatch;
    const existingLyrics = currentSong.lyrics ?? [];
    const isNeteaseSong = currentSong.isNetease;
    const songNeteaseId = currentSong.neteaseId;

    let cancelled = false;

    const markMatchFailed = () => {
      if (cancelled) return;
      updateSongInQueue(songId, {
        needsLyricsMatch: false,
      });
      setMatchStatus("failed");
    };

    const markMatchSuccess = () => {
      if (cancelled) return;
      setMatchStatus("success");
    };

    if (existingLyrics.length > 0) {
      markMatchSuccess();
      return;
    }

    if (!needsLyricsMatch) {
      markMatchFailed();
      return;
    }

    const fetchLyrics = async () => {
      setMatchStatus("matching");
      try {
        if (isNeteaseSong && songNeteaseId) {
          const raw = await withTimeout(
            fetchLyricsById(songNeteaseId),
            MATCH_TIMEOUT_MS,
          );
          if (cancelled) return;
          if (raw) {
            updateSongInQueue(songId, {
              lyrics: mergeLyricsWithMetadata(raw),
              needsLyricsMatch: false,
            });
            markMatchSuccess();
          } else {
            markMatchFailed();
          }
        } else {
          const result = await withTimeout(
            searchAndMatchLyrics(songTitle, songArtist),
            MATCH_TIMEOUT_MS,
          );
          if (cancelled) return;
          if (result) {
            updateSongInQueue(songId, {
              lyrics: mergeLyricsWithMetadata(result),
              needsLyricsMatch: false,
            });
            markMatchSuccess();
          } else {
            markMatchFailed();
          }
        }
      } catch (error) {
        console.warn("Lyrics matching failed:", error);
        markMatchFailed();
      }
    };

    fetchLyrics();

    return () => {
      cancelled = true;
    };
  }, [currentSong?.id, mergeLyricsWithMetadata, updateSongInQueue]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleAudioError = async () => {
      const errorDetails = audio.error;
      const errorCode = errorDetails?.code;
      const errorMessage = errorDetails?.message || 'Unknown error';
      
      console.warn(`Audio playback error detected: code=${errorCode}, message=${errorMessage}`);
      
      // Check if this is a QQ Music track and retry is applicable
      if (currentSong?.isQQMusic && currentSong?.qqMusicMid && !isRetryingQQMusic.current) {
        // Check if we haven't exceeded max retries
        if (qqMusicRetryCount.current < QQ_MUSIC_RETRY_CONFIG.MAX_RETRIES) {
          qqMusicRetryCount.current += 1;
          isRetryingQQMusic.current = true;
          
          console.log(
            `[QQ Music Retry] Attempting to refresh URL (attempt ${qqMusicRetryCount.current} of ${QQ_MUSIC_RETRY_CONFIG.MAX_RETRIES}) for: ${currentSong.title}`
          );
          
          try {
            // Wait for retry delay before attempting
            await new Promise(resolve => setTimeout(resolve, QQ_MUSIC_RETRY_CONFIG.RETRY_DELAY_MS));
            
            // Attempt to refresh the QQ Music URL
            const parseResult = await parseQQSongBy317ak(currentSong.qqMusicMid, CKEY, DEFAULT_BR);
            
            // Extract URL with proper fallback chain (matching QQ317ParseResponse type structure)
            const newUrl = parseResult.data?.music || parseResult.data?.url || parseResult.music || parseResult.url;
            
            if (!newUrl) {
              console.error(`[QQ Music Retry] Failed to get new URL from API response`);
              throw new Error('No URL in API response');
            }
            
            const httpsUrl = toHttps(newUrl);
            console.log(`[QQ Music Retry] Successfully refreshed URL, retrying playback (attempt ${qqMusicRetryCount.current})`);
            
            // Update the song's URL in the queue
            updateSongInQueue(currentSong.id, { fileUrl: httpsUrl });
            
            // Clear the cache for the old URL to force re-fetch
            if (currentSong.fileUrl) {
              audioResourceCache.delete(currentSong.fileUrl);
            }
            
            // Reset audio element and update source
            audio.pause();
            audio.currentTime = 0;
            audio.src = httpsUrl;
            
            // Attempt to play again
            await audio.load();
            if (playState === PlayState.PLAYING) {
              try {
                await audio.play();
                console.log(`[QQ Music Retry] Playback resumed successfully after retry`);
                // Reset retry count on success
                qqMusicRetryCount.current = 0;
              } catch (playError) {
                console.error(`[QQ Music Retry] Play failed after URL refresh (attempt ${qqMusicRetryCount.current}):`, playError);
                // Don't reset retry count here - let it try again on next error if retries available
              }
            } else {
              // If not playing, consider it a successful URL refresh
              qqMusicRetryCount.current = 0;
            }
          } catch (error) {
            console.error(`[QQ Music Retry] URL refresh failed (attempt ${qqMusicRetryCount.current}):`, error);
          } finally {
            isRetryingQQMusic.current = false;
          }
          
          // Don't pause/reset if we're retrying
          return;
        } else {
          console.error(
            `[QQ Music Retry] Max retries (${QQ_MUSIC_RETRY_CONFIG.MAX_RETRIES}) exceeded for: ${currentSong.title}. Giving up.`
          );
          // Reset retry count for next song
          qqMusicRetryCount.current = 0;
        }
      }
      
      // Default error handling: pause and reset
      audio.pause();
      audio.currentTime = 0;
      setPlayState(PlayState.PAUSED);
      setCurrentTime(0);
    };

    audio.addEventListener("error", handleAudioError);
    return () => {
      audio.removeEventListener("error", handleAudioError);
    };
  }, [audioRef, currentSong, playState, updateSongInQueue]);

  // Provide high-precision time updates directly from the native audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleNativeTimeUpdate = () => {
      if (isSeekingRef.current) return;
      const value = audio.currentTime;
      setCurrentTime(Number.isFinite(value) ? value : 0);
    };

    audio.addEventListener("timeupdate", handleNativeTimeUpdate);
    return () => {
      audio.removeEventListener("timeupdate", handleNativeTimeUpdate);
    };
  }, [audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleDurationChange = () => {
      const value = audio.duration;
      setDuration(Number.isFinite(value) ? value : 0);
    };

    audio.addEventListener("durationchange", handleDurationChange);
    return () => {
      audio.removeEventListener("durationchange", handleDurationChange);
    };
  }, [audioRef]);

  // 提取封面颜色 - 支持所有音乐源（网易云、QQ 音乐、本地文件等）
  // 只要歌曲有 coverUrl 且尚未提取颜色，就会自动提取并缓存
  useEffect(() => {
    if (
      !currentSong ||
      !currentSong.coverUrl ||
      (currentSong.colors && currentSong.colors.length > 0)
    ) {
      return;
    }

    // 提取颜色用于 canvas 背景渲染
    extractColors(currentSong.coverUrl)
      .then((colors) => {
        if (colors.length > 0) {
          updateSongInQueue(currentSong.id, { colors });
        }
      })
      .catch((err) => console.warn("Color extraction failed", err));
  }, [currentSong, updateSongInQueue]);

  useEffect(() => {
    if (queue.length === 0) {
      if (currentIndex === -1) return;
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
      setPlayState(PlayState.PAUSED);
      setCurrentIndex(-1);
      setCurrentTime(0);
      setDuration(0);
      setMatchStatus("idle");
      return;
    }

    if (currentIndex >= queue.length || !queue[currentIndex]) {
      const nextIndex = Math.max(0, Math.min(queue.length - 1, currentIndex));
      setCurrentIndex(nextIndex);
      setMatchStatus("idle");
    }
  }, [queue, currentIndex]);

  const [speed, setSpeed] = useState(1);
  const [preservesPitch, setPreservesPitch] = useState(true);
  const [resolvedAudioSrc, setResolvedAudioSrc] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(0);

  const handleSetSpeed = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
  }, []);

  const handleTogglePreservesPitch = useCallback(() => {
    setPreservesPitch((prev) => !prev);
  }, []);

  // Ensure playback rate is applied when song changes or play state changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.preservesPitch = preservesPitch;
      audioRef.current.playbackRate = speed;
    }
  }, [currentSong, playState, speed, preservesPitch]);

  useEffect(() => {
    let canceled = false;
    let currentObjectUrl: string | null = null;
    let controller: AbortController | null = null;
    let mediaSource: MediaSource | null = null;
    let sourceBuffer: SourceBuffer | null = null;
    let sourceUpdateHandler: (() => void) | null = null;

    const releaseObjectUrl = () => {
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
      }
    };

    const cleanupSourceBuffer = () => {
      if (sourceBuffer && sourceUpdateHandler) {
        try {
          sourceBuffer.removeEventListener("updateend", sourceUpdateHandler);
        } catch {
          // Ignore cleanup errors
        }
      }
      sourceBuffer = null;
      sourceUpdateHandler = null;
    };

    const resetBuffering = () => {
      if (canceled) return;
      setIsBuffering(false);
      setBufferProgress(0);
    };

    const fallbackToNativeSrc = () => {
      cleanupSourceBuffer();
      if (mediaSource && mediaSource.readyState === "open") {
        try {
          mediaSource.endOfStream();
        } catch {
          // ignore
        }
      }
      mediaSource = null;
      releaseObjectUrl();
      if (!canceled) {
        setResolvedAudioSrc(null);
      }
    };

    if (!currentSong?.fileUrl) {
      releaseObjectUrl();
      setResolvedAudioSrc(null);
      resetBuffering();
      return () => {
        canceled = true;
        controller?.abort();
        cleanupSourceBuffer();
        releaseObjectUrl();
      };
    }

    // QQ 音乐 URL 刷新逻辑：每次播放时重新获取 URL（因为 QQ 音乐的 URL 会过期）
    const refreshQQMusicUrl = async (): Promise<string | null> => {
      if (!currentSong.isQQMusic || !currentSong.qqMusicMid) {
        return null;
      }

      try {
        console.log(`[QQ 音乐] 刷新播放 URL: ${currentSong.title}`);
        const parseResult = await parseQQSongBy317ak(currentSong.qqMusicMid, CKEY, DEFAULT_BR);
        const newUrl = parseResult.data?.music || parseResult.music || parseResult.url || parseResult.data?.url;
        
        if (newUrl) {
          const httpsUrl = toHttps(newUrl);
          console.log(`[QQ 音乐] URL 刷新成功`);
          
          // 更新歌曲的 fileUrl（持久化到队列中）
          updateSongInQueue(currentSong.id, { fileUrl: httpsUrl });
          
          return httpsUrl;
        }
      } catch (error) {
        console.error('[QQ 音乐] URL 刷新失败:', error);
      }
      
      return null;
    };

    // 初始化加载逻辑
    const initializeAudio = async () => {
      let fileUrl = currentSong.fileUrl;
      if (canceled) return;

      if (fileUrl.startsWith("blob:") || fileUrl.startsWith("data:")) {
        releaseObjectUrl();
        setResolvedAudioSrc(fileUrl);
        setIsBuffering(false);
        setBufferProgress(1);
        return;
      }

      const cachedBlob = audioResourceCache.get(fileUrl);
      if (cachedBlob) {
        releaseObjectUrl();
        currentObjectUrl = URL.createObjectURL(cachedBlob);
        setResolvedAudioSrc(currentObjectUrl);
        setIsBuffering(false);
        setBufferProgress(1);
        return;
      }

      const MediaSourceCtor =
        typeof window !== "undefined" ? window.MediaSource : undefined;
      const supportsMediaSource =
        typeof MediaSourceCtor !== "undefined" &&
        typeof MediaSourceCtor.isTypeSupported === "function";

      releaseObjectUrl();
      setIsBuffering(true);
      setBufferProgress(0);

      if (typeof fetch !== "function") {
        resetBuffering();
        return;
      }

      if (supportsMediaSource && MediaSourceCtor) {
        mediaSource = new MediaSourceCtor();
        currentObjectUrl = URL.createObjectURL(mediaSource);
        setResolvedAudioSrc(currentObjectUrl);
      } else {
        setResolvedAudioSrc(null);
      }

      const waitForSourceOpen = () =>
        new Promise<void>((resolve) => {
          if (!mediaSource) {
            resolve();
            return;
          }
          if (mediaSource.readyState === "open") {
            resolve();
            return;
          }
          const handleOpen = () => {
            mediaSource?.removeEventListener("sourceopen", handleOpen);
            resolve();
          };
          mediaSource.addEventListener("sourceopen", handleOpen);
        });

      const streamViaMediaSource = async (signal: AbortSignal): Promise<boolean> => {
        if (!mediaSource) return false;
        try {
          const response = await fetch(fileUrl, { signal });
        if (!response.ok) {
          throw new Error("Failed to load audio: " + response.status);
        }

        if (!response.body) {
          return false;
        }

        const headerType = response.headers.get("content-type") || "";
        const baseMime = headerType.split(";")[0].trim() || "audio/mpeg";
        const preferredMime = MediaSourceCtor?.isTypeSupported?.(baseMime)
          ? baseMime
          : MediaSourceCtor?.isTypeSupported?.("audio/mpeg")
            ? "audio/mpeg"
            : "";

        if (!preferredMime) {
          return false;
        }

        await waitForSourceOpen();
        if (canceled) return true;

        try {
          sourceBuffer = mediaSource.addSourceBuffer(preferredMime);
          sourceBuffer.mode = "sequence";
        } catch (error) {
          console.warn("Creating SourceBuffer failed:", error);
          return false;
        }

        const chunkQueue: Uint8Array[] = [];
        let streamFinished = false;
        const cachedChunks: BlobPart[] = [];
        const totalBytes = Number(response.headers.get("content-length")) || 0;
        const reader = response.body.getReader();

        const maybeCloseStream = () => {
          if (
            streamFinished &&
            chunkQueue.length === 0 &&
            mediaSource &&
            mediaSource.readyState === "open" &&
            sourceBuffer &&
            !sourceBuffer.updating
          ) {
            try {
              mediaSource.endOfStream();
            } catch {
              // ignore
            }
          }
        };

        const appendFromQueue = () => {
          if (!sourceBuffer || sourceBuffer.updating || chunkQueue.length === 0) {
            maybeCloseStream();
            return;
          }
          const next = chunkQueue.shift();
          if (!next) {
            maybeCloseStream();
            return;
          }
          try {
            const arrayBuffer = new ArrayBuffer(next.byteLength);
            new Uint8Array(arrayBuffer).set(next);
            sourceBuffer.appendBuffer(arrayBuffer);
          } catch (error) {
            console.warn("Appending audio chunk failed:", error);
            chunkQueue.length = 0;
          }
        };

        sourceUpdateHandler = () => {
          appendFromQueue();
        };
        sourceBuffer.addEventListener("updateend", sourceUpdateHandler);

        let loaded = 0;
        while (!canceled) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            const copy = value.slice();
            chunkQueue.push(copy);
            cachedChunks.push(copy);
            loaded += copy.byteLength;
            if (!canceled) {
              if (totalBytes > 0) {
                setBufferProgress(Math.min(loaded / totalBytes, 0.995));
              } else {
                setBufferProgress((prev) => {
                  const increment = copy.byteLength / (5 * 1024 * 1024);
                  return Math.min(0.95, prev + increment);
                });
              }
            }
            appendFromQueue();
          }
        }

        streamFinished = true;
        appendFromQueue();
        maybeCloseStream();

        if (canceled) {
          return true;
        }

        const blob = new Blob(cachedChunks, {
          type: baseMime || "audio/mpeg",
        });
        audioResourceCache.set(fileUrl, blob);
        setBufferProgress(1);
        return true;
      } catch (error) {
        if (!canceled) {
          console.warn("Audio streaming failed:", error);
          setBufferProgress(0);
        }
        return false;
        }
      };

      const cacheWithoutStreaming = async (signal: AbortSignal) => {
        try {
            const response = await fetch(fileUrl, { signal });
          if (!response.ok) {
            throw new Error("Failed to load audio: " + response.status);
          }

          const totalBytes = Number(response.headers.get("content-length")) || 0;

          if (!response.body) {
            const fallbackBlob = await response.blob();
            if (canceled) return;
            audioResourceCache.set(fileUrl, fallbackBlob);
            setBufferProgress(1);
            return;
          }

          const reader = response.body.getReader();
          const chunks: BlobPart[] = [];
          let loaded = 0;

          while (!canceled) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              const copy = value.slice();
              chunks.push(copy);
              loaded += copy.byteLength;
              if (totalBytes > 0) {
                setBufferProgress(Math.min(loaded / totalBytes, 0.99));
              } else {
                setBufferProgress((prev) => {
                  const increment = copy.byteLength / (5 * 1024 * 1024);
                  return Math.min(0.95, prev + increment);
                });
              }
            }
          }

          if (canceled) return;

          const blob = new Blob(chunks, {
            type: response.headers.get("content-type") || "audio/mpeg",
          });
          audioResourceCache.set(fileUrl, blob);
          setBufferProgress(1);
        } catch (error) {
          if (!canceled) {
            console.warn("Audio caching failed:", error);
            setBufferProgress(0);
          }
        }
      };

      const start = async () => {
        try {
          if (supportsMediaSource) {
            controller = new AbortController();
            const streamed = await streamViaMediaSource(controller.signal);
            if (!streamed && !canceled) {
              fallbackToNativeSrc();
              controller = new AbortController();
              await cacheWithoutStreaming(controller.signal);
            }
          } else {
            controller = new AbortController();
            await cacheWithoutStreaming(controller.signal);
          }
        } finally {
          if (!canceled) {
            setIsBuffering(false);
          }
        }
      };

      start();
    };

    // 调用初始化函数
    initializeAudio();

    return () => {
      canceled = true;
      controller?.abort();
      cleanupSourceBuffer();
      if (mediaSource && mediaSource.readyState === "open") {
        try {
          mediaSource.endOfStream();
        } catch {
          // ignore
        }
      }
      releaseObjectUrl();
    };
  }, [currentSong?.fileUrl]);

  // Reset currentTime to 0 when currentIndex changes (except on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setCurrentTime(0);
    
    // Reset QQ Music retry counter when song changes
    qqMusicRetryCount.current = 0;
    isRetryingQQMusic.current = false;
  }, [currentIndex]);

  // Save player state to localStorage whenever currentSong or currentTime changes
  useEffect(() => {
    if (!currentSong) return;
    
    const timeoutId = setTimeout(() => {
      try {
        const state = {
          songId: currentSong.id,
          time: currentTime,
        };
        localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(state));
      } catch (error) {
        console.warn("Failed to save player state:", error);
      }
    }, 500); // Debounce by 500ms
    
    return () => clearTimeout(timeoutId);
  }, [currentSong?.id, currentTime]);

  return {
    audioRef,
    currentSong,
    currentIndex,
    playState,
    currentTime,
    duration,
    playMode,
    matchStatus,
    accentColor,
    speed,
    preservesPitch,
    togglePlay,
    toggleMode,
    handleSeek,
    playNext,
    playPrev,
    playIndex,
    handleTimeUpdate,
    handleLoadedMetadata,
    handlePlaylistAddition,
    loadLyricsFile,
    addSongAndPlay,
    handleAudioEnded,
    setSpeed: handleSetSpeed,
    togglePreservesPitch: handleTogglePreservesPitch,
    pitch: 0, // Default pitch
    setPitch: (pitch: number) => { }, // Placeholder
    play,
    pause,
    resolvedAudioSrc,
    isBuffering,
    bufferProgress,
  };
};
