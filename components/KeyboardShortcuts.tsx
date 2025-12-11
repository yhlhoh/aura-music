import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useKeyboardScope } from "../hooks/useKeyboardScope";

/**
 * KeyboardShortcuts 组件 - 全局键盘快捷键处理与帮助对话框
 * 
 * 功能说明：
 * 1. 提供全局键盘快捷键支持（播放控制、音量调节等）
 * 2. 显示快捷键帮助对话框（Ctrl+/）
 * 3. 智能检测输入框焦点，避免快捷键误触
 * 
 * 优先级设计：
 * - 此组件使用优先级 50（较低）
 * - SearchModal 使用优先级 100（较高）
 * - 确保搜索弹窗打开时，其快捷键优先生效
 * 
 * 输入框保护机制：
 * - 检查事件目标是否为 INPUT、TEXTAREA 或 contentEditable
 * - 如果是，则不处理快捷键，避免干扰用户输入
 */

interface KeyboardShortcutsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  currentTime: number;
  duration: number;
  volume: number;
  onVolumeChange: (vol: number) => void;
  onToggleMode: () => void;
  onTogglePlaylist: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onToggleVolumeDialog: () => void;
  onToggleSpeedDialog: () => void;
}

const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({
  isPlaying,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  currentTime,
  duration,
  volume,
  onVolumeChange,
  onToggleMode,
  onTogglePlaylist,
  speed,
  onSpeedChange,
  onToggleVolumeDialog,
  onToggleSpeedDialog,
}) => {
  // 对话框显示状态
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // 控制对话框的淡入淡出动画
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  /**
   * 全局键盘快捷键处理器
   * 
   * 优先级：50（低于 SearchModal 的 100）
   * 
   * 输入框保护：
   * - 当用户在 INPUT、TEXTAREA 或可编辑元素中输入时
   * - 返回 false，不处理快捷键
   * - 避免误触播放/暂停等全局操作
   */
  useKeyboardScope(
    (e) => {
      const target = e.target as HTMLElement;
      // 检查是否在输入框内，如果是则不处理快捷键
      if (
        ["INPUT", "TEXTAREA"].includes(target.tagName) ||
        target.isContentEditable
      )
        return false;

      // Ctrl + / 显示/隐藏快捷键帮助对话框
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        return true;
      }

      // Ctrl + P 打开/关闭播放队列
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        onTogglePlaylist();
        return true;
      }

      // Esc 键关闭帮助对话框
      if (e.key === "Escape") {
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
          return true;
        }
        return false;
      }

      // 处理其他快捷键
      switch (e.key) {
        case " ": // 空格键：播放/暂停
          e.preventDefault();
          onPlayPause();
          return true;
        case "ArrowRight": // 右箭头：快进 5 秒 或 下一首（Ctrl+右）
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            onNext(); // Ctrl/Cmd + 右箭头 = 下一首
          } else {
            onSeek(Math.min(currentTime + 5, duration)); // 右箭头 = 快进 5 秒
          }
          return true;
        case "ArrowLeft": // 左箭头：快退 5 秒 或 上一首（Ctrl+左）
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            onPrev(); // Ctrl/Cmd + 左箭头 = 上一首
          } else {
            onSeek(Math.max(currentTime - 5, 0)); // 左箭头 = 快退 5 秒
          }
          return true;
        case "ArrowUp": // 上箭头：增加音量
          e.preventDefault();
          onVolumeChange(Math.min(volume + 0.1, 1));
          return true;
        case "ArrowDown": // 下箭头：降低音量
          e.preventDefault();
          onVolumeChange(Math.max(volume - 0.1, 0));
          return true;
        case "l":
        case "L": // L 键：切换循环模式
          e.preventDefault();
          onToggleMode();
          return true;
        case "v":
        case "V": // V 键：打开音量对话框
          e.preventDefault();
          onToggleVolumeDialog();
          return true;
        case "s":
        case "S": // S 键：打开速度设置对话框
          e.preventDefault();
          onToggleSpeedDialog();
          return true;
      }

      return false;
    },
    50, // 优先级：50（低于 SearchModal）
    true,
  );

if (!isVisible) return null;

return createPortal(
  <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 select-none font-sans pointer-events-none">
    <style>{`
      @keyframes ios-in {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
      }
      @keyframes ios-out {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.95); }
      }
      .animate-in { animation: ios-in 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards; will-change: transform, opacity; }
      .animate-out { animation: ios-out 0.15s cubic-bezier(0.32, 0.72, 0, 1) forwards; will-change: transform, opacity; }
    `}</style>

    {/* Shared backdrop */}
    <div
      className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto ${isOpen ? "opacity-100" : "opacity-0"}`}
      onClick={() => setIsOpen(false)}
    />

    {/* Help Dialog */}
    {isOpen && (
      <div
        className={`
            relative w-full max-w-2xl pointer-events-auto
            bg-black/40 backdrop-blur-2xl saturate-150
            border border-white/10
            rounded-[32px]
            shadow-[0_30px_80px_rgba(0,0,0,0.45)]
            overflow-hidden
            text-white
            ${isOpen ? "animate-in" : "animate-out"}
        `}
      >
        {/* Content Container */}
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1">
              <h2 className="text-2xl font-bold tracking-tight">
                Keyboard Shortcuts
              </h2>
              <p className="text-white/50 font-medium">
                Quick controls for playback
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 1L11 11M1 11L11 1"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
            <ShortcutItem keys={["Space"]} label="Play / Pause" />
            <ShortcutItem keys={["L"]} label="Loop Mode" />
            <ShortcutItem keys={["←", "→"]} label="Seek ±5s" />
            <ShortcutItem keys={["Ctrl", "←/→"]} label="Prev / Next Song" />
            <ShortcutItem keys={["↑", "↓"]} label="Volume Control" />
            <ShortcutItem keys={["V"]} label="Volume Dialog" />
            <ShortcutItem keys={["S"]} label="Speed Dialog" />
            <ShortcutItem keys={["Ctrl", "K"]} label="Search" />
            <ShortcutItem keys={["Ctrl", "P"]} label="Toggle Playlist" />
            <ShortcutItem keys={["Ctrl", "/"]} label="Toggle Shortcuts" />
          </div>

          {/* Footer Hint */}
          <div className="mt-8 pt-6 border-t border-white/5 text-center text-white/30 text-xs font-medium tracking-wider uppercase">
            Press{" "}
            <kbd className="font-sans bg-white/10 px-1.5 py-0.5 rounded mx-1 text-white/60">
              Esc
            </kbd>{" "}
            to close
          </div>
        </div>
      </div>
    )}
  </div>,
  document.body,
);
};

const ShortcutItem = ({ keys, label }: { keys: string[]; label: string }) => (
  <div className="flex items-center justify-between group p-2 rounded-xl hover:bg-white/5 transition-colors">
    <span className="text-white/70 font-medium group-hover:text-white transition-colors">
      {label}
    </span>
    <div className="flex gap-1">
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="min-w-[28px] h-7 px-2 flex items-center justify-center bg-white/10 border border-white/5 rounded-[8px] text-sm font-semibold text-white/90 shadow-sm"
        >
          {k}
        </kbd>
      ))}
    </div>
  </div>
);

export default KeyboardShortcuts;
