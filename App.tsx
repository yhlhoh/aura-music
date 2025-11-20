import React, { useState, useRef, useEffect } from "react";
import { Song, PlayState, LyricLine, PlayMode } from "./types";
import {
  parseLrc,
  extractColors,
  parseAudioMetadata,
  parseNeteaseLink,
  shuffleArray,
} from "./services/utils";
import {
  searchAndMatchLyrics,
  fetchNeteasePlaylist,
  fetchNeteaseSong,
  getNeteaseAudioUrl,
  fetchLyricsById,
} from "./services/lyricsService";
import FluidBackground from "./components/FluidBackground";
import Controls from "./components/Controls";
import LyricsView from "./components/LyricsView";
import GeminiButton from "./components/GeminiButton";
import PlaylistPanel from "./components/PlaylistPanel";

const App: React.FC = () => {
  // Playlist State
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [originalQueue, setOriginalQueue] = useState<Song[]>([]); // For un-shuffling
  const [showPlaylist, setShowPlaylist] = useState(false);

  // Playback State
  const [playState, setPlayState] = useState<PlayState>(PlayState.PAUSED);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playMode, setPlayMode] = useState<PlayMode>(PlayMode.LOOP_ALL);

  // Lyric Matching State
  const [matchStatus, setMatchStatus] = useState<
    "idle" | "matching" | "success" | "failed"
  >("idle");

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lrcInputRef = useRef<HTMLInputElement>(null);

  const currentSong =
    currentIndex >= 0 && currentIndex < queue.length
      ? queue[currentIndex]
      : null;

  // Dynamic Accent Color (Default to a nice purple if no color extracted)
  const accentColor = currentSong?.colors?.[0] || "#a855f7";

  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [activePanel, setActivePanel] = useState<"controls" | "lyrics">(
    "controls",
  );
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const mobileViewportRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(() => {
    if (typeof window === "undefined") return 0;
    return window.innerWidth;
  });

  const updateSongInQueue = (id: string, updates: Partial<Song>) => {
    setQueue((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    );
    setOriginalQueue((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    );
  };

  const addLyricsResultToSong = (
    songId: string,
    result: { lrc: string; tLrc?: string; metadata: string[] },
  ) => {
    const parsed = parseLrc(result.lrc, result.tLrc);
    const metadataCount = result.metadata.length;
    const metadataLines = result.metadata.map((text, idx) => ({
      time: -0.01 * (metadataCount - idx),
      text,
    }));
    const lyricsWithMetadata = [...metadataLines, ...parsed].sort(
      (a, b) => a.time - b.time,
    );
    updateSongInQueue(songId, { lyrics: lyricsWithMetadata });
  };

  // 1. Auto-fetch lyrics for Netease songs if missing
  useEffect(() => {
    if (
      currentSong &&
      currentSong.isNetease &&
      (!currentSong.lyrics || currentSong.lyrics.length === 0) &&
      matchStatus === "idle"
    ) {
      const fetchLrc = async () => {
        setMatchStatus("matching");
        if (currentSong?.neteaseId) {
          const rawLrcResult = await fetchLyricsById(currentSong.neteaseId);
          if (rawLrcResult) {
            addLyricsResultToSong(currentSong.id, rawLrcResult);
            setMatchStatus("success");
          } else {
            setMatchStatus("failed");
          }
        } else {
          setMatchStatus("failed");
        }
      };
      fetchLrc();
    }
    // Auto-match local files
    else if (
      currentSong &&
      !currentSong.isNetease &&
      (!currentSong.lyrics || currentSong.lyrics.length === 0) &&
      matchStatus === "idle"
    ) {
      const match = async () => {
        setMatchStatus("matching");
        const result = await searchAndMatchLyrics(
          currentSong.title,
          currentSong.artist,
        );
        if (result) {
          addLyricsResultToSong(currentSong.id, result);
          setMatchStatus("success");
        } else {
          setMatchStatus("failed");
        }
      };
      match();
    }
  }, [currentSong]);

  // 2. Color extraction for Netease covers
  useEffect(() => {
    if (
      currentSong &&
      currentSong.isNetease &&
      currentSong.coverUrl &&
      (!currentSong.colors || currentSong.colors.length === 0)
    ) {
      extractColors(currentSong.coverUrl).then((colors) => {
        if (colors.length > 0) {
          updateSongInQueue(currentSong.id, { colors });
        }
      });
    }
  }, [currentSong]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(max-width: 1024px)");
    const updateLayout = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobileLayout(event.matches);
    };
    updateLayout(query);
    query.addEventListener("change", updateLayout);
    return () => query.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!isMobileLayout) {
      setActivePanel("controls");
      setTouchStartX(null);
      setDragOffsetX(0);
    }
  }, [isMobileLayout]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateWidth = () => {
      setPaneWidth(window.innerWidth);
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    window.visualViewport?.addEventListener("resize", updateWidth);
    return () => {
      window.removeEventListener("resize", updateWidth);
      window.visualViewport?.removeEventListener("resize", updateWidth);
    };
  }, [isMobileLayout]);

  const handleRemoveSongs = (idsToRemove: string[]) => {
    const newQueue = queue.filter((s) => !idsToRemove.includes(s.id));
    setQueue(newQueue);
    setOriginalQueue((prev) => prev.filter((s) => !idsToRemove.includes(s.id)));

    // Handle case where current song is deleted
    if (currentSong && idsToRemove.includes(currentSong.id)) {
      // Stop playback and reset to defaults when removing the now-playing track
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
      setPlayState(PlayState.PAUSED);
      setCurrentTime(0);
      setDuration(0);
      setMatchStatus("idle");
      setCurrentIndex(-1);
    } else if (currentSong) {
      // Re-sync index if still present
      const newIndex = newQueue.findIndex((s) => s.id === currentSong.id);
      if (newIndex !== -1) setCurrentIndex(newIndex);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputElement = e.target;
    const files = inputElement.files;
    if (!files || files.length === 0) {
      inputElement.value = "";
      return;
    }

    const newSongs: Song[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);

      let title = file.name.replace(/\.[^/.]+$/, "");
      let artist = "Unknown Artist";
      let coverUrl: string | undefined = undefined;
      let colors: string[] = [];

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
      } catch (err) {
        console.warn("Metadata extraction failed", err);
      }

      newSongs.push({
        id: `local-${Date.now()}-${i}`,
        title,
        artist,
        fileUrl: url,
        coverUrl,
        lyrics: [],
        colors: colors.length > 0 ? colors : undefined,
      });
    }

    if (newSongs.length > 0) {
      setOriginalQueue((prev) => [...prev, ...newSongs]);
      setQueue((prev) => [...prev, ...newSongs]);
      if (currentIndex === -1) {
        setCurrentIndex(0);
        setPlayState(PlayState.PLAYING);
        setMatchStatus("idle");
      }
    }
    inputElement.value = "";
  };

  const handleImportUrl = async (input: string) => {
    const parsed = parseNeteaseLink(input);
    if (!parsed) {
      alert(
        "Invalid Netease URL. Use https://music.163.com/#/song?id=... or playlist",
      );
      return;
    }

    let newSongs: Song[] = [];

    if (parsed.type === "playlist") {
      const songs = await fetchNeteasePlaylist(parsed.id);
      songs.forEach((s) => {
        newSongs.push({
          ...s,
          fileUrl: getNeteaseAudioUrl(s.id), // Use Meting URL
          lyrics: [],
          colors: [],
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
        });
      }
    }

    if (newSongs.length > 0) {
      const combined = [...originalQueue, ...newSongs];
      setOriginalQueue(combined);

      if (playMode === PlayMode.SHUFFLE) {
        // Re-shuffle preserving current
        const current = queue[currentIndex];
        const others = combined.filter((s) => s.id !== current?.id);
        const shuffled = shuffleArray(others);
        if (current) {
          setQueue([current, ...shuffled]);
          setCurrentIndex(0);
        } else {
          setQueue(shuffled);
          setCurrentIndex(0);
        }
      } else {
        setQueue(combined);
        if (currentIndex === -1) {
          setCurrentIndex(0);
          setPlayState(PlayState.PLAYING);
        }
      }

      if (currentIndex === -1) setMatchStatus("idle");
    } else {
      alert("Failed to load songs from URL");
    }
  };

  const handleLrcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentSong) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const parsedLyrics = parseLrc(text);
        updateSongInQueue(currentSong.id, { lyrics: parsedLyrics });
        setMatchStatus("success");
      }
    };
    reader.readAsText(file);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileLayout) return;
    setTouchStartX(event.touches[0]?.clientX ?? null);
    setDragOffsetX(0);
    setIsDragging(true);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileLayout || touchStartX === null) return;
    const currentX = event.touches[0]?.clientX;
    if (currentX === undefined) return;
    const deltaX = currentX - touchStartX;
    const containerWidth = event.currentTarget.getBoundingClientRect().width;
    const limitedDelta = Math.max(
      Math.min(deltaX, containerWidth),
      -containerWidth,
    );
    setDragOffsetX(limitedDelta);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileLayout || touchStartX === null) return;
    const endX = event.changedTouches[0]?.clientX;
    if (endX === undefined) {
      setTouchStartX(null);
      setDragOffsetX(0);
      setIsDragging(false);
      return;
    }
    const deltaX = endX - touchStartX;
    const threshold = 60;
    if (deltaX > threshold) {
      setActivePanel("controls");
    } else if (deltaX < -threshold) {
      setActivePanel("lyrics");
    }
    setTouchStartX(null);
    setDragOffsetX(0);
    setIsDragging(false);
  };

  const handleTouchCancel = () => {
    if (isMobileLayout) {
      setTouchStartX(null);
      setDragOffsetX(0);
      setIsDragging(false);
    }
  };

  const toggleIndicator = () => {
    setActivePanel((prev) => (prev === "controls" ? "lyrics" : "controls"));
    setDragOffsetX(0);
    setIsDragging(false);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playState === PlayState.PLAYING) {
      audioRef.current.pause();
      setPlayState(PlayState.PAUSED);
    } else {
      audioRef.current.play().catch((e) => console.error("Play failed", e));
      setPlayState(PlayState.PLAYING);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      if (playState === PlayState.PLAYING) {
        audioRef.current
          .play()
          .catch((e) => console.error("Auto-play failed", e));
      }
    }
  };

  const handleSeek = (time: number, playImmediately: boolean = false) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
      if (playImmediately) {
        audioRef.current.play().catch((e) => console.error("Play failed", e));
        setPlayState(PlayState.PLAYING);
      }
    }
  };

  const playNext = () => {
    if (queue.length === 0) return;

    if (playMode === PlayMode.LOOP_ONE) {
      // Just replay current
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      return;
    }

    let nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      nextIndex = 0; // Loop back to start
    }
    setCurrentIndex(nextIndex);
    setMatchStatus("idle");
    setPlayState(PlayState.PLAYING);
  };

  const playPrev = () => {
    if (queue.length === 0) return;
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = queue.length - 1;
    }
    setCurrentIndex(prevIndex);
    setMatchStatus("idle");
    setPlayState(PlayState.PLAYING);
  };

  const toggleMode = () => {
    let nextMode = PlayMode.LOOP_ALL;
    if (playMode === PlayMode.LOOP_ALL) nextMode = PlayMode.LOOP_ONE;
    else if (playMode === PlayMode.LOOP_ONE) nextMode = PlayMode.SHUFFLE;
    else if (playMode === PlayMode.SHUFFLE) nextMode = PlayMode.LOOP_ALL;

    setPlayMode(nextMode);

    if (nextMode === PlayMode.SHUFFLE) {
      // Shuffle queue but keep current song
      if (currentSong) {
        const others = originalQueue.filter((s) => s.id !== currentSong.id);
        const shuffled = shuffleArray(others);
        setQueue([currentSong, ...shuffled]);
        setCurrentIndex(0);
      } else {
        setQueue(shuffleArray(originalQueue));
        setCurrentIndex(0);
      }
    } else {
      // Restore order (Sequence/Loop)
      // Try to find current song in original queue
      if (currentSong) {
        const idx = originalQueue.findIndex((s) => s.id === currentSong.id);
        setQueue(originalQueue);
        setCurrentIndex(idx !== -1 ? idx : 0);
      } else {
        setQueue(originalQueue);
      }
    }
  };

  const controlsSection = (
    <div className="flex flex-col items-center justify-center w-full h-full z-30 relative p-4">
      <div className="relative flex flex-col items-center gap-8 w-full max-w-[360px]">
        <div className="relative aspect-square w-64 md:w-72 lg:w-[300px] rounded-3xl bg-gradient-to-br from-gray-800 to-gray-900 shadow-2xl shadow-black/50 ring-1 ring-white/10 overflow-hidden">
          {currentSong?.coverUrl ? (
            <img
              src={currentSong.coverUrl}
              alt="Album Art"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full text-white/20">
              <div className="text-8xl mb-4">♪</div>
              <p className="text-sm">No Music Loaded</p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none"></div>
        </div>

        <Controls
          isPlaying={playState === PlayState.PLAYING}
          onPlayPause={togglePlay}
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
          title={currentSong?.title || "Welcome to Aura"}
          artist={currentSong?.artist || "Select a song"}
          audioRef={audioRef}
          onNext={playNext}
          onPrev={playPrev}
          playMode={playMode}
          onToggleMode={toggleMode}
          onTogglePlaylist={() => setShowPlaylist(true)}
          accentColor={accentColor}
        />

        {/* Floating Playlist Panel */}
        <PlaylistPanel
          isOpen={showPlaylist}
          onClose={() => setShowPlaylist(false)}
          queue={queue}
          currentSongId={currentSong?.id}
          onPlay={(index) => {
            setCurrentIndex(index);
            setPlayState(PlayState.PLAYING);
            setMatchStatus("idle");
          }}
          onImport={handleImportUrl}
          onRemove={handleRemoveSongs}
          accentColor={accentColor}
        />
      </div>
    </div>
  );

  const lyricsSection = (
    <div className="w-full h-full relative z-20 flex flex-col justify-center px-4 lg:pl-12">
      <LyricsView
        lyrics={currentSong?.lyrics || []}
        audioRef={audioRef}
        isPlaying={playState === PlayState.PLAYING}
        currentTime={currentTime}
        onSeekRequest={handleSeek}
        matchStatus={matchStatus}
      />
    </div>
  );

  const fallbackWidth =
    typeof window !== "undefined" ? window.innerWidth : 0;
  const effectivePaneWidth = paneWidth || fallbackWidth;
  const baseOffset = activePanel === "lyrics" ? -effectivePaneWidth : 0;
  const mobileTranslate = baseOffset + dragOffsetX;

  return (
    <div className="relative w-full h-screen flex flex-col overflow-hidden">
      <FluidBackground
        colors={currentSong?.colors || []}
        coverUrl={currentSong?.coverUrl}
        isPlaying={playState === PlayState.PLAYING}
      />

      <audio
        ref={audioRef}
        src={currentSong?.fileUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={playNext}
        crossOrigin="anonymous"
      />

      {/* Top Bar (Hover to Reveal, White Blur) */}
      <div className="fixed top-0 left-0 w-full h-14 z-[60] group">
        {/* Blur Background Layer (Animate in) */}
        <div className="absolute inset-0 bg-white/5 backdrop-blur-2xl border-b border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-500"></div>

        {/* Content (Animate in) */}
        <div className="relative z-10 w-full h-full px-6 flex justify-between items-center opacity-0 group-hover:opacity-100 translate-y-[-10px] group-hover:translate-y-0 transition-all duration-500 delay-75">
          <div className="flex items-center gap-4">
            <h1 className="text-white/90 font-bold tracking-wider text-sm uppercase">
              Aura Music
            </h1>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-md transition-colors"
            >
              Load Files
            </button>
            <button
              onClick={() => lrcInputRef.current?.click()}
              className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-md transition-colors"
              disabled={!currentSong}
            >
              Load .lrc
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="audio/*"
              multiple
              className="hidden"
            />
            <input
              type="file"
              ref={lrcInputRef}
              onChange={handleLrcChange}
              accept=".lrc,.txt"
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Main Content Split */}
      {isMobileLayout ? (
        <div className="flex-1 relative w-full h-full">
          <div
            ref={mobileViewportRef}
            className="w-full h-full overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
          >
            <div
              className={`flex h-full ${isDragging ? "transition-none" : "transition-transform duration-300"}`}
              style={{
                width: `${effectivePaneWidth * 2}px`,
                transform: `translateX(${mobileTranslate}px)`,
              }}
            >
              <div className="flex-none h-full" style={{ width: effectivePaneWidth }}>
                {controlsSection}
              </div>
              <div className="flex-none h-full" style={{ width: effectivePaneWidth }}>
                {lyricsSection}
              </div>
            </div>
          </div>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <button
              type="button"
              onClick={toggleIndicator}
              className="relative flex h-4 w-28 items-center justify-center rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 transition-transform duration-200 active:scale-105"
              style={{
                transform: `translateX(${isDragging ? dragOffsetX * 0.04 : 0}px)`,
              }}
            >
              <span
                className={`absolute inset-0 rounded-full bg-white/25 backdrop-blur-[30px] transition-opacity duration-200 ${
                  activePanel === "controls" ? "opacity-90" : "opacity-60"
                }`}
              />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid lg:grid-cols-2 w-full h-full">
          {controlsSection}
          {lyricsSection}
        </div>
      )}
    </div>
  );
};

export default App;
