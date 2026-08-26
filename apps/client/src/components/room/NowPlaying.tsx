"use client";
/* eslint-disable @next/next/no-img-element */

import { useCanControlPlayback } from "@/hooks/useCanControlPlayback";
import { cn, formatTime } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { Music, Pause, Play, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useState } from "react";
import { Card } from "./Card";
import { Slider } from "../ui/slider";

/**
 * Hero now-playing card. Resolves the displayed track from the Web Audio/R2
 * path first (selectedAudioUrl -> audioSources), falling back to the Spotify
 * SDK path (currentTrack) only when nothing is selected — see plan Phase 3.
 */
export const NowPlaying = () => {
  const posthog = usePostHog();
  const isPlaying = useGlobalStore((s) => s.isPlaying);
  const togglePlayPause = useGlobalStore((s) => s.togglePlayPause);
  const playNextTrack = useGlobalStore((s) => s.playNextTrack);
  const playPreviousTrack = useGlobalStore((s) => s.playPreviousTrack);
  const isShuffled = useGlobalStore((s) => s.isShuffled);
  const setShuffle = useGlobalStore((s) => s.setShuffle);
  const broadcastPlay = useGlobalStore((s) => s.broadcastPlay);
  const getCurrentTrackPosition = useGlobalStore((s) => s.getCurrentTrackPosition);
  const selectedAudioUrl = useGlobalStore((s) => s.selectedAudioUrl);
  const audioSources = useGlobalStore((s) => s.audioSources);
  const duration = useGlobalStore((s) => s.duration);
  const currentTrack = useGlobalStore((s) => s.currentTrack);
  const lastDriftMs = useGlobalStore((s) => s.lastDriftMs);
  const canControlPlayback = useCanControlPlayback();

  const webAudioSource = audioSources.find((s) => s.url === selectedAudioUrl);
  const hasWebAudioSelection = selectedAudioUrl !== "";

  const title = hasWebAudioSelection
    ? webAudioSource?.title ??
      decodeURIComponent(
        (webAudioSource?.url ?? selectedAudioUrl).split("/").pop() ?? selectedAudioUrl
      )
    : (currentTrack?.name ?? "Nothing playing");
  const artist = hasWebAudioSelection
    ? webAudioSource?.artist
    : currentTrack?.artists?.map((a) => a.name).join(", ");
  const artworkUrl = hasWebAudioSelection
    ? webAudioSource?.artworkUrl
    : currentTrack?.album?.images?.[0]?.url;
  const needsAudio = hasWebAudioSelection ? selectedAudioUrl.startsWith("spotify:") : false;
  const hasTrack = hasWebAudioSelection || currentTrack !== null;
  const isOutOfSync = Math.abs(lastDriftMs) > 75;

  const [sliderPosition, setSliderPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setTrackDuration(duration);
  }, [duration]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      if (!isDragging) setSliderPosition(getCurrentTrackPosition());
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, isDragging, getCurrentTrackPosition]);

  const handleSliderChange = useCallback((value: number[]) => {
    setIsDragging(true);
    setSliderPosition(value[0]);
  }, []);

  const handleSliderCommit = useCallback(
    (value: number[]) => {
      const newPosition = value[0];
      setIsDragging(false);
      if (!canControlPlayback) return;
      if (webAudioSource && isPlaying) {
        broadcastPlay(newPosition);
      }
      setSliderPosition(newPosition);
      posthog.capture("scrub_confirm", {
        position: newPosition,
        track_id: webAudioSource?.url,
        track_duration: trackDuration,
      });
    },
    [posthog, webAudioSource, trackDuration, canControlPlayback, isPlaying, broadcastPlay]
  );

  const handlePlay = useCallback(() => {
    if (!canControlPlayback) return;
    togglePlayPause();
    posthog.capture(isPlaying ? "pause_track" : "play_track");
  }, [togglePlayPause, isPlaying, posthog, canControlPlayback]);

  const handleSkipBack = useCallback(() => {
    if (!canControlPlayback) return;
    playPreviousTrack();
  }, [playPreviousTrack, canControlPlayback]);

  const handleSkipForward = useCallback(() => {
    if (!canControlPlayback) return;
    playNextTrack();
    posthog.capture("skip_next");
  }, [playNextTrack, posthog, canControlPlayback]);

  const handleToggleShuffle = useCallback(() => {
    if (!canControlPlayback) return;
    const enabled = !isShuffled;
    setShuffle(enabled);
    posthog.capture("set_shuffle", { shuffle_enabled: enabled });
  }, [setShuffle, isShuffled, posthog, canControlPlayback]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target as HTMLElement).isContentEditable
        )
      ) {
        e.preventDefault();
        handlePlay();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePlay]);

  return (
    <Card>
      <div className="flex items-center gap-3.5">
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt={title}
            className="size-14 flex-shrink-0 rounded-[10px] object-cover"
          />
        ) : (
          <div className="flex size-14 flex-shrink-0 items-center justify-center rounded-[10px] bg-accent">
            <Music className="size-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-semibold">{title}</div>
          {artist && <div className="truncate text-[13px] text-muted-foreground">{artist}</div>}
        </div>
      </div>

      {!hasTrack ? null : needsAudio ? (
        <div className="flex items-center gap-2 rounded-[10px] bg-warn-bg px-3 py-2.5 text-xs text-warn">
          <div className="size-1.5 flex-shrink-0 rounded-full bg-warn" />
          <span>
            Needs audio — send the file to the Telegram bot to make this track playable in
            sync.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="min-w-[34px] font-mono text-[11px] text-muted-foreground">
              {formatTime(sliderPosition)}
            </span>
            <Slider
              value={[sliderPosition]}
              min={0}
              max={trackDuration || 1}
              step={0.1}
              onValueChange={handleSliderChange}
              onValueCommit={handleSliderCommit}
              disabled={!canControlPlayback}
              className="flex-1"
            />
            <span className="min-w-[34px] text-right font-mono text-[11px] text-muted-foreground">
              {formatTime(trackDuration)}
            </span>
          </div>
          <div className="flex items-center justify-center gap-5">
            <button
              onClick={handleToggleShuffle}
              disabled={!canControlPlayback}
              className={cn(
                "flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50",
                isShuffled && "text-primary"
              )}
              aria-label="Toggle shuffle"
              title={isShuffled ? "Shuffle on" : "Shuffle off"}
            >
              <Shuffle className="size-4" />
            </button>
            <button
              onClick={handleSkipBack}
              disabled={!webAudioSource || !canControlPlayback}
              className="flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              aria-label="Previous track"
            >
              <SkipBack className="size-[18px] fill-current" />
            </button>
            <button
              onClick={handlePlay}
              disabled={!canControlPlayback}
              className="flex size-12 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105 disabled:opacity-50"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="size-5 fill-current" />
              ) : (
                <Play className="ml-0.5 size-5 fill-current" />
              )}
            </button>
            <button
              onClick={handleSkipForward}
              disabled={!canControlPlayback}
              className="flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              aria-label="Next track"
            >
              <SkipForward className="size-[18px] fill-current" />
            </button>
          </div>
        </div>
      )}

      {isOutOfSync && (
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <div className="size-[5px] animate-pulse rounded-full bg-destructive" />
          <span>Drift detected — resyncing this device</span>
        </div>
      )}
    </Card>
  );
};
