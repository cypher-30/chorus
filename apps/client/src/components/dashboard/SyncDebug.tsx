"use client";

import { useGlobalStore } from "@/store/global";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { NudgeControls } from "../NudgeControls";
import { TimingDisplay } from "../TimingDisplay";

/**
 * Sync measurement panel: precise timing display for eyeballing sync across
 * devices, drift readout, and manual per-device nudge controls.
 */
export const SyncDebug = () => {
  const isPlaying = useGlobalStore((s) => s.isPlaying);
  const offsetEstimate = useGlobalStore((s) => s.offsetEstimate);
  const isSynced = useGlobalStore((s) => s.isSynced);
  const totalNudgeMs = useGlobalStore((s) => s.totalNudgeMs);
  const lastDriftMs = useGlobalStore((s) => s.lastDriftMs);
  const nudgeAudio = useGlobalStore((s) => s.nudgeAudio);
  const getCurrentTrackPosition = useGlobalStore(
    (s) => s.getCurrentTrackPosition
  );

  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setCurrentTimeMs(getCurrentTrackPosition() * 1000);
    }, 100);
    return () => clearInterval(id);
  }, [isPlaying, getCurrentTrackPosition]);

  return (
    <details className="group mx-3 mb-3 rounded-lg bg-neutral-800/30 text-neutral-300">
      <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-2 text-xs font-medium">
        <span>Sync measurement</span>
        <span className="flex items-center gap-2 font-mono text-neutral-400">
          drift {lastDriftMs > 0 ? "+" : ""}
          {lastDriftMs.toFixed(1)} ms
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="flex flex-col items-center gap-2 px-3 pb-3 text-neutral-900">
        <TimingDisplay
          currentTime={currentTimeMs}
          isPlaying={isPlaying}
          totalNudge={totalNudgeMs}
          clockOffset={isSynced ? offsetEstimate : null}
        />
        <NudgeControls
          totalNudge={totalNudgeMs}
          onNudge={nudgeAudio}
          disabled={!isPlaying}
        />
      </div>
    </details>
  );
};
