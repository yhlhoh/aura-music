
import React, { useRef, useEffect, useLayoutEffect } from "react";
import { LyricLine as LyricLineType } from "../types";
import { SpringSystem, SpringConfig, PAST_SPRING, ACTIVE_SPRING } from "../services/springSystem";


// Matrix3d for Scale 1 (No scaling) and TranslateY -2px
// column-major: sx, 0, 0, 0,  0, sy, 0, 0,  0, 0, 1, 0,  tx, ty, tz, 1
const GLOW_STYLE = "0 0 15px rgba(255,255,255,0.8)";

export interface LineImpulsePlan {
  id: number;
  offset: number;
  delay: number;
  config: SpringConfig;
}

export interface LineMotionPlan {
  version: number;
  relativeIndex: number;
  impulse?: LineImpulsePlan;
}

export interface SharedMotionState {
  targetPosY: number;
  activePoint: number;
  visualState: boolean;
  isMobile: boolean;
}

interface PendingImpulse {
  delay: number;
  elapsed: number;
  offset: number;
  config: SpringConfig;
  started: boolean;
}

interface LyricLineProps {
  index: number;
  line: LyricLineType;
  isActive: boolean;
  onLineClick: (time: number) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  isMobile: boolean;
  sharedMotion: React.MutableRefObject<SharedMotionState>;
  motionPlanRef: React.MutableRefObject<LineMotionPlan[]>;
  planVersion: number;
  registerLineRef: (index: number, node: HTMLDivElement | null) => void;
}

const getLinePosSpring = (relativeIndex: number): SpringConfig => {
  // 1. Past Lines: Throw them out quickly
  if (relativeIndex < 0) {
    return PAST_SPRING;
  }
  // 2. Active Line: Snappy arrival
  if (relativeIndex === 0) {
    return ACTIVE_SPRING;
  }
  // 3. Future Lines (Unified Block Movement):
  // We use a slightly LESS stiffness than Active line.
  // This creates the "stretch" effect: The active line moves to destination FASTER 
  // than the future block, causing the gap to widen momentarily, then the future block catches up.
  // All future lines (1, 2, 3...) must share this exact config to move as a solid block.
  return { mass: 1, stiffness: 100, damping: 22, precision: 0.1 };
};

const LyricLine = React.memo(({
  index,
  line,
  isActive,
  onLineClick,
  audioRef,
  isMobile,
  sharedMotion,
  motionPlanRef,
  planVersion,
  registerLineRef,
}: LyricLineProps) => {
  const divRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const springSystem = useRef(new SpringSystem({ scale: 1, posY: 0 })).current;
  const transitionSpring = useRef(new SpringSystem({ shift: 0 })).current;
  const planLocalVersionRef = useRef(0);
  const relativeIndexRef = useRef(0);
  const impulseScheduleRef = useRef<PendingImpulse | null>(null);

  wordsRef.current = wordsRef.current.slice(0, line.words?.length || 0);

  useEffect(() => {
    registerLineRef(index, divRef.current);
    return () => registerLineRef(index, null);
  }, [index, registerLineRef]);

  useEffect(() => {
    const plan = motionPlanRef.current[index];
    if (!plan) return;
    if (plan.version === planLocalVersionRef.current) return;
    planLocalVersionRef.current = plan.version;
    relativeIndexRef.current = plan.relativeIndex;

    if (plan.impulse) {
      impulseScheduleRef.current = {
        delay: plan.impulse.delay,
        elapsed: 0,
        offset: plan.impulse.offset,
        config: plan.impulse.config,
        started: false,
      };
      if (plan.impulse.delay === 0) {
        transitionSpring.setValue("shift", plan.impulse.offset);
        transitionSpring.setTarget("shift", 0, plan.impulse.config);
        impulseScheduleRef.current.started = true;
      }
    } else {
      impulseScheduleRef.current = null;
      transitionSpring.setTarget("shift", 0, {
        mass: 1,
        stiffness: 120,
        damping: 26,
        precision: 0.25,
      });
    }
  }, [planVersion, motionPlanRef, index, transitionSpring]);

  useLayoutEffect(() => {
    let frame = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const metrics = sharedMotion.current;

      // 1. Apply Position Physics
      const config = getLinePosSpring(relativeIndexRef.current);

      // If visualState is true (user dragging), we want a stiff, responsive spring (1:1 feel)
      // If auto-scrolling, we use the varying physics (active vs future)
      if (metrics.visualState) {
        springSystem.setTarget("posY", metrics.targetPosY, { mass: 0.5, stiffness: 400, damping: 35 });
      } else {
        springSystem.setTarget("posY", metrics.targetPosY, config);
      }

      // 2. Calculate Scale based on distance from "Active Point"
      // Since we pass the "Raw Target" to posY spring, we must use the current SPRING value 
      // to calculate the scale, otherwise the scale will jump before the line arrives.
      // We compare the line's current sprung position to the ideal center of screen.

      let normDist = 1;
      let targetScale = 0.9;

      if (divRef.current) {
        // Where is the line currently physically located relative to the scroll container top?
        // The springSystem.getCurrent("posY") is the Translation Y. 
        // The lyrics container moves UP.
        // We need to find where this line is relative to the "Active Point" (which is a coordinate in the document)

        const lineTop = divRef.current.offsetTop;
        // We approximate the current visual position:
        // visualY = lineTop + springSystem.posY
        // But wait, springSystem.posY tracks the GLOBAL scroll offset (negative value).
        // So visualY = lineTop + currentScrollY.

        const currentScrollY = springSystem.getCurrent("posY");
        const lineCenter = lineTop + (divRef.current.offsetHeight / 2);

        // The "activePoint" passed from parent is: targetScrollY + viewHeight*0.2
        // This is the point in the document that should be highlighted.
        // But we want to highlight based on where the line IS, not where it SHOULD be.

        // Let's look at the delta:
        // activePoint is essentially "The document coordinate that should be at the visual focus point".
        // So if lineCenter matches activePoint, it is active.
        // Since we are animating `posY` slowly, we should use the target `activePoint`?
        // No, if we use target `activePoint`, the scale animates before the position.
        // We want scale to animate WITH position.

        const dist = Math.abs(lineCenter - metrics.activePoint);

        // Scale Logic
        const range = 350;
        normDist = Math.min(dist, range) / range; // 0 to 1

        if (isActive) {
          targetScale = 1.05; // Subtle pop
        } else {
          targetScale = 1.0 - (0.15 * Math.pow(normDist, 0.5));
        }

        springSystem.setTarget("scale", targetScale, { mass: 1, stiffness: 100, damping: 20 });
      }

      // 3. Impulse (Beat) Physics
      const schedule = impulseScheduleRef.current;
      if (schedule) {
        schedule.elapsed += dt * 1000;
        if (!schedule.started && schedule.elapsed >= schedule.delay) {
          transitionSpring.setValue("shift", schedule.offset);
          transitionSpring.setTarget("shift", 0, schedule.config);
          schedule.started = true;
        }
        if (
          schedule.started &&
          Math.abs(transitionSpring.getCurrent("shift")) < 0.3
        ) {
          impulseScheduleRef.current = null;
        }
      }

      springSystem.update(dt);
      transitionSpring.update(dt);

      // 4. Render
      if (divRef.current) {
        const currentScale = springSystem.getCurrent("scale");
        const currentPosY = springSystem.getCurrent("posY");
        const shiftOffset = transitionSpring.getCurrent("shift");

        // Opacity Logic
        const minOpacity = metrics.visualState ? 0.4 : 0.15;
        const opacityCurve = 1.0 - Math.pow(normDist, 0.6);
        let finalOpacity = minOpacity + (1 - minOpacity) * opacityCurve;

        if (isActive) finalOpacity = 1;

        // Blur Logic
        const blur = metrics.isMobile
          ? 0
          : metrics.visualState
            ? 0
            : isActive ? 0 : 1 + (2 * normDist);

        divRef.current.style.transform = `translate3d(0, ${currentPosY + shiftOffset}px, 0) scale(${currentScale})`;
        divRef.current.style.opacity = finalOpacity.toFixed(3);
        divRef.current.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "none";
      }

      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame((now) => {
      last = now;
      loop(now);
    });
    return () => cancelAnimationFrame(frame);
  }, [sharedMotion, springSystem, transitionSpring, isActive]);

  useEffect(() => {
    const updateWordStyles = () => {
      if (!audioRef.current) return;
      const currentTime = audioRef.current.currentTime;

      if (line.words && line.words.length > 0) {
        line.words.forEach((word, i) => {
          const span = wordsRef.current[i];
          if (!span) return;

          // Base classes
          const baseClass = `word-base whitespace-pre`;

          if (!isActive) {
            span.className = baseClass;
            span.style.backgroundImage = "";
            span.style.webkitBackgroundClip = "";
            span.style.backgroundClip = "";
            span.style.webkitTextFillColor = "";
            span.style.color = "";
            span.style.transform = "";
            span.style.textShadow = "";
            return;
          }

          const duration = word.endTime - word.startTime;
          const elapsed = currentTime - word.startTime;

          if (currentTime < word.startTime) {
            // --- FUTURE WORD ---
            span.className = `${baseClass} word-future`;
            span.style.backgroundImage = "";
            span.style.webkitBackgroundClip = "";
            span.style.backgroundClip = "";
            span.style.webkitTextFillColor = "";
            span.style.color = "";
            // Reset transform explicitly for animation to work
            span.style.transform = "translate3d(0,0,0) scale(1)";
            span.style.textShadow = "";
          } else if (currentTime > word.endTime) {
            // --- PAST WORD ---
            span.className = `${baseClass} word-past`;
            span.style.backgroundImage = "";
            span.style.webkitBackgroundClip = "";
            span.style.backgroundClip = "";
            span.style.webkitTextFillColor = "";
            span.style.color = ""; // Handled by CSS class (white)

            // Past words stay floated (no scale)
            span.style.transform = "translate3d(0,-4px,0) scale(1)";
            span.style.textShadow = "";
          } else {
            // --- CURRENT WORD (Karaoke) ---
            span.className = `${baseClass}`;

            // 1. Gradient Fill (X-Moving Highlight)
            const p = Math.max(0, Math.min(1, elapsed / duration));
            const percentage = (p * 100).toFixed(1);

            span.style.backgroundImage = `linear-gradient(90deg, #FFFFFF ${percentage}%, rgba(255,255,255,0.5) ${percentage}%)`;
            span.style.webkitBackgroundClip = "text";
            span.style.backgroundClip = "text";
            span.style.webkitTextFillColor = "transparent";
            span.style.color = "transparent";

            // 2. Float Animation (Skew Lift)
            const lift = -4 * p; // Linear lift target
            const maxSkew = 1; // degrees
            const currentSkew = maxSkew * (1 - p); // 10deg -> 0deg

            span.style.transformOrigin = "left baseline";
            span.style.transform = `translate3d(0,${lift}px,0) skewY(${currentSkew}deg) scale(1)`;

            // 3. Conditional Glow
            const isLongNote = duration > 1;
            const isShortWord = word.text.trim().length < 7;
            const shouldGlow = isLongNote && isShortWord;

            span.style.textShadow = shouldGlow ? GLOW_STYLE : "";
          }
        });
      }
    };

    if (isActive) {
      const loop = () => {
        updateWordStyles();
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } else {
      updateWordStyles();
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, line, audioRef, isMobile]);

  const textSizeClass = isMobile
    ? "text-3xl md:text-3xl lg:text-4xl"
    : "text-3xl md:text-4xl lg:text-5xl";

  return (
    <div
      ref={divRef}
      onClick={() => onLineClick(line.time)}
      className={`
                  py-4 rounded-2xl cursor-pointer mr-6 px-6
                  origin-left
                  transition-colors duration-200
                  hover:bg-white/10
                  ${isActive ? "line-active" : "line-inactive"}
              `}
      style={{
        willChange: "transform, opacity, filter",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
      }}
    >
      <style>{`
                  .word-base {
                      display: inline-block;
                      /* Removed 'color' from transition to prevent flickering during gradient switch */
                      transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
                                  text-shadow 0.5s ease;
                      will-change: transform, opacity;
                      transform-origin: left baseline;
                      /* Prevent text clipping for descenders/ascenders */
                      padding: 4px 0;
                      margin: -2px 0;
                      overflow: visible;
                  }
  
                  /* ACTIVE LINE Context */
                  .line-active .word-past {
                      color: #fff;
                      opacity: 1;
                  }
  
                  .line-active .word-future {
                      color: rgba(255,255,255,0.5);
                      opacity: 1;
                  }
  
                  /* INACTIVE LINE Context */
                  .line-inactive .word-base {
                      color: inherit;
                      opacity: 1;
                      transform: translate3d(0,0,0) scale(1) !important;
                      text-shadow: none !important;
                  }
              `}</style>

      <div
        className={`${textSizeClass} font-semibold leading-normal text-white tracking-wide`}
      >
        {line.words && line.words.length > 0 ? (
          line.words.map((word, i) => (
            <span
              key={i}
              ref={(el) => {
                wordsRef.current[i] = el;
              }}
              className={`word-base whitespace-pre`}
            >
              {word.text}
            </span>
          ))
        ) : (
          <span className="transition-all whitespace-pre-wrap break-words duration-[300ms] mr-2.5 tracking-wide">
            {line.text}
          </span>
        )}
      </div>
      {line.translation && (
        <div className="mt-2 text-lg md:text-xl font-medium text-white/60">
          {line.translation}
        </div>
      )}
    </div>
  );
});

export default LyricLine;
