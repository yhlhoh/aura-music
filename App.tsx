import React, { useState, useRef, useEffect } from "react";
import { useToast } from "./hooks/useToast";
import { PlayState, Song, isSameSong } from "./types";
import FluidBackground from "./components/FluidBackground";
import Controls from "./components/Controls";
import LyricsView from "./components/LyricsView";
import PlaylistPanel from "./components/PlaylistPanel";
import KeyboardShortcuts from "./components/KeyboardShortcuts";
import TopBar from "./components/TopBar";
import SearchModal from "./components/SearchModal";
import { usePlaylist } from "./hooks/usePlaylist";
import { usePlayer } from "./hooks/usePlayer";
import { keyboardRegistry } from "./services/keyboardRegistry";
import MediaSessionController from "./components/MediaSessionController";

const App: React.FC = () => {
  const { toast } = useToast();
  const playlist = usePlaylist();
  const player = usePlayer({
    queue: playlist.queue,
    originalQueue: playlist.originalQueue,
    updateSongInQueue: playlist.updateSongInQueue,
    setQueue: playlist.setQueue,
    setOriginalQueue: playlist.setOriginalQueue,
  });

  const {
    audioRef,
    currentSong,
    playState,
    currentTime,
    duration,
    playMode,
    matchStatus,
    accentColor,
    togglePlay,
    toggleMode,
    handleSeek,
    playNext,
    playPrev,
    handleTimeUpdate,
    handleLoadedMetadata,
    handlePlaylistAddition,
    loadLyricsFile,
    playIndex,
    addSongAndPlay,
    handleAudioEnded,
    play,
    pause,
    resolvedAudioSrc,
    isBuffering,
    bufferProgress,
  } = player;

  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [volume, setVolume] = useState(1);

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

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume, audioRef]);

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

  // Global Keyboard Registry Initialization
  // 全局键盘注册表初始化
  // 
  // 作用：监听所有键盘事件，并根据优先级分发给不同的处理器
  // 
  // 优先级设计：
  // - SearchModal: 100（最高）- 搜索弹窗打开时优先处理
  // - KeyboardShortcuts: 50（中等）- 全局播放控制快捷键
  // 
  // 工作原理：
  // 1. 每个组件通过 useKeyboardScope hook 注册自己的处理器
  // 2. 按优先级从高到低依次调用处理器
  // 3. 如果某个处理器返回 true，则停止传播，不再调用后续处理器
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyboardRegistry.handle(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Global Search Shortcut (Registered directly via useEffect for simplicity, or could use useKeyboardScope with high priority)
  // 全局搜索快捷键（Ctrl/Cmd + K）
  // 
  // 注意：此快捷键直接在 App 组件注册，不经过 keyboardRegistry
  // 这样可以确保在任何情况下都能打开搜索（即使其他组件阻止了事件传播）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleFileChange = async (files: FileList) => {
    const wasEmpty = playlist.queue.length === 0;
    const addedSongs = await playlist.addLocalFiles(files);
    if (addedSongs.length > 0) {
      setTimeout(() => {
        handlePlaylistAddition(addedSongs, wasEmpty);
      }, 0);
    }
  };

  const handleImportUrl = async (input: string): Promise<boolean> => {
    const trimmed = input.trim();
    if (!trimmed) return false;
    const wasEmpty = playlist.queue.length === 0;
    const result = await playlist.importFromUrl(trimmed);
    if (!result.success) {
      toast.error(result.message ?? "Failed to load songs from URL");
      return false;
    }
    if (result.songs.length > 0) {
      setTimeout(() => {
        handlePlaylistAddition(result.songs, wasEmpty);
      }, 0);
      toast.success(`Successfully imported ${result.songs.length} songs`);
      return true;
    }
    return false;
  };

  const handleImportAndPlay = (song: Song) => {
    // 基于平台+ID 检查歌曲是否已在队列中
    // 使用统一的唯一标识逻辑，避免歌名重复导致的混淆
    const existingIndex = playlist.queue.findIndex((s) => {
      // 网易云：使用 neteaseId 判断
      if (song.isNetease && s.isNetease && song.neteaseId && s.neteaseId) {
        return s.neteaseId === song.neteaseId;
      }
      // QQ 音乐：使用 qqMusicMid 判断
      if (song.isQQMusic && s.isQQMusic && song.qqMusicMid && s.qqMusicMid) {
        return s.qqMusicMid === song.qqMusicMid;
      }
      // 本地文件或其他：使用 id 判断
      return s.id === song.id;
    });

    if (existingIndex !== -1) {
      // 歌曲已在队列中，直接播放
      playIndex(existingIndex);
    } else {
      // 添加并播放 - 无竞态条件！
      addSongAndPlay(song);
    }
  };

  const handleAddToQueue = (song: Song) => {
    // 基于平台+ID 检查歌曲是否已在队列中（避免重复添加）
    // 实现"禁止歌单重复"功能：删除旧的相同歌曲，仅保留新添加的位置
    const existingIndices: number[] = [];
    playlist.queue.forEach((s, index) => {
      if (isSameSong(song, s)) {
        existingIndices.push(index);
      }
    });

    // 如果歌曲已存在，删除所有旧的版本，仅保留这次新添加的
    // 策略：保留"最新一次添加"的位置，将旧的相同歌曲移除
    if (existingIndices.length > 0) {
      // 删除所有旧的重复版本
      const idsToRemove = existingIndices.map(i => playlist.queue[i].id);
      playlist.removeSongs(idsToRemove);
    }

    // 添加歌曲到队列末尾（这是新的唯一版本）
    playlist.setQueue((prev) => [...prev, song]);
    playlist.setOriginalQueue((prev) => [...prev, song]);
    
    // 显示成功提示
    toast.success('点歌成功，已加入播放队列');
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

  const controlsSection = (
    <div className="flex flex-col items-center justify-center w-full h-full z-30 relative p-4">
      <div className="relative flex flex-col items-center gap-8 w-full max-w-[360px]">
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
          volume={volume}
          onVolumeChange={setVolume}
          speed={player.speed}
          preservesPitch={player.preservesPitch}
          onSpeedChange={player.setSpeed}
          onTogglePreservesPitch={player.togglePreservesPitch}
          coverUrl={currentSong?.coverUrl}
          isBuffering={isBuffering}
          bufferProgress={bufferProgress}
          showVolumePopup={showVolumePopup}
          setShowVolumePopup={setShowVolumePopup}
          showSettingsPopup={showSettingsPopup}
          setShowSettingsPopup={setShowSettingsPopup}
          currentSong={currentSong}
        />

        {/* Floating Playlist Panel */}
        <PlaylistPanel
          isOpen={showPlaylist}
          onClose={() => setShowPlaylist(false)}
          queue={playlist.queue}
          currentSongId={currentSong?.id}
          onPlay={playIndex}
          onImport={handleImportUrl}
          onRemove={playlist.removeSongs}
          accentColor={accentColor}
          onExportPlaylist={playlist.exportPlaylist}
          onImportPlaylist={playlist.importPlaylist}
        />
      </div>
    </div>
  );

  const lyricsVersion = currentSong?.lyrics ? currentSong.lyrics.length : 0;
  const lyricsKey = currentSong ? `${currentSong.id}-${lyricsVersion}` : "no-song";

  const lyricsSection = (
    <div className="w-full h-full relative z-20 flex flex-col justify-center px-4 lg:pl-12">
      <LyricsView
        key={lyricsKey}
        lyrics={currentSong?.lyrics || []}
        audioRef={audioRef}
        isPlaying={playState === PlayState.PLAYING}
        currentTime={currentTime}
        onSeekRequest={handleSeek}
        matchStatus={matchStatus}
      />
    </div>
  );

  const fallbackWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const effectivePaneWidth = paneWidth || fallbackWidth;
  const baseOffset = activePanel === "lyrics" ? -effectivePaneWidth : 0;
  const mobileTranslate = baseOffset + dragOffsetX;

  return (
    <div className="relative w-full h-screen flex flex-col overflow-hidden">
      <FluidBackground
        key={isMobileLayout ? "mobile" : "desktop"}
        colors={currentSong?.colors || []}
        coverUrl={currentSong?.coverUrl}
        isPlaying={playState === PlayState.PLAYING}
        isMobileLayout={isMobileLayout}
      />

      <audio
        ref={audioRef}
        src={resolvedAudioSrc ?? currentSong?.fileUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
        crossOrigin="anonymous"
      />

      <KeyboardShortcuts
        isPlaying={playState === PlayState.PLAYING}
        onPlayPause={togglePlay}
        onNext={playNext}
        onPrev={playPrev}
        onSeek={handleSeek}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        onVolumeChange={setVolume}
        onToggleMode={toggleMode}
        onTogglePlaylist={() => setShowPlaylist((prev) => !prev)}
        speed={player.speed}
        onSpeedChange={player.setSpeed}
        onToggleVolumeDialog={() => setShowVolumePopup((prev) => !prev)}
        onToggleSpeedDialog={() => setShowSettingsPopup((prev) => !prev)}
      />

      <MediaSessionController
        currentSong={currentSong ?? null}
        playState={playState}
        currentTime={currentTime}
        duration={duration}
        playbackRate={player.speed}
        onPlay={play}
        onPause={pause}
        onNext={playNext}
        onPrev={playPrev}
        onSeek={handleSeek}
      />

      {/* Top Bar */}
      <TopBar
        onFilesSelected={handleFileChange}
        onSearchClick={() => setShowSearch(true)}
      />

      {/* Search Modal - Always rendered to preserve state, visibility handled internally */}
      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        queue={playlist.queue}
        onPlayQueueIndex={playIndex}
        onImportAndPlay={handleImportAndPlay}
        onAddToQueue={handleAddToQueue}
        currentSong={currentSong}
        isPlaying={playState === PlayState.PLAYING}
        accentColor={accentColor}
      />

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
              <div
                className="flex-none h-full"
                style={{ width: effectivePaneWidth }}
              >
                {controlsSection}
              </div>
              <div
                className="flex-none h-full"
                style={{ width: effectivePaneWidth }}
              >
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
                className={`absolute inset-0 rounded-full bg-white/25 backdrop-blur-[30px] transition-opacity duration-200 ${activePanel === "controls" ? "opacity-90" : "opacity-60"
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
