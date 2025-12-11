import React from "react";
import { createPortal } from "react-dom";
import { AuraLogo } from "./Icons";

interface AboutDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

const AboutDialog: React.FC<AboutDialogProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center px-4 select-none pointer-events-none"
        >
            <style>{`
        @keyframes modal-in {
            0% { opacity: 0; transform: scale(0.96) translateY(-8px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes modal-out {
            0% { opacity: 1; transform: scale(1) translateY(0); }
            100% { opacity: 0; transform: scale(0.98) translateY(4px); }
        }
        .dialog-in { animation: modal-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; will-change: transform, opacity; }
      `}</style>

            {/* Shared backdrop */}
            <div
                className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                className="dialog-in relative w-full max-w-[380px] bg-black/40 backdrop-blur-2xl saturate-150 border border-white/10 rounded-[32px] shadow-[0_30px_80px_rgba(0,0,0,0.45)] overflow-hidden ring-1 ring-white/5 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Decorative Gradient Blob */}
                <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-b from-purple-500/10 via-transparent to-transparent pointer-events-none blur-3xl" />

                {/* Content */}
                <div className="relative p-8 flex flex-col items-center text-center z-10">
                    {/* Logo Section */}
                    <div className="relative group mb-6">
                        <div className="absolute inset-0 bg-gradient-to-tr from-purple-500 to-orange-500 rounded-[24px] blur-xl opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
                        <div className="relative w-24 h-24 rounded-[24px] shadow-2xl overflow-hidden bg-black/20 ring-1 ring-white/10">
                            <AuraLogo className="w-full h-full drop-shadow-lg" />
                        </div>
                    </div>

                    {/* Title & Version */}
                    <h3 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/60 tracking-tight mb-1">
                        Aura Music
                    </h3>
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-white/5 border border-white/5 text-[11px] font-medium text-white/40 tracking-wide uppercase mb-6">
                        v1.4.0 • Web
                    </div>

                    {/* 构建信息 */}
                    <div className="w-full mb-6 px-3 py-2 rounded-xl bg-white/5 border border-white/5">
                        <div className="text-[11px] text-white/50 space-y-1 font-mono">
                            <div className="flex justify-between items-center">
                                <span className="text-white/40">Build:</span>
                                <span className="text-white/60">{typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-white/40">Date:</span>
                                <span className="text-white/60">{typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'unknown'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <p className="text-white/70 text-[15px] leading-relaxed mb-6 font-medium">
                        An experimental, pure web music player crafted with
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 font-bold mx-1">
                            Vibe Coding
                        </span>
                        technology.
                    </p>

                    {/* Download Feature Notice */}
                    <div className="w-full mb-8 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <div className="flex items-start gap-2">
                            <svg className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="text-left">
                                <p className="text-white/80 text-[13px] leading-relaxed font-medium">
                                    Download opens the direct audio file URL in a new tab. If a platform does not support direct download, the button is disabled.
                                </p>
                                <p className="text-white/60 text-[11px] leading-relaxed mt-1">
                                    下载功能会在新标签页中打开音频文件的直接链接。如果平台不支持直接下载，按钮将被禁用。
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Tech Stack Grid */}
                    <div className="w-full grid grid-cols-3 gap-2 mb-8">
                        <TechBadge label="Gemini 3" />
                        <TechBadge label="Codex" />
                        <TechBadge label="Claude" />
                    </div>

                    {/* 快捷键说明区域 */}
                    <div className="w-full mb-6">
                        <div className="flex items-center justify-between mb-3 px-1">
                            <h4 className="text-white/90 text-sm font-semibold">快捷键说明</h4>
                            <span className="text-white/40 text-xs">
                                {typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘ = Cmd' : 'Ctrl'}
                            </span>
                        </div>
                        <div className="w-full bg-white/5 rounded-2xl border border-white/10 p-4 max-h-[240px] overflow-y-auto">
                            <div className="space-y-2 text-xs">
                                <ShortcutRow keys={["Ctrl/⌘", "K"]} desc="打开搜索" />
                                <ShortcutRow keys={["/"]} desc="聚焦搜索输入框（搜索弹窗内）" />
                                <ShortcutRow keys={["Space"]} desc="播放/暂停（非输入框时）" />
                                <ShortcutRow keys={["←", "→"]} desc="快退/快进 5秒" />
                                <ShortcutRow keys={["Ctrl/⌘", "←/→"]} desc="上一首/下一首" />
                                <ShortcutRow keys={["↑", "↓"]} desc="音量调节" />
                                <ShortcutRow keys={["L"]} desc="切换循环模式" />
                                <ShortcutRow keys={["V"]} desc="打开音量对话框" />
                                <ShortcutRow keys={["S"]} desc="打开速度设置" />
                                <ShortcutRow keys={["Ctrl/⌘", "P"]} desc="打开/关闭播放队列" />
                                <ShortcutRow keys={["Ctrl/⌘", "/"]} desc="显示快捷键帮助" />
                                <ShortcutRow keys={["Esc"]} desc="关闭弹窗/对话框" />
                                <ShortcutRow keys={["Tab"]} desc="切换搜索标签页" />
                                <ShortcutRow keys={["Enter"]} desc="确认选择/执行搜索" />
                            </div>
                        </div>
                        <p className="text-white/40 text-[11px] mt-2 px-1 leading-relaxed">
                            提示：在输入框内输入时，部分快捷键会自动禁用以避免误触。Windows/Linux 使用 Ctrl，macOS 使用 Cmd (⌘)。
                        </p>
                    </div>

                    {/* Selection List */}
                    <div className="w-full flex flex-col gap-2 mb-6">
                        <a
                            href="https://github.com/dingyi222666/aura-music"
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-between px-4 py-3 rounded-2xl border border-white/15 bg-white/5 text-sm font-medium text-white/80 hover:bg-white/10 transition"
                        >
                            <span>View on GitHub</span>
                            <span className="text-[11px] text-white/50">↗</span>
                        </a>

                        <a
                            href="https://github.com/dingyi222666"
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-between px-4 py-3 rounded-2xl border border-white/15 bg-white/5 text-sm font-medium text-white/80 hover:bg-white/10 transition"
                        >
                            <span>Created by dingyi222666</span>
                            <span className="text-[11px] text-white/50">↗</span>
                        </a>
                    </div>
                </div>

                {/* Footer / Close */}
                <div className="border-t border-white/10 bg-white/5 p-2">
                    <button
                        onClick={onClose}
                        className="w-full py-3.5 rounded-2xl text-[16px] font-semibold text-white/90 hover:bg-white/10 active:scale-[0.98] transition-all duration-200"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const TechBadge = ({ label }: { label: string }) => (
    <div className="flex items-center justify-center py-2 px-1 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
        <span className="text-[11px] font-medium text-white/60">{label}</span>
    </div>
);

/**
 * ShortcutRow - 快捷键说明行组件
 * 用于在关于页面展示单个快捷键及其说明
 */
const ShortcutRow = ({ keys, desc }: { keys: string[]; desc: string }) => (
    <div className="flex items-center justify-between py-1.5">
        <span className="text-white/70 font-medium">{desc}</span>
        <div className="flex gap-1">
            {keys.map((k, i) => (
                <kbd
                    key={i}
                    className="min-w-[24px] h-5 px-1.5 flex items-center justify-center bg-white/10 border border-white/5 rounded text-[10px] font-semibold text-white/90"
                >
                    {k}
                </kbd>
            ))}
        </div>
    </div>
);

export default AboutDialog;
