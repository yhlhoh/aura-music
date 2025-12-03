import React, { useEffect } from "react";
import { PlayState, Song } from "../types";

const MEDIA_SESSION_SEEK_STEP = 10;

interface MediaSessionControllerProps {
  currentSong: Song | null;
  playState: PlayState;
  currentTime: number;
  duration: number;
  playbackRate: number;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number, playImmediately?: boolean) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const MediaSessionController: React.FC<MediaSessionControllerProps> = ({
  currentSong,
  playState,
  currentTime,
  duration,
  playbackRate,
  onPlay,
  onPause,
  onNext,
  onPrev,
  onSeek,
}) => {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    const mediaSession = navigator.mediaSession;

    
    if (!currentSong) {
      mediaSession.metadata = null;
      mediaSession.playbackState =
        playState === PlayState.PLAYING ? "playing" : "paused";
      return;
    }

    if (typeof window !== "undefined" && "MediaMetadata" in window) {
      mediaSession.metadata = new window.MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        album: currentSong.album ?? undefined,
        artwork: currentSong.coverUrl
          ? [
              {
                src: currentSong.coverUrl,
                sizes: "512x512",
                type: "image/jpeg",
              },
            ]
          : undefined,
      });
    }

    console.log(mediaSession)


    mediaSession.playbackState =
      playState === PlayState.PLAYING ? "playing" : "paused";

    if (
      typeof mediaSession.setPositionState === "function" &&
      duration > 0 &&
      Number.isFinite(currentTime)
    ) {
      mediaSession.setPositionState({
        duration,
        playbackRate,
        position: clamp(currentTime, 0, duration),
      });
    }
  }, [
    currentSong,
    playState,
    currentTime,
    duration,
    playbackRate,
  ]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    const mediaSession = navigator.mediaSession;

    const clampedSeek = (time: number) => {
      const target = clamp(time, 0, duration || 0);
      onSeek(target, playState === PlayState.PLAYING);
    };

    const seekToHandler = (details?: MediaSessionActionDetails) => {
      if (details && typeof details.seekTime === "number") {
        clampedSeek(details.seekTime);
      }
    };

    const handlers: Array<
      [MediaSessionAction, MediaSessionActionHandler | null]
    > = [
      ["play", onPlay],
      ["pause", onPause],
      ["previoustrack", onPrev],
      ["nexttrack", onNext],
      ["seekto", seekToHandler],
      [
        "seekbackward",
        (details?: MediaSessionActionDetails) => {
          const offset = details?.seekOffset ?? MEDIA_SESSION_SEEK_STEP;
          clampedSeek(currentTime - offset);
        },
      ],
      [
        "seekforward",
        (details?: MediaSessionActionDetails) => {
          const offset = details?.seekOffset ?? MEDIA_SESSION_SEEK_STEP;
          clampedSeek(currentTime + offset);
        },
      ],
    ];

    handlers.forEach(([action, handler]) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch (error) {
        // Some browsers restrict certain actions; ignore failures.
        console.debug(`MediaSession handler registration failed for ${action}`, error);
      }
    });

    return () => {
      handlers.forEach(([action]) => {
        try {
          mediaSession.setActionHandler(action, null);
        } catch {
          // ignore
        }
      });
    };
  }, [
    onPlay,
    onPause,
    onNext,
    onPrev,
    onSeek,
    duration,
    currentTime,
    playState,
  ]);

  return null;
};

export default MediaSessionController;
