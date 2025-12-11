import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { SearchIcon, PlayIcon, PlusIcon } from "./Icons";
import SmartImage from "./SmartImage";
import { Song } from "../types";
import {
  getNeteaseAudioUrl,
  NeteaseTrackInfo,
} from "../services/lyricsService";
import { parseQQSongBy317ak, buildQQMusicUrl, QQTrackInfo, toHttps, fetchQQMusicLyricsFromInjahow } from "../services/qqmusic";
import { parseLyrics, LyricLine } from "../services/lyrics";
import { applyImageCorsProxy } from "../services/utils";
import { useKeyboardScope } from "../hooks/useKeyboardScope";
import { useSearchModal } from "../hooks/useSearchModal";

/**
 * SearchModal - 搜索弹窗组件
 * 
 * 这是一个全屏遮罩的搜索弹窗，支持以下功能：
 * 
 * 1. 打开 Modal 的方式：
 *    - 点击顶部导航栏的搜索图标
 *    - 按下快捷键 Cmd+K (Mac) 或 Ctrl+K (Windows/Linux)
 * 
 * 2. 关闭 Modal 的方式：
 *    - 点击 Modal 外部的灰色遮罩层（最常用）
 *    - 按下 Esc 键（键盘快捷方式）
 *    - 选择一首歌曲后自动关闭
 * 
 * 3. 点击外部关闭的实现原理：
 *    - 外层容器 (div) 监听 onMouseDown 事件
 *    - 当点击发生时，检查点击目标是否在 Modal 内容区域内（使用 modalRef.current.contains()）
 *    - 如果点击在外部，调用 onClose() 关闭 Modal
 *    - Modal 内容区域通过 e.stopPropagation() 阻止事件冒泡，防止内部点击触发关闭
 * 
 * 4. 与其他交互的兼容：
 *    - 上下文菜单（右键菜单）会在点击外部时关闭，但不会关闭 Modal 本身
 *    - 输入框、按钮、滚动条等内部元素的交互不会触发关闭
 * 
 * 5. 响应式设计：
 *    - 桌面端：Modal 固定宽度 720px，居中显示，四周有遮罩
 *    - 移动端：Modal 自动适应屏幕宽度，保持良好的触摸交互体验
 */

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  queue: Song[];
  onPlayQueueIndex: (index: number) => void;
  onImportAndPlay: (song: Song) => void;
  onAddToQueue: (song: Song) => void;
  currentSong: Song | null;
  isPlaying: boolean;
  accentColor: string;
}

/**
 * Format duration from seconds to mm:ss format
 * @param seconds - Duration in seconds
 * @returns Formatted string in mm:ss format
 */
function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Extract playable URL from QQ Music parse result
 * Handles different API response structures for compatibility
 * @param parseResult - Parse result from QQ Music API (317ak format)
 * @returns Playable URL string or undefined
 */
function extractPlayUrl(parseResult: any): string | undefined {
  // 317ak API format: data.music or music
  return parseResult.data?.music || parseResult.music || parseResult.url || parseResult.data?.url;
}

// 固定密钥用于 317ak API
const CKEY = 'RK7TO6VHAB0WSW7VHXKH';
const DEFAULT_BR = 3;

const SEQUOIA_SCROLLBAR_STYLES = `
  .sequoia-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.0) transparent;
    transition: scrollbar-color 0.3s ease;
  }
  .sequoia-scrollbar:hover {
    scrollbar-color: rgba(255, 255, 255, 0.4) transparent;
  }
  .sequoia-scrollbar::-webkit-scrollbar {
    width: 14px;
  }
  .sequoia-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .sequoia-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.0);
    border: 5px solid transparent;
    background-clip: content-box;
    border-radius: 99px;
    transition: background-color 0.3s ease;
  }
  .sequoia-scrollbar:hover::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.4);
  }
  .sequoia-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(255, 255, 255, 0.6);
  }
`;

const ANIMATION_STYLES = `
  @keyframes modal-in {
      0% { opacity: 0; transform: scale(0.96) translateY(-8px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes modal-out {
      0% { opacity: 1; transform: scale(1) translateY(0); }
      100% { opacity: 0; transform: scale(0.98) translateY(4px); }
  }
  @keyframes eq-bounce {
      0%, 100% { transform: scaleY(0.4); opacity: 0.8; }
      50% { transform: scaleY(1.0); opacity: 1; }
  }
  .macos-modal-in { animation: modal-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; will-change: transform, opacity; }
  .macos-modal-out { animation: modal-out 0.15s cubic-bezier(0.32, 0.72, 0, 1) forwards; will-change: transform, opacity; }
`;

const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  queue,
  onPlayQueueIndex,
  onImportAndPlay,
  onAddToQueue,
  currentSong,
  isPlaying,
  accentColor,
}) => {
  // Animation State
  const [isRendering, setIsRendering] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Refs
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Use search modal hook
  const search = useSearchModal({
    queue,
    currentSong,
    isPlaying,
    isOpen,
  });

  // --- Animation Handling ---
  useEffect(() => {
    if (isOpen) {
      setIsRendering(true);
      setIsClosing(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (isRendering && !isClosing) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setIsRendering(false);
        setIsClosing(false);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isRendering]);

  // --- Close context menu on outside click ---
  useEffect(() => {
    if (!search.contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".context-menu-container")) {
        search.closeContextMenu();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [search.contextMenu]);

  // --- Keyboard Scope (High Priority: 100) ---
  useKeyboardScope(
    (e) => {
      if (!isOpen) return false;

      // 关闭右键菜单（如果打开）
      if (search.contextMenu) {
        search.closeContextMenu();
        return true;
      }

      // "/" 键聚焦搜索输入框（仅当输入框未聚焦时）
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
        return true;
      }

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          search.navigateDown();
          return true;
        }
        case "ArrowUp": {
          e.preventDefault();
          search.navigateUp();
          return true;
        }
        case "Enter": {
          e.preventDefault();
          if (search.selectedIndex >= 0) {
            handleSelection(search.selectedIndex);
          } else if (search.activeTab === "netease" && search.query.trim()) {
            search.performNeteaseSearch();
          } else if (search.activeTab === "qqmusic" && search.query.trim()) {
            search.performQQMusicSearch();
          }
          return true;
        }
        case "Escape": {
          e.preventDefault();
          onClose();
          return true;
        }
        case "Tab": {
          e.preventDefault();
          search.switchTab();
          return true;
        }
      }
      return false;
    },
    100,
    isOpen,
  );

  // --- Actions ---

  const handleSelection = (index: number) => {
    if (search.activeTab === "queue") {
      const item = search.queueResults[index];
      if (item) {
        onPlayQueueIndex(item.i);
        onClose();
      }
    } else if (search.activeTab === "netease") {
      const track = search.neteaseProvider.results[index];
      if (track) {
        playNeteaseTrack(track);
        onClose();
      }
    } else if (search.activeTab === "qqmusic") {
      const track = search.qqmusicProvider.results[index];
      if (track) {
        playQQMusicTrack(track);
        onClose();
      }
    }
  };

  const playNeteaseTrack = (track: NeteaseTrackInfo) => {
    const song: Song = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      coverUrl: track.coverUrl.replace("http:", "https:"),
      fileUrl: getNeteaseAudioUrl(track.id),
      isNetease: true,
      neteaseId: track.neteaseId,
      album: track.album,
      lyrics: [],
      needsLyricsMatch: true,
    };
    onImportAndPlay(song);
  };

  // 添加网易云歌曲到队列（通过 onAddToQueue 回调，会自动显示 toast）
  const addNeteaseToQueue = (track: NeteaseTrackInfo) => {
    const song: Song = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      coverUrl: track.coverUrl.replace("http:", "https:"),
      fileUrl: getNeteaseAudioUrl(track.id),
      isNetease: true,
      neteaseId: track.neteaseId,
      album: track.album,
      lyrics: [],
      needsLyricsMatch: true,
    };
    onAddToQueue(song);
  };

  // Helper function to fetch lyrics from injahow API
  const fetchQQMusicLyrics = async (
    songmid: string
  ): Promise<LyricLine[]> => {
    try {
      const lrcText = await fetchQQMusicLyricsFromInjahow(songmid);
      if (lrcText) {
        return parseLyrics(lrcText);
      }
    } catch (error) {
      console.warn("Failed to fetch lyrics from injahow:", error);
    }
    return [];
  };

  const playQQMusicTrack = async (track: QQTrackInfo) => {
    try {
      // 使用 317ak API 解析歌曲 (使用 songmid 和固定 ckey)
      const parseResult = await parseQQSongBy317ak(track.songmid, CKEY, DEFAULT_BR);
      
      const playUrl = extractPlayUrl(parseResult);
      if (!playUrl) {
        console.error("Failed to get playable URL for QQ Music track");
        return;
      }

      // Extract and normalize cover URL, then apply CORS proxy for QQ Music images
      const rawCoverUrl = toHttps(
        parseResult.data?.pic || 
        parseResult.data?.picture || 
        parseResult.pic || 
        parseResult.picture
      );
      const coverUrl = applyImageCorsProxy(rawCoverUrl);

      // Fetch lyrics from injahow API using songmid
      const lyrics = await fetchQQMusicLyrics(track.songmid);
      
      const song: Song = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        fileUrl: toHttps(playUrl),
        coverUrl,
        isQQMusic: true,
        qqMusicMid: track.songmid,
        album: track.album,
        lyrics,
        needsLyricsMatch: lyrics.length === 0,
      };
      onImportAndPlay(song);
    } catch (error) {
      console.error("Error playing QQ Music track:", error);
    }
  };

  // 添加 QQ 音乐到队列（通过 onAddToQueue 回调，会自动显示 toast）
  const addQQMusicToQueue = async (track: QQTrackInfo) => {
    try {
      // 使用 317ak API 解析歌曲 (使用 songmid 和固定 ckey)
      const parseResult = await parseQQSongBy317ak(track.songmid, CKEY, DEFAULT_BR);
      
      const playUrl = extractPlayUrl(parseResult);
      if (!playUrl) {
        console.error("Failed to get playable URL for QQ Music track");
        return;
      }

      // Extract and normalize cover URL, then apply CORS proxy for QQ Music images
      const rawCoverUrl = toHttps(
        parseResult.data?.pic || 
        parseResult.data?.picture || 
        parseResult.pic || 
        parseResult.picture
      );
      const coverUrl = applyImageCorsProxy(rawCoverUrl);

      // Fetch lyrics from injahow API using songmid
      const lyrics = await fetchQQMusicLyrics(track.songmid);
      
      const song: Song = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        fileUrl: toHttps(playUrl),
        coverUrl,
        isQQMusic: true,
        qqMusicMid: track.songmid,
        album: track.album,
        lyrics,
        needsLyricsMatch: lyrics.length === 0,
      };
      onAddToQueue(song);
    } catch (error) {
      console.error("Error adding QQ Music track to queue:", error);
    }
  };

  // Reset refs


  if (!isRendering) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4 select-none font-sans"
      /**
       * 外层容器：用于捕获点击事件
       * - 点击 Modal 外部（遮罩层）时关闭 Modal
       * - 点击 Modal 内部时不关闭（由子元素阻止事件冒泡）
       * 
       * 重要：使用 onMouseDown 而非 onClick，因为：
       * 1. onMouseDown 在 onContextMenu 之前触发
       * 2. 如果在这里关闭上下文菜单，不会影响右键菜单的打开
       */
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        // 检查点击是否发生在 Modal 内容区域外部
        if (!modalRef.current?.contains(target)) {
          onClose();
        }
        // 如果点击了上下文菜单外部，关闭上下文菜单
        if (!target.closest(".context-menu-container")) {
          search.closeContextMenu();
        }
      }}
    >
      <style>{SEQUOIA_SCROLLBAR_STYLES}</style>
      <style>{ANIMATION_STYLES}</style>

      {/* 遮罩层 - 带动画效果 */}
      <div
        className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? "opacity-0" : "opacity-100"}`}
        aria-hidden="true"
      />

      {/* Modal 内容区域 - Sequoia 风格 */}
      <div
        className={`
        relative w-full max-w-[720px] h-[600px]
        bg-black/40 backdrop-blur-2xl saturate-150
        rounded-[20px]
        shadow-[0_50px_100px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.1)]
        flex flex-col overflow-hidden
        ${isClosing ? "macos-modal-out" : "macos-modal-in"}
        text-white
      `}
        ref={modalRef}
        /**
         * 阻止点击事件冒泡到外层容器
         * - 这样点击 Modal 内部（输入框、按钮、结果列表等）不会触发关闭
         * - 只有点击 Modal 外部的遮罩层才会关闭
         * 
         * 关键修复：不在这里阻止 onContextMenu 事件的传播
         * - 只阻止 onMouseDown 事件传播到外层
         * - 允许 onContextMenu 事件正常触发（在结果项上）
         * - 这样右键菜单可以正常工作，不会被父组件阻断
         */
        onMouseDown={(e) => {
          // 只阻止 mousedown 事件传播，不影响 contextmenu 事件
          e.stopPropagation();
        }}
      >
        {/* Header Area */}
        <div className="flex flex-col px-5 pt-5 pb-3 gap-4 border-b border-white/10 shrink-0 bg-white/5 z-10">
          {/* Animated Tabs */}
          <div className="relative flex items-center justify-center p-1 rounded-lg self-center w-full max-w-md mb-1 bg-black/20 backdrop-blur-md shadow-inner">
            {/* Gliding Pill */}
            <div
              className="absolute top-1 bottom-1 rounded-[6px] bg-white/15 shadow-[0_1px_2px_rgba(0,0,0,0.1)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
              style={{
                left: search.activeTab === "queue" ? "4px" : search.activeTab === "netease" ? "calc(100% / 3 + 4px / 3)" : "calc(200% / 3 + 4px / 3)",
                width: "calc(100% / 3 - 8px / 3)",
              }}
            />

            <button
              onClick={() => {
                search.setActiveTab("queue");
              }}
              className={`
                        relative flex-1 py-1.5 text-[13px] font-medium transition-colors duration-200 z-10
                        ${search.activeTab === "queue" ? "text-white" : "text-white/50 hover:text-white/70"}
                    `}
            >
              {search.queueProvider.label}
            </button>
            <button
              onClick={() => {
                search.setActiveTab("netease");
              }}
              className={`
                        relative flex-1 py-1.5 text-[13px] font-medium transition-colors duration-200 z-10
                        ${search.activeTab === "netease" ? "text-white" : "text-white/50 hover:text-white/70"}
                    `}
            >
              {search.neteaseProvider.label}
            </button>
            <button
              onClick={() => {
                search.setActiveTab("qqmusic");
              }}
              className={`
                        relative flex-1 py-1.5 text-[13px] font-medium transition-colors duration-200 z-10
                        ${search.activeTab === "qqmusic" ? "text-white" : "text-white/50 hover:text-white/70"}
                    `}
            >
              {search.qqmusicProvider.label}
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative group mx-2">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <SearchIcon className="w-5 h-5 text-white/40" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              placeholder={
                search.activeTab === "netease"
                  ? "在线搜索…"
                  : search.activeTab === "qqmusic"
                    ? "搜索QQ音乐…"
                    : "筛选队列…"
              }
              className="
                        w-full pl-12 pr-4 py-3.5
                        bg-black/20 hover:bg-black/30 focus:bg-black/40
                        border border-white/5 focus:border-white/15
                        rounded-[12px]
                        text-lg font-medium text-white placeholder:text-white/20
                        outline-none
                        transition-all duration-200
                        shadow-inner
                    "
            />
          </div>
        </div>

        {/* Results Area */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto sequoia-scrollbar p-3 scroll-smooth"
          onScroll={search.handleScroll}
        >
          {/* Queue Results */}
          {search.activeTab === "queue" && (
            <div className="relative flex flex-col gap-1">
              {search.queueResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-white/20">
                  <span className="text-lg">队列中没有歌曲</span>
                </div>
              ) : (
                <>
                  {/* Floating Selection Background */}
                  {search.selectedIndex >= 0 && search.itemRefs.current[search.selectedIndex] && (
                    <div
                      className="absolute left-0 right-0 bg-white/10 rounded-[10px] pointer-events-none transition-all duration-200 ease-out"
                      style={{
                        top: `${search.itemRefs.current[search.selectedIndex]?.offsetTop || 0}px`,
                        height: `${search.itemRefs.current[search.selectedIndex]?.offsetHeight || 56}px`,
                        zIndex: 0,
                      }}
                    />
                  )}

                  {search.queueResults.map(({ s, i }, idx) => {
                    const nowPlaying = search.isNowPlaying(s);
                    return (
                      <div
                        key={`${s.id}-${i}`}
                        ref={(el) => {
                          search.itemRefs.current[idx] = el;
                        }}
                        onClick={() => handleSelection(idx)}
                        onContextMenu={(e) =>
                          search.openContextMenu(e, s, "queue")
                        }
                        className={`
                                        relative z-10 group flex items-center gap-3 p-3 rounded-[10px] cursor-pointer
                                        ${search.selectedIndex === idx ? "text-white" : "hover:bg-white/5 hover:transition-colors hover:duration-150 text-white/90"}
                                    `}
                      >
                        <div className="relative w-10 h-10 rounded-[6px] bg-white/5 overflow-hidden shrink-0 shadow-sm group-hover:shadow-lg transition-shadow duration-200">
                          {s.coverUrl ? (
                            <SmartImage
                              src={s.coverUrl}
                              alt={s.title}
                              containerClassName="w-full h-full"
                              imgClassName={`w-full h-full object-cover transition-opacity ${nowPlaying ? "opacity-40 blur-[1px]" : ""}`}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs opacity-30">
                              ♪
                            </div>
                          )}

                          {/* Play Button on Hover or Selected */}
                          {!nowPlaying && (
                            <div className={`absolute inset-0 flex items-center justify-center bg-black/50 ${search.selectedIndex === idx ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-hover:transition-opacity group-hover:duration-150"}`}>
                              <PlayIcon className="w-4 h-4 fill-white drop-shadow-md" />
                            </div>
                          )}

                          {/* Now Playing Indicator */}
                          {nowPlaying && isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center gap-[2px]">
                              <div
                                className="w-[2px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite]"
                                style={{ height: "8px", color: accentColor }}
                              ></div>
                              <div
                                className="w-[2px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.2s]"
                                style={{ height: "14px", color: accentColor }}
                              ></div>
                              <div
                                className="w-[2px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.4s]"
                                style={{ height: "10px", color: accentColor }}
                              ></div>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                          <div
                            className={`text-[15px] font-medium truncate ${search.selectedIndex === idx ? "text-white" : nowPlaying ? "" : "text-white/90"}`}
                            style={nowPlaying ? { color: accentColor } : {}}
                          >
                            {s.title}
                          </div>
                          <div
                            className={`text-[13px] truncate ${search.selectedIndex === idx ? "text-white/70" : "text-white/40"}`}
                          >
                            {s.artist}
                          </div>
                        </div>
                        {search.selectedIndex === idx && (
                          <div className="mr-1">
                            <PlayIcon className="w-5 h-5 fill-white/80" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Netease Results */}
          {search.activeTab === "netease" && (
            <div className="relative flex flex-col gap-1 pb-4">
              {/* Prompt to press Enter */}
              {search.showNeteasePrompt && (
                <div className="flex flex-col items-center justify-center h-64 text-white/30">
                  <SearchIcon className="w-12 h-12 mb-4 opacity-20" />
                  <span className="text-base font-medium">
                    按 <kbd className="px-2 py-1 bg-white/10 rounded text-white/60">Enter</kbd> 搜索
                  </span>
                </div>
              )}

              {/* No results after search */}
              {search.showNeteaseEmpty && (
                <div className="flex flex-col items-center justify-center h-64 text-white/20">
                  <SearchIcon className="w-12 h-12 mb-4 opacity-20" />
                  <span className="text-base font-medium">
                    未找到匹配项
                  </span>
                </div>
              )}

              {/* Loading State */}
              {search.showNeteaseLoading && (
                <div className="flex flex-col items-center justify-center h-64 text-white/20">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mb-4"></div>
                  <span className="text-base font-medium">搜索中…</span>
                </div>
              )}

              {/* Initial empty state */}
              {search.showNeteaseInitial && (
                <div className="flex flex-col items-center justify-center h-64 text-white/20">
                  <SearchIcon className="w-12 h-12 mb-4 opacity-20" />
                  <span className="text-base font-medium">
                    搜索云音乐
                  </span>
                </div>
              )}

              {/* Results list */}
              {search.neteaseProvider.results.length > 0 && (
                <>
                  {/* Floating Selection Background */}
                  {search.selectedIndex >= 0 && search.itemRefs.current[search.selectedIndex] && (
                    <div
                      className="absolute left-0 right-0 bg-white/25 backdrop-blur-md rounded-[10px] pointer-events-none transition-all duration-200 ease-out"
                      style={{
                        top: `${search.itemRefs.current[search.selectedIndex]?.offsetTop || 0}px`,
                        height: `${search.itemRefs.current[search.selectedIndex]?.offsetHeight || 56}px`,
                        zIndex: 0,
                      }}
                    />
                  )}

                  {search.neteaseProvider.results.map((track, idx) => {
                    const nowPlaying = search.isNowPlaying(track);
                    return (
                      <div
                        key={`${track.id}-${idx}`}
                        ref={(el) => {
                          search.itemRefs.current[idx] = el;
                        }}
                        onClick={() => handleSelection(idx)}
                        onContextMenu={(e) =>
                          search.openContextMenu(e, track, "netease")
                        }
                        className={`
                                        relative z-10 group flex items-center gap-3 p-3 rounded-[10px] cursor-pointer
                                        ${search.selectedIndex === idx ? "text-white" : "hover:bg-white/5 hover:transition-colors hover:duration-150 text-white/90"}
                                    `}
                      >
                        <div className="relative w-10 h-10 rounded-[6px] bg-white/5 overflow-hidden shrink-0 shadow-sm group-hover:shadow-lg transition-shadow duration-200">
                          {track.coverUrl && (
                            <SmartImage
                              src={track.coverUrl}
                              alt={track.title}
                              containerClassName="w-full h-full"
                              imgClassName={`w-full h-full object-cover transition-opacity ${nowPlaying ? "opacity-40 blur-[1px]" : ""}`}
                            />
                          )}

                          {/* Play Button on Hover or Selected */}
                          {!nowPlaying && (
                            <div className={`absolute inset-0 flex items-center justify-center bg-black/50 ${search.selectedIndex === idx ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-hover:transition-opacity group-hover:duration-150"}`}>
                              <PlayIcon className="w-4 h-4 fill-white drop-shadow-md" />
                            </div>
                          )}

                          {/* Now Playing Indicator */}
                          {nowPlaying && isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center gap-[2px]">
                              <div
                                className="w-[2px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite]"
                                style={{ height: "8px", color: accentColor }}
                              ></div>
                              <div
                                className="w-[2px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.2s]"
                                style={{ height: "14px", color: accentColor }}
                              ></div>
                              <div
                                className="w-[2px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.4s]"
                                style={{ height: "10px", color: accentColor }}
                              ></div>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                          <div
                            className={`text-[15px] font-medium truncate ${search.selectedIndex === idx ? "text-white" : nowPlaying ? "" : "text-white/90"}`}
                            style={nowPlaying ? { color: accentColor } : {}}
                          >
                            {track.title}
                          </div>
                          <div
                            className={`text-[13px] truncate ${search.selectedIndex === idx ? "text-white/70" : "text-white/40"}`}
                          >
                            {track.artist}{" "}
                            <span className="opacity-50 mx-1">·</span>{" "}
                            {track.album}
                          </div>
                        </div>
                        <div className="px-2">
                          <span
                            className={`
                                            text-[10px] font-bold px-1.5 py-0.5 rounded border
                                            ${search.selectedIndex === idx
                                ? "border-white/30 text-white/80 bg-white/20"
                                : "border-white/10 text-white/30 bg-white/5"
                              }
                                        `}
                          >
                            云
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Loading Indicator */}
                  {search.neteaseProvider.hasMore && (
                    <div className="py-6 flex items-center justify-center">
                      {search.neteaseProvider.isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
                      ) : (
                        <div className="text-white/20 text-xs">
                          滚动加载更多
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* QQ Music Results */}
          {search.activeTab === "qqmusic" && (
            <div className="relative flex flex-col gap-1 pb-4">
              {/* Prompt to press Enter */}
              {search.showQQMusicPrompt && (
                <div className="flex flex-col items-center justify-center h-64 text-white/30">
                  <SearchIcon className="w-12 h-12 mb-4 opacity-20" />
                  <span className="text-base font-medium">
                    按 <kbd className="px-2 py-1 bg-white/10 rounded text-white/60">Enter</kbd> 搜索
                  </span>
                </div>
              )}

              {/* No results after search */}
              {search.showQQMusicEmpty && (
                <div className="flex flex-col items-center justify-center h-64 text-white/20">
                  <SearchIcon className="w-12 h-12 mb-4 opacity-20" />
                  <span className="text-base font-medium">
                    未找到匹配项
                  </span>
                </div>
              )}

              {/* Loading State */}
              {search.showQQMusicLoading && (
                <div className="flex flex-col items-center justify-center h-64 text-white/20">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mb-4"></div>
                  <span className="text-base font-medium">搜索中…</span>
                </div>
              )}

              {/* Initial empty state */}
              {search.showQQMusicInitial && (
                <div className="flex flex-col items-center justify-center h-64 text-white/20">
                  <SearchIcon className="w-12 h-12 mb-4 opacity-20" />
                  <span className="text-base font-medium">
                    搜索QQ音乐
                  </span>
                </div>
              )}

              {/* Results list */}
              {search.qqmusicProvider.results.length > 0 && (
                <>
                  {/* Floating Selection Background */}
                  {search.selectedIndex >= 0 && search.itemRefs.current[search.selectedIndex] && (
                    <div
                      className="absolute left-0 right-0 bg-white/25 backdrop-blur-md rounded-[10px] pointer-events-none transition-all duration-200 ease-out"
                      style={{
                        top: `${search.itemRefs.current[search.selectedIndex]?.offsetTop || 0}px`,
                        height: `${search.itemRefs.current[search.selectedIndex]?.offsetHeight || 56}px`,
                        zIndex: 0,
                      }}
                    />
                  )}

                  {search.qqmusicProvider.results.map((track, idx) => {
                    const nowPlaying = search.isNowPlaying(track);
                    return (
                      <div
                        key={`${track.id}-${idx}`}
                        ref={(el) => {
                          search.itemRefs.current[idx] = el;
                        }}
                        onClick={() => handleSelection(idx)}
                        onContextMenu={(e) =>
                          search.openContextMenu(e, track, "qqmusic")
                        }
                        className={`
                                        relative z-10 group flex items-center gap-3 p-3 rounded-[10px] cursor-pointer
                                        ${search.selectedIndex === idx ? "text-white" : "hover:bg-white/5 hover:transition-colors hover:duration-150 text-white/90"}
                                    `}
                      >
                        {/* 封面图 - 统一显示样式与网易云一致 */}
                        <div className="relative w-10 h-10 rounded-[6px] bg-white/5 overflow-hidden shrink-0 shadow-sm group-hover:shadow-lg transition-shadow duration-200">
                          {track.albumImageUrl && (
                            <SmartImage
                              src={applyImageCorsProxy(track.albumImageUrl)}
                              alt={track.title}
                              containerClassName="w-full h-full"
                              imgClassName={`w-full h-full object-cover transition-opacity ${nowPlaying ? "opacity-40 blur-[1px]" : ""}`}
                            />
                          )}

                          {/* Play Button on Hover or Selected */}
                          {!nowPlaying && (
                            <div className={`absolute inset-0 flex items-center justify-center bg-black/50 ${search.selectedIndex === idx ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-hover:transition-opacity group-hover:duration-150"}`}>
                              <PlayIcon className="w-4 h-4 fill-white drop-shadow-md" />
                            </div>
                          )}

                          {/* Now Playing Indicator */}
                          {nowPlaying && isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center gap-[2px]">
                              <div
                                className="w-[2px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite]"
                                style={{ height: "8px", color: accentColor }}
                              ></div>
                              <div
                                className="w-[2px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.2s]"
                                style={{ height: "14px", color: accentColor }}
                              ></div>
                              <div
                                className="w-[2px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.4s]"
                                style={{ height: "10px", color: accentColor }}
                              ></div>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                          <div className="flex items-center gap-2">
                            <div
                              className={`text-[15px] font-medium truncate ${search.selectedIndex === idx ? "text-white" : nowPlaying ? "" : "text-white/90"}`}
                              style={nowPlaying ? { color: accentColor } : {}}
                            >
                              {track.title}
                            </div>
                            {track.payplay === 1 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 shrink-0">
                                付费
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-[13px] truncate ${search.selectedIndex === idx ? "text-white/70" : "text-white/40"}`}
                          >
                            {track.artist}{" "}
                            <span className="opacity-50 mx-1">·</span>{" "}
                            {track.album}
                          </div>
                        </div>
                        <div className="px-2">
                          <span
                            className={`
                                            text-[10px] font-bold px-1.5 py-0.5 rounded border
                                            ${search.selectedIndex === idx
                                ? "border-white/30 text-white/80 bg-white/20"
                                : "border-white/10 text-white/30 bg-white/5"
                              }
                                        `}
                          >
                            QQ
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Loading Indicator */}
                  {search.qqmusicProvider.hasMore && (
                    <div className="py-6 flex items-center justify-center">
                      {search.qqmusicProvider.isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
                      ) : (
                        <div className="text-white/20 text-xs">
                          滚动加载更多
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* 
          右键菜单 Portal 
          
          重要：此菜单通过 createPortal 渲染到 document.body
          - 独立于 SearchModal 的 DOM 层级
          - 使用 .context-menu-container 类名用于外部点击检测
          - z-index 设置为 10000，确保在 Modal (z-index: 9999) 之上
          
          样式说明：
          - 使用 Sequoia 风格的毛玻璃效果和圆角
          - backdrop-blur-[80px] 实现强烈的背景模糊
          - saturate-150 增强色彩饱和度
          - shadow-2xl 提供深度阴影效果
        */}
        {search.contextMenu &&
          createPortal(
            <div
              className="context-menu-container fixed z-[10000] w-48 bg-black/40 backdrop-blur-[80px] saturate-150 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-left p-1 flex flex-col gap-0.5"
              style={{ top: search.contextMenu.y, left: search.contextMenu.x }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* 立即播放选项 */}
              <button
                onClick={() => {
                  if (search.contextMenu!.type === "queue") {
                    const qItem = search.contextMenu!.track as Song;
                    const idx = queue.findIndex((s) => s.id === qItem.id);
                    onPlayQueueIndex(idx);
                  } else if (search.contextMenu!.type === "netease") {
                    playNeteaseTrack(
                      search.contextMenu!.track as NeteaseTrackInfo,
                    );
                  } else if (search.contextMenu!.type === "qqmusic") {
                    playQQMusicTrack(
                      search.contextMenu!.track as QQTrackInfo,
                    );
                  }
                  search.closeContextMenu();
                  // 不自动关闭 modal，便于用户连续操作
                }}
                className="w-full px-3 py-2 text-left text-sm font-medium text-white/90 hover:bg-white/10 active:bg-white/15 rounded-lg transition-colors cursor-pointer"
              >
                立即播放
              </button>
              
              {/* 加入队列选项（仅在线音乐） */}
              {search.contextMenu.type === "netease" && (
                <button
                  onClick={() => {
                    const track = search.contextMenu!.track as NeteaseTrackInfo;
                    addNeteaseToQueue(track);
                    search.closeContextMenu();
                    // 不自动关闭 modal，便于用户连续操作
                  }}
                  className="w-full px-3 py-2 text-left text-sm font-medium text-white/90 hover:bg-white/10 active:bg-white/15 rounded-lg transition-colors cursor-pointer"
                >
                  加入队列
                </button>
              )}
              {search.contextMenu.type === "qqmusic" && (
                <button
                  onClick={() => {
                    const track = search.contextMenu!.track as QQTrackInfo;
                    addQQMusicToQueue(track);
                    search.closeContextMenu();
                    // 不自动关闭 modal，便于用户连续操作
                  }}
                  className="w-full px-3 py-2 text-left text-sm font-medium text-white/90 hover:bg-white/10 active:bg-white/15 rounded-lg transition-colors cursor-pointer"
                >
                  加入队列
                </button>
              )}
            </div>,
            document.body,
          )}
      </div>
    </div>,
    document.body,
  );
};

export default SearchModal;
