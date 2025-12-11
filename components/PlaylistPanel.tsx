
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTransition, animated } from '@react-spring/web';
import { Song } from '../types';
import { CheckIcon, PlusIcon, QueueIcon, TrashIcon, SelectAllIcon, DownloadIcon } from './Icons';

import { useKeyboardScope } from '../hooks/useKeyboardScope';
import ImportMusicDialog from './ImportMusicDialog';
import SmartImage from './SmartImage';
import { getDirectAudioUrl, canAttemptDirectDownload } from '../services/audioAdapter';

/**
 * Download Button Component
 * 
 * Handles downloading/opening direct audio file URLs for songs.
 * This component resolves the direct audio URL and opens it in a new tab.
 * 
 * Behavior:
 * - QQ Music: Fetches time-limited CDN URL via 317ak API
 * - Netease: Uses Meting API redirect to Netease CDN
 * - Local files: Uses the existing file URL
 * - Platform pages: NOT supported - button is disabled
 * 
 * Why direct URLs only:
 * - Ensures users download actual audio files, not web pages
 * - Consistent behavior across all platforms
 * - Better user experience for offline listening
 * 
 * Error handling:
 * - Shows toast error if URL resolution fails
 * - Disables button if platform doesn't support direct download
 * - Gracefully handles network failures and API errors
 * 
 * Security:
 * - Uses rel="noopener noreferrer" to prevent opener vulnerabilities
 * - All URLs are time-limited and signed by platforms
 * - No long-lived tokens exposed in UI
 */
const DownloadButton: React.FC<{
    song: Song;
    onError: (message: string) => void;
}> = ({ song, onError }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [directUrl, setDirectUrl] = useState<string | null>(null);
    const [canDownload, setCanDownload] = useState(false);

    // Check if download is possible on mount
    useEffect(() => {
        setCanDownload(canAttemptDirectDownload(song));
    }, [song]);

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (!canDownload) {
            return;
        }

        setIsLoading(true);
        try {
            const url = await getDirectAudioUrl(song);
            if (url) {
                // Open direct audio URL in new tab with security attributes
                // Create a temporary link element to ensure proper rel attributes
                const link = document.createElement('a');
                link.href = url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.click();
                setDirectUrl(url);
            } else {
                onError('无法获取下载链接 / Cannot get download URL');
            }
        } catch (error) {
            console.error('Download URL resolution failed:', error);
            onError('下载链接解析失败 / Download URL resolution failed');
        } finally {
            setIsLoading(false);
        }
    };

    // Don't show button if download is not supported
    if (!canDownload) {
        return (
            <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/20 cursor-not-allowed flex-shrink-0"
                title="此平台不支持直接下载 / Direct download is not available for this track"
                aria-label="下载不可用"
            >
                <DownloadIcon className="w-4 h-4" />
            </div>
        );
    }

    return (
        <button
            onClick={handleDownload}
            disabled={isLoading}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                isLoading 
                    ? 'text-white/20 cursor-wait' 
                    : 'text-white/40 hover:text-white hover:bg-white/10'
            }`}
            title={isLoading ? '获取下载链接中... / Getting download URL...' : '在新标签页打开音频文件 / Open audio file in new tab'}
            aria-label="下载/打开链接"
        >
            <DownloadIcon className="w-4 h-4" />
        </button>
    );
};

const IOS_SCROLLBAR_STYLES = `
  .playlist-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.65) rgba(255, 255, 255, 0.02);
  }
  .playlist-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  .playlist-scrollbar::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.02);
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    backdrop-filter: blur(28px);
  }
  .playlist-scrollbar::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.5));
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    backdrop-filter: blur(24px);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3);
  }
  .playlist-scrollbar::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.72));
  }
`;

interface PlaylistPanelProps {
    isOpen: boolean;
    onClose: () => void;
    queue: Song[];
    currentSongId?: string;
    onPlay: (index: number) => void;
    onImport: (url: string) => Promise<boolean>;
    onRemove: (ids: string[]) => void;
    accentColor: string;
    onExportPlaylist: () => void;
    onImportPlaylist: (file: File) => Promise<{
        success: number;
        skipped: number;
        failed: number;
        errors: string[];
    }>;
    onDownloadError?: (message: string) => void;
}

const PlaylistPanel: React.FC<PlaylistPanelProps> = ({
    isOpen,
    onClose,
    queue,
    currentSongId,
    onPlay,
    onImport,
    onRemove,
    accentColor,
    onExportPlaylist,
    onImportPlaylist,
    onDownloadError,
}) => {
    const [isAdding, setIsAdding] = useState(false);
    const [visible, setVisible] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const panelRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);

    // Virtualization Constants
    const ITEM_HEIGHT = 74; // Approx height of each item (including margin)
    const OVERSCAN = 5;

    // ESC key support using keyboard scope
    useKeyboardScope(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isAdding) {
                e.preventDefault();
                onClose();
                return true; // Claim the event
            }
            return false;
        },
        100, // High priority
        isOpen, // Only active when panel is open
    );

    // Handle animation visibility with react-spring
    const transitions = useTransition(isOpen, {
        from: { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
        enter: { opacity: 1, transform: 'translateY(0px) scale(1)' },
        leave: { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
        config: { tension: 280, friction: 24 }, // Rebound feel
        onRest: () => {
            if (!isOpen) {
                setIsEditing(false);
                setSelectedIds(new Set());
            }
        }
    });

    // Scroll to current song when opening
    useEffect(() => {
        if (isOpen && listRef.current) {
            const index = queue.findIndex(s => s.id === currentSongId);
            if (index !== -1) {
                const containerHeight = listRef.current.clientHeight;
                const targetScroll = (index * ITEM_HEIGHT) - (containerHeight / 2) + (ITEM_HEIGHT / 2);
                listRef.current.scrollTop = targetScroll;
                setScrollTop(targetScroll);
            } else {
                listRef.current.scrollTop = 0;
                setScrollTop(0);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && !isAdding && panelRef.current && !panelRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose, isAdding]);

    const handleImport = async (url: string) => {
        const success = await onImport(url);
        if (success) {
            setIsAdding(false);
        }
        return success;
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handleDelete = () => {
        onRemove(Array.from(selectedIds));
        setSelectedIds(new Set());
        setIsEditing(false);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === queue.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(queue.map(song => song.id)));
        }
    };

    // Virtual List Logic
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    const { virtualItems, totalHeight, startOffset } = useMemo(() => {
        const totalHeight = queue.length * ITEM_HEIGHT;
        const containerHeight = 600; // Approx max height

        let startIndex = Math.floor(scrollTop / ITEM_HEIGHT);
        let endIndex = Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT);

        startIndex = Math.max(0, startIndex - OVERSCAN);
        endIndex = Math.min(queue.length, endIndex + OVERSCAN);

        const virtualItems = [];
        for (let i = startIndex; i < endIndex; i++) {
            virtualItems.push({
                ...queue[i],
                index: i
            });
        }

        return {
            virtualItems,
            totalHeight,
            startOffset: startIndex * ITEM_HEIGHT
        };
    }, [queue, scrollTop]);

    return (
        <>
            <style>{IOS_SCROLLBAR_STYLES}</style>
            {transitions((style, item) => item && (
                <animated.div
                    ref={panelRef}
                    style={{ ...style, maxHeight: '60vh' }}
                    className={`
                        absolute bottom-24 -right-8 z-50
                        w-[340px] 
                        bg-black/10 backdrop-blur-[100px] saturate-150
                        rounded-[32px] 
                        shadow-[0_20px_50px_rgba(0,0,0,0.3)] 
                        border border-white/5
                        flex flex-col overflow-hidden
                        origin-bottom-right
                    `}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* iOS 18 Style Header */}
                    <div className="px-5 pt-5 pb-3 shrink-0 flex items-center justify-between bg-transparent border-b border-white/5">
                        <div className="flex flex-col">
                            <h3 className="text-white text-lg font-bold leading-none tracking-tight">即将播放</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-white/40 text-xs font-medium">{queue.length} 首歌曲</span>
                                {(() => {
                                    const pendingCount = queue.filter(s => s.needsIdBackfill).length;
                                    if (pendingCount > 0) {
                                        return (
                                            <span className="text-yellow-400/70 text-[10px] font-medium">
                                                ({pendingCount} 首待补全)
                                            </span>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* 导入歌单按钮 */}
                            <button
                                onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = '.json,application/json';
                                    input.onchange = async (e: any) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        
                                        try {
                                            const result = await onImportPlaylist(file);
                                            
                                            // 显示导入结果
                                            const messages: string[] = [];
                                            if (result.success > 0) {
                                                messages.push(`成功导入 ${result.success} 首`);
                                            }
                                            if (result.skipped > 0) {
                                                messages.push(`跳过重复 ${result.skipped} 首`);
                                            }
                                            if (result.failed > 0) {
                                                messages.push(`失败 ${result.failed} 首`);
                                            }
                                            
                                            if (result.errors.length > 0) {
                                                alert(messages.join('，') + '\n\n错误详情：\n' + result.errors.join('\n'));
                                            } else {
                                                alert(messages.join('，'));
                                            }
                                        } catch (error) {
                                            alert('导入失败：' + (error instanceof Error ? error.message : '未知错误'));
                                        }
                                    };
                                    input.click();
                                }}
                                className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-white/50 hover:text-white hover:bg-white/10"
                                title="导入歌单 (JSON)"
                            >
                                <span className="text-xs">导入</span>
                            </button>
                            {/* 导出歌单按钮 */}
                            <button
                                onClick={onExportPlaylist}
                                className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-white/50 hover:text-white hover:bg-white/10"
                                title="导出歌单 (JSON)"
                            >
                                <span className="text-xs">导出</span>
                            </button>
                            {isEditing ? (
                                <>
                                    <button
                                        onClick={handleSelectAll}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${selectedIds.size === queue.length && queue.length > 0 ? 'text-white bg-white/10' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
                                        title="全选"
                                    >
                                        <SelectAllIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={handleDelete}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${selectedIds.size > 0 ? 'text-red-400 hover:bg-red-500/10' : 'text-white/20 cursor-not-allowed'}`}
                                        title="删除所选"
                                        disabled={selectedIds.size === 0}
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(false)}
                                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/10"
                                        style={{ color: accentColor }}
                                        title="完成"
                                    >
                                        <CheckIcon className="w-5 h-5" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setIsAdding(true)}
                                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-white/50 hover:text-white hover:bg-white/10"
                                        title="通过链接添加"
                                    >
                                        <PlusIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-white/50 hover:text-white hover:bg-white/10"
                                        title="编辑列表"
                                    >
                                        <QueueIcon className="w-5 h-5" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Scrollable List with Virtualization */}
                    <div
                        ref={listRef}
                        onScroll={handleScroll}
                        className="flex-1 overflow-y-auto playlist-scrollbar px-2 py-2 relative"
                    >
                        {queue.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-32 text-white/30 space-y-2">
                                <p className="text-xs font-medium">队列为空</p>
                            </div>
                        ) : (
                            <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
                                {virtualItems.map((song) => {
                                    const index = song.index;
                                    const isCurrent = song.id === currentSongId;
                                    const isSelected = selectedIds.has(song.id);

                                    return (
                                        <div
                                            key={`${song.id}-${index}`}
                                            onClick={() => {
                                                if (isEditing) toggleSelection(song.id);
                                                else onPlay(index);
                                            }}
                                            className={`
                                    absolute left-0 right-0 h-[66px]
                                    group flex items-center gap-3 p-2 mx-2 rounded-2xl cursor-pointer transition-all duration-200
                                    ${isEditing ? 'hover:bg-white/10' : isCurrent ? 'bg-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]' : 'hover:bg-white/5'}
                                `}
                                            style={{
                                                top: `${index * ITEM_HEIGHT}px`,
                                                // Adjust height within the slot if needed, ITEM_HEIGHT includes gap
                                                height: '66px'
                                            }}
                                        >
                                            {/* Edit Mode Checkbox */}
                                            {isEditing && (
                                                <div className={`
                                        w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ml-1
                                        ${isSelected ? 'border-transparent' : 'border-white/20 group-hover:border-white/40'}
                                    `}
                                                    style={{ backgroundColor: isSelected ? accentColor : 'transparent' }}
                                                >
                                                    {isSelected && (
                                                        <CheckIcon className="w-3 h-3 text-white" />
                                                    )}
                                                </div>
                                            )}

                                            {/* Cover & Indicator */}
                                            <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800 border border-white/5 shadow-sm">
                                                {song.coverUrl ? (
                                                    <SmartImage
                                                        src={song.coverUrl}
                                                        alt={song.title}
                                                        containerClassName="w-full h-full"
                                                        imgClassName={`w-full h-full object-cover transition-opacity duration-300 ${isCurrent && !isEditing ? 'opacity-40 blur-[1px]' : ''}`}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-gray-700 text-white/20 text-[10px]">♪</div>
                                               )}

                                                {/* Redesigned Now Playing Indicator (Equalizer) */}
                                                {isCurrent && !isEditing && (
                                                    <div className="absolute inset-0 flex items-center justify-center gap-[3px]">
                                                        <div className="w-[3px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite]" style={{ height: '12px', color: accentColor }}></div>
                                                        <div className="w-[3px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.2s]" style={{ height: '20px', color: accentColor }}></div>
                                                        <div className="w-[3px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.4s]" style={{ height: '15px', color: accentColor }}></div>
                                                        <style>{`
                                                @keyframes eq-bounce {
                                                    0%, 100% { transform: scaleY(0.4); opacity: 0.8; }
                                                    50% { transform: scaleY(1.0); opacity: 1; }
                                                }
                                            `}</style>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Text */}
                                            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`text-[15px] font-semibold truncate leading-tight transition-colors duration-300 flex-1`}
                                                        style={{ color: isCurrent ? accentColor : 'rgba(255,255,255,0.9)' }}>
                                                        {song.title}
                                                    </div>
                                                    {/* 待补全 ID 标记 */}
                                                    {song.needsIdBackfill && (
                                                        <span 
                                                            className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-medium rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                                                            title="此歌曲缺失平台 ID，使用临时标识"
                                                        >
                                                            待补全
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[13px] text-white/50 truncate font-medium">
                                                    {song.artist}
                                                </div>
                                            </div>
                                            
                                            {/* Download Button - Only shown in non-editing mode */}
                                            {!isEditing && (
                                                <DownloadButton 
                                                    song={song} 
                                                    onError={onDownloadError || (() => {})} 
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                </animated.div>
            ))}

            {/* Import Music Dialog */}
            <ImportMusicDialog
                isOpen={isAdding}
                onClose={() => setIsAdding(false)}
                onImport={handleImport}
            />
        </>
    );
};

export default PlaylistPanel;
