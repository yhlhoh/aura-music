
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Song } from '../types';

interface PlaylistPanelProps {
  isOpen: boolean;
  onClose: () => void;
  queue: Song[];
  currentSongId?: string;
  onPlay: (index: number) => void;
  onImport: (url: string) => Promise<void>;
  onRemove: (ids: string[]) => void;
  accentColor: string;
}

const PlaylistPanel: React.FC<PlaylistPanelProps> = ({ 
  isOpen, 
  onClose, 
  queue, 
  currentSongId, 
  onPlay,
  onImport,
  onRemove,
  accentColor
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [visible, setVisible] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Virtualization Constants
  const ITEM_HEIGHT = 74; // Approx height of each item (including margin)
  const OVERSCAN = 5;

  // Handle animation visibility
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setScrollTop(0); // 重置滚动位置，修复重新打开后显示不出内容的问题
      // 同时重置实际滚动容器的位置
      if (listRef.current) {
        listRef.current.scrollTop = 0;
      }
    } else {
      setIsEditing(false); // Reset mode on close
      setSelectedIds(new Set());
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
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

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    await onImport(importUrl);
    setImportUrl('');
    setIsAdding(false);
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

  if (!visible) return null;

  return (
    <>
    <div 
        ref={panelRef}
        className={`
            absolute bottom-24 -right-8 z-50
            w-[340px] 
            bg-black/10 backdrop-blur-[100px] saturate-150
            rounded-[32px] 
            shadow-[0_20px_50px_rgba(0,0,0,0.3)] 
            border border-white/5
            flex flex-col overflow-hidden
            origin-bottom-right
            transform transition-all duration-300 cubic-bezier(0.32, 0.72, 0, 1)
            ${isOpen 
                ? 'opacity-100 scale-100 translate-y-0' 
                : 'opacity-0 scale-95 translate-y-8 pointer-events-none'
            }
        `}
        style={{ maxHeight: '60vh' }}
        onClick={(e) => e.stopPropagation()}
    >
        {/* iOS 18 Style Header */}
        <div className="px-5 pt-5 pb-3 shrink-0 flex items-center justify-between bg-transparent border-b border-white/5">
            <div className="flex flex-col">
                <h3 className="text-white text-lg font-bold leading-none tracking-tight">Playing Next</h3>
                <span className="text-white/40 text-xs font-medium mt-1">{queue.length} Songs</span>
            </div>
            
            <div className="flex items-center gap-2">
                 {/* Add Button (Ghost Style) */}
                {!isEditing && (
                    <button 
                        onClick={() => setIsAdding(true)}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 text-white/50 hover:text-white hover:bg-white/10"
                        title="Add from URL"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                             <line x1="12" y1="5" x2="12" y2="19"></line>
                             <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                )}

                {/* Edit Button (Icon Style) */}
                <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 ${isEditing ? 'bg-white text-black' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
                    title="Edit List"
                >
                    {isEditing ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                             <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    ) : (
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                             <line x1="8" y1="6" x2="21" y2="6"></line>
                             <line x1="8" y1="12" x2="21" y2="12"></line>
                             <line x1="8" y1="18" x2="21" y2="18"></line>
                             <line x1="3" y1="6" x2="3.01" y2="6"></line>
                             <line x1="3" y1="12" x2="3.01" y2="12"></line>
                             <line x1="3" y1="18" x2="3.01" y2="18"></line>
                        </svg>
                    )}
                </button>
            </div>
        </div>

        {/* Scrollable List with Virtualization */}
        <div 
            ref={listRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto no-scrollbar px-2 py-2 relative"
        >
            {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-white/30 space-y-2">
                    <p className="text-xs font-medium">Queue is empty</p>
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
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </div>
                                )}

                                {/* Cover & Indicator */}
                                <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800 border border-white/5 shadow-sm">
                                    {song.coverUrl ? (
                                        <img src={song.coverUrl} alt="" className={`w-full h-full object-cover transition-opacity duration-300 ${isCurrent && !isEditing ? 'opacity-40 blur-[1px]' : ''}`} />
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
                                    <div className={`text-[15px] font-semibold truncate leading-tight transition-colors duration-300`}
                                         style={{ color: isCurrent ? accentColor : 'rgba(255,255,255,0.9)' }}>
                                        {song.title}
                                    </div>
                                    <div className="text-[13px] text-white/50 truncate font-medium">
                                        {song.artist}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
        
        {/* Footer Actions (Delete) */}
        {isEditing && selectedIds.size > 0 && (
            <div className="p-3 bg-black/20 border-t border-white/5 flex justify-center animate-in slide-in-from-bottom-2">
                <button 
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-6 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-full transition-colors text-sm font-bold active:scale-95"
                >
                    Delete ({selectedIds.size})
                </button>
            </div>
        )}
    </div>

    {/* iOS/MacOS Style Add Dialog (Improved) - Using Portal */}
    {isAdding && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" onClick={() => setIsAdding(false)}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"></div>

            {/* Modal */}
            <div
                className="relative w-full max-w-[360px] bg-black/20 backdrop-blur-[80px] saturate-150 border border-white/10 rounded-[28px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 scale-100 ring-1 ring-white/5"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Content */}
                <div className="p-6 flex flex-col items-center text-center">
                    <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                            <path fillRule="evenodd" d="M19.902 4.098a3.75 3.75 0 00-5.304 0l-4.5 4.5a3.75 3.75 0 001.035 6.037.75.75 0 01-.646 1.353 5.25 5.25 0 01-1.449-8.45l4.5-4.5a5.25 5.25 0 117.424 7.424l-1.757 1.757a.75.75 0 11-1.06-1.06l1.757-1.757a3.75 3.75 0 000-5.304zm-7.389 4.267a.75.75 0 011-.353 5.25 5.25 0 011.449 8.45l-4.5 4.5a5.25 5.25 0 11-7.424-7.424l1.757-1.757a.75.75 0 111.06 1.06l-1.757 1.757a3.75 3.75 0 105.304 5.304l4.5-4.5a3.75 3.75 0 00-1.035-6.037.75.75 0 01-.354-1z" clipRule="evenodd" />
                        </svg>
                    </div>

                    <h3 className="text-xl font-bold text-white tracking-tight">Import Music</h3>
                    <p className="text-white/60 text-[15px] mt-2 leading-relaxed px-2">
                        Paste a <span className="text-white/90 font-medium">Netease Cloud Music</span> song or playlist link to add to queue.
                    </p>

                    <input
                        type="text"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder="https://music.163.com/..."
                        className="w-full mt-5 bg-white/10 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white/10 transition-all text-[15px]"
                        autoFocus
                    />
                </div>

                {/* Action Buttons (iOS Style) */}
                <div className="grid grid-cols-2 border-t border-white/10 divide-x divide-white/10 bg-white/5">
                    <button
                        onClick={() => setIsAdding(false)}
                        className="py-4 text-[17px] text-white/60 font-medium hover:bg-white/5 transition-colors active:bg-white/10"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleImport}
                        className="py-4 text-[17px] text-blue-400 font-semibold hover:bg-white/5 transition-colors active:bg-white/10"
                    >
                        Import
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )}
    </>
  );
};


export default PlaylistPanel;
