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
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
            onClick={onClose}
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

            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"></div>

            {/* Modal */}
            <div
                className="dialog-in relative w-full max-w-[380px] bg-[#1c1c1e]/80 backdrop-blur-2xl saturate-150 border border-white/10 rounded-[32px] shadow-2xl overflow-hidden ring-1 ring-white/5"
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
                        v1.0.0 • Pure Web
                    </div>

                    {/* Description */}
                    <p className="text-white/70 text-[15px] leading-relaxed mb-8 font-medium">
                        An experimental, pure web music player crafted with
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 font-bold mx-1">
                            Vibe Coding
                        </span>
                        technology.
                    </p>

                    {/* Tech Stack Grid */}
                    <div className="w-full grid grid-cols-3 gap-2 mb-8">
                        <TechBadge label="Gemini 3" />
                        <TechBadge label="Codex" />
                        <TechBadge label="Claude" />
                    </div>

                    {/* Author Section */}
                    <div className="w-full flex items-center justify-between px-4 py-3 bg-white/5 rounded-2xl border border-white/5 mb-2">
                        <span className="text-white/40 text-xs font-medium uppercase tracking-wider">
                            Created by
                        </span>
                        <span className="text-white/90 text-sm font-semibold flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                            dingyi
                        </span>
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

export default AboutDialog;
