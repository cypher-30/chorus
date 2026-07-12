/* eslint-disable @next/next/no-img-element */
import { useCanControlPlayback } from "@/hooks/useCanControlPlayback";
import { cn, formatTime } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useState } from "react";
import { Slider } from "../ui/slider";

export const Player = () => {
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
  const canControlPlayback = useCanControlPlayback();

  // The room's current synced track (Web Audio path)
  const currentSource = audioSources.find((s) => s.url === selectedAudioUrl);

  // Local state for slider
  const [sliderPosition, setSliderPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    setTrackDuration(duration);
  }, [duration]);

  // Update slider position during playback
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (!isDragging) {
        setSliderPosition(getCurrentTrackPosition());
      }
    }, 100); // Update every 100ms

    return () => clearInterval(interval);
  }, [isPlaying, isDragging, getCurrentTrackPosition]);

  // Handle slider change
  const handleSliderChange = useCallback((value: number[]) => {
    const position = value[0];
    setIsDragging(true);
    setSliderPosition(position);
  }, []);

  // Handle slider release - seek to that position
  const handleSliderCommit = useCallback(
    (value: number[]) => {
      const newPosition = value[0];
      setIsDragging(false);
      if (!canControlPlayback) return;

      if (currentSource && isPlaying) {
        // Synced seek: broadcast a PLAY at the new position so every device
        // in the room jumps together
        broadcastPlay(newPosition);
      }
      setSliderPosition(newPosition);

      // Log scrub event
      posthog.capture("scrub_confirm", {
        position: newPosition,
        track_id: currentSource?.url,
        track_duration: trackDuration,
      });
    },
    [
      setSliderPosition,
      posthog,
      currentSource,
      trackDuration,
      canControlPlayback,
      isPlaying,
      broadcastPlay,
    ]
  );

  const handlePlay = useCallback(() => {
    if (!canControlPlayback) return;
    togglePlayPause();
    posthog.capture(isPlaying ? 'pause_track' : 'play_track');
  }, [togglePlayPause, isPlaying, posthog, canControlPlayback]);

  const handleSkipBack = useCallback(() => {
    if (!canControlPlayback) return;
    playPreviousTrack();
  }, [playPreviousTrack, canControlPlayback]);

  const handleSkipForward = useCallback(() => {
    if (!canControlPlayback) return;
    playNextTrack();
    posthog.capture('skip_next');
  }, [playNextTrack, posthog, canControlPlayback]);

  const handleShuffleChange = useCallback((value: string) => {
    if (!canControlPlayback) return;
    const enabled = value === 'on';
    setShuffle(enabled);
    posthog.capture("set_shuffle", { shuffle_enabled: enabled });
  }, [setShuffle, posthog, canControlPlayback]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if space is pressed and we're not in an input field
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
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handlePlay]);

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-[37rem]">
        {currentSource && (
          <div className="flex items-center gap-3 mb-2">
            {currentSource.artworkUrl && (
              <img
                src={currentSource.artworkUrl}
                className="w-10 h-10"
                alt={currentSource.title ?? "Now playing"}
              />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">
                {currentSource.title ??
                  decodeURIComponent(
                    currentSource.url.split("/").pop() ?? currentSource.url
                  )}
              </div>
              {currentSource.artist && (
                <div className="text-xs text-neutral-400 truncate">
                  {currentSource.artist}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center justify-center gap-6 mb-2">
          <div className="flex items-center gap-1 text-xs text-neutral-400">
            <Shuffle className={cn("size-4", isShuffled ? "text-primary-400" : "text-current")} />
            <select
              className="bg-neutral-800 text-xs px-2 py-1 rounded border border-neutral-700 disabled:opacity-50"
              value={isShuffled ? 'on' : 'off'}
              onChange={(e) => handleShuffleChange(e.target.value)}
              disabled={!canControlPlayback}
            >
              <option value="off">Off</option>
              <option value="on">Shuffle</option>
            </select>
          </div>
          <button
            className="text-gray-400 hover:text-white transition-colors cursor-pointer hover:scale-105 duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSkipBack}
            disabled={!currentSource || !canControlPlayback}
          >
            <SkipBack className="w-7 h-7 md:w-5 md:h-5 fill-current" />
          </button>
          <button
            className="bg-white text-black rounded-full p-3 md:p-2 hover:scale-105 transition-transform cursor-pointer duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handlePlay}
            disabled={!canControlPlayback}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 md:w-4 md:h-4 fill-current stroke-1" />
            ) : (
              <Play className="w-5 h-5 md:w-4 md:h-4 fill-current" />
            )}
          </button>
          <button
            className="text-gray-400 hover:text-white transition-colors cursor-pointer hover:scale-105 duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSkipForward}
            disabled={!canControlPlayback}
          >
            <SkipForward className="w-7 h-7 md:w-5 md:h-5 fill-current" />
          </button>
          <button className="text-gray-400 hover:text-white transition-colors cursor-default   hover:scale-105 duration-200">
            <div className="relative">
              <Repeat className="w-4 h-4 relative text-primary-400" />
              <div className="absolute w-1 h-1 bg-green-500 rounded-full bottom-0 top-4.5 left-1/2 transform -translate-x-1/2 translate-y-1/2"></div>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-0">
          <span className="text-xs text-muted-foreground min-w-11 select-none">
            {formatTime(sliderPosition)}
          </span>
          <Slider
            value={[sliderPosition]}
            min={0}
            max={trackDuration}
            step={0.1}
            onValueChange={handleSliderChange}
            onValueCommit={handleSliderCommit}
            disabled={!canControlPlayback}
          />
          <span className="text-xs text-muted-foreground min-w-11 text-right select-none">
            {formatTime(trackDuration)}
          </span>
        </div>
      </div>
    </div>
  );
};
