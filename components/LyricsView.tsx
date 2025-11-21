
import React, { useRef, useEffect, useState, useLayoutEffect, useCallback } from "react";
import { LyricLine as LyricLineType } from "../types";
import LyricLine, { LineMotionPlan, SharedMotionState } from "./LyricLine";
import { SpringSystem, POS_Y_SPRING } from "../services/springSystem";

// -------------------------------------------------------------------------
// Main Lyrics View (No Virtualization for smoothness)
// -------------------------------------------------------------------------

interface LyricsViewProps {
  lyrics: LyricLineType[];
  audioRef: React.RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  currentTime: number;
  onSeekRequest: (time: number, immediate?: boolean) => void;
  matchStatus: "idle" | "matching" | "success" | "failed";
}

const LyricsView: React.FC<LyricsViewProps> = ({
  lyrics,
  audioRef,
  isPlaying,
  currentTime,
  onSeekRequest,
  matchStatus,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const motionPlansRef = useRef<LineMotionPlan[]>([]);
  const [planVersion, setPlanVersion] = useState(0);
  const impulseCounterRef = useRef(0);
  const sharedMotionRef = useRef<SharedMotionState>({
    targetPosY: 0,
    activePoint: 0,
    visualState: false,
    isMobile: false,
  });

  // -------------------------------------------------------------------------
  // Physics State
  // -------------------------------------------------------------------------
  // Used ONLY for drag/touch interactions now. Auto-scroll bypasses this.
  const springSystem = useRef(new SpringSystem({ y: 0 }));
  const animationRef = useRef(0);
  const lastTimeRef = useRef(0);

  const scrollState = useRef({
    isDragging: false,
    lastInteractionTime: 0,
    touchStartY: 0,
    touchLastY: 0,
    touchStartX: 0,
    touchLastX: 0,
    touchVelocity: 0,
    visualState: false,
  });

  const [activeIndex, setActiveIndex] = useState(-1);
  const [isMobile, setIsMobile] = useState(false);
  const hasTranslation = lyrics.some((line) => line.translation);

  const RESUME_DELAY_MS = 3000;
  type ImpulseDescriptor = Omit<LineMotionPlan["impulse"], "id">;

  const createImpulseDescriptor = (
    relativeIndex: number
  ): ImpulseDescriptor | undefined => {
    // Past lines
    if (relativeIndex < 0) {
      const distance = Math.min(Math.abs(relativeIndex), 5);
      return {
        offset: -40 - distance * 12,
        delay: Math.max(0, (distance - 1) * 40),
        config: { mass: 0.85, stiffness: 175, damping: 32, precision: 0.25 },
      };
    }

    // Future lines - Unified block movement
    // We remove strict staggering here. The physics in LyricLine will handle the elasticity.
    if (relativeIndex >= 1) {
      return {
        offset: -12,
        delay: 0, // No staggered delay, move together
        config: { mass: 1, stiffness: 120, damping: 22, precision: 0.3 },
      };
    }

    return undefined;
  };

  // Detect mobile layout
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(max-width: 1024px)");
    const updateLayout = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
    };
    updateLayout(query);
    query.addEventListener("change", updateLayout);
    return () => query.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    sharedMotionRef.current.isMobile = isMobile;
  }, [isMobile]);

  // -------------------------------------------------------------------------
  // Active Index Logic
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!lyrics.length) return;
    let idx = -1;

    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time) {
        const nextTime = lyrics[i + 1]?.time ?? Infinity;
        if (currentTime < nextTime) {
          idx = i;
          break;
        }
      }
    }

    if (idx !== -1 && idx !== activeIndex) {
      setActiveIndex(idx);
    }
  }, [currentTime, lyrics]);

  // -------------------------------------------------------------------------
  // Animation & Physics Loop
  // -------------------------------------------------------------------------

  useLayoutEffect(() => {
    const loop = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      const sState = scrollState.current;
      const system = springSystem.current;

      // User Interaction Check
      const timeSinceInteraction = now - sState.lastInteractionTime;
      const isUserInteracting =
        sState.isDragging || timeSinceInteraction < RESUME_DELAY_MS;

      if (isUserInteracting !== sState.visualState) {
        sState.visualState = isUserInteracting;
      }

      // --- Calculate Target Scroll Position ---
      let rawTargetScrollY = 0;

      if (activeIndex !== -1) {
        const activeEl = lineRefs.current.get(activeIndex);
        const containerH =
          containerRef.current?.clientHeight || window.innerHeight * 0.6;

        if (activeEl) {
          // We want active element ~20% down the screen
          const desiredPos = containerH * 0.2;
          rawTargetScrollY = activeEl.offsetTop - desiredPos;
        }
      }

      // --- Physics Step ---
      let finalScrollY = 0;

      if (isUserInteracting) {
        // When dragging, we rely entirely on the local spring system to track the finger
        // and handle momentum throw.
        if (!sState.isDragging) {
          // Momentum (Friction)
          if (Math.abs(sState.touchVelocity) > 10) {
            const newY = system.getCurrent("y") + sState.touchVelocity * dt;
            system.setValue("y", newY);
            sState.touchVelocity *= 0.92; // Friction
          }
        }
        finalScrollY = system.getCurrent("y");
      } else {
        // AUTO SCROLL:
        // FIX: Do NOT use the spring system here. 
        // Pass the RAW target directly to LyricLine.
        // LyricLine has its own spring. If we spring here + spring there = double spring (lag).
        finalScrollY = rawTargetScrollY;

        // Sync the background system so if user grabs it, it doesn't jump
        system.setValue("y", rawTargetScrollY);
      }

      // Update Shared State
      // Note: Translation moves UP, so we negate scrollY
      sharedMotionRef.current.targetPosY = -finalScrollY;

      // Calculate Active Point (center of highlight zone) in "Lyrics Content Space"
      // If we are scrolled to 1000px, and the highlight zone is 200px down the screen,
      // the "active point" in the document is at 1200px.
      let activePointBase = finalScrollY;
      if (containerRef.current) {
        activePointBase += containerRef.current.clientHeight * 0.2;
      }
      sharedMotionRef.current.activePoint = activePointBase;

      sharedMotionRef.current.visualState = sState.visualState;

      animationRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current);
  }, [lyrics, activeIndex, isMobile]);

  useEffect(() => {
    motionPlansRef.current = lyrics.map(
      (_, idx) =>
        motionPlansRef.current[idx] ?? {
          version: 0,
          relativeIndex: 0,
        }
    );
    setPlanVersion((v) => v + 1);
  }, [lyrics.length]);

  useEffect(() => {
    if (activeIndex === -1) return;
    motionPlansRef.current = lyrics.map((_, idx) => {
      const previous =
        motionPlansRef.current[idx] ?? {
          version: 0,
          relativeIndex: 0,
        };
      const relativeIndex = idx - activeIndex;
      const descriptor = createImpulseDescriptor(relativeIndex);
      return {
        version: previous.version + 1,
        relativeIndex,
        impulse: descriptor
          ? { ...descriptor, id: ++impulseCounterRef.current }
          : undefined,
      };
    });
    setPlanVersion((v) => v + 1);
  }, [activeIndex, lyrics]);


  // -------------------------------------------------------------------------
  // Interaction Handlers
  // -------------------------------------------------------------------------

  const handleTouchStart = (e: React.TouchEvent) => {
    scrollState.current.isDragging = true;
    scrollState.current.lastInteractionTime = performance.now();
    const touchY = e.touches[0].clientY;
    scrollState.current.touchStartY = touchY;
    scrollState.current.touchLastY = touchY;
    scrollState.current.touchVelocity = 0;

    // Important: Sync system to current visual position before taking over
    // But since we bypass system in auto-mode, we might need to read where we are?
    // Actually, the loop updates system.setValue('y', raw) constantly in auto mode, 
    // so it's ready to be grabbed.
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentY = e.touches[0].clientY;
    const dy = scrollState.current.touchLastY - currentY; // delta scroll

    // Simple bounds check logic could go here, but springs handle it gracefully usually
    const system = springSystem.current;
    const newY = system.getCurrent("y") + dy;
    system.setValue("y", newY);

    scrollState.current.touchLastY = currentY;
    scrollState.current.touchVelocity = dy * 60; // Simple velocity
    scrollState.current.lastInteractionTime = performance.now();
  };

  const handleTouchEnd = () => {
    scrollState.current.isDragging = false;
    scrollState.current.lastInteractionTime = performance.now();
  };

  const handleWheel = (e: React.WheelEvent) => {
    scrollState.current.lastInteractionTime = performance.now();
    const dy = e.deltaY;
    const system = springSystem.current;
    const newY = system.getCurrent("y") + dy;
    system.setValue("y", newY);
  };

  const registerLineRef = useCallback(
    (index: number, node: HTMLDivElement | null) => {
      if (node) {
        lineRefs.current.set(index, node);
      } else {
        lineRefs.current.delete(index);
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!lyrics.length) {
    return (
      <div className="h-[85vh] lg:h-[60vh] flex flex-col items-center justify-center text-white/40 select-none">
        {matchStatus === "matching" ? (
          <div className="animate-pulse">Syncing Lyrics...</div>
        ) : (
          <>
            <div className="text-4xl mb-4 opacity-50">♪</div>
            <div>Play music to view lyrics</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative h-[95vh] ${hasTranslation ? "lg:h-[75vh]" : "lg:h-[65vh]"
        } w-full overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none`}
      style={{
        maskImage: hasTranslation
          ? "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)"
          : "linear-gradient(to bottom, transparent 0%, black 40%, black 50%, transparent 100%)",
        WebkitMaskImage: hasTranslation
          ? "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)"
          : "linear-gradient(to bottom, transparent 0%, black 40%, black 50%, transparent 100%)",
      }}
    >
      <div
        ref={contentRef}
        className="absolute top-0 left-0 w-full px-4 md:pl-12 md:pr-12 will-change-transform"
        style={{ paddingTop: "35vh", paddingBottom: "40vh" }}
      >
        {lyrics.map((line, i) => {
          return (
            <LyricLine
              key={i}
              index={i}
              line={line}
              isActive={i === activeIndex}
              onLineClick={(t) => onSeekRequest(t, true)}
              audioRef={audioRef}
              isMobile={isMobile}
              sharedMotion={sharedMotionRef}
              motionPlanRef={motionPlansRef}
              planVersion={planVersion}
              registerLineRef={registerLineRef}
            />
          );
        })}
      </div>
    </div>
  );
};

export default LyricsView;
