"use client";

import { MAX_NTP_MEASUREMENTS, useGlobalStore } from "@/store/global";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { NudgeControls } from "../NudgeControls";
import { TimingDisplay } from "../TimingDisplay";

function calcJitter(measurements: { roundTripDelay: number }[]) {
  if (!measurements || measurements.length < 2) return 0;
  const rtts = measurements.map((m) => m.roundTripDelay);
  const mean = rtts.reduce((a, b) => a + b, 0) / rtts.length;
  const variance = rtts.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (rtts.length - 1);
  return Math.sqrt(variance);
}

/**
 * Sync diagnostics: offset/RTT/drift tiles, NTP measurement ring, manual
 * per-device nudge, and the detailed TimingDisplay behind a disclosure.
 * Replaces dashboard/SyncDebug.tsx (which now folds in TopBar's NTP ring +
 * jitter readout too, so nothing from the old top bar is lost).
 */
export const SyncPanel = () => {
  const isPlaying = useGlobalStore((s) => s.isPlaying);
  const offsetEstimate = useGlobalStore((s) => s.offsetEstimate);
  const roundTripEstimate = useGlobalStore((s) => s.roundTripEstimate);
  const isSynced = useGlobalStore((s) => s.isSynced);
  const totalNudgeMs = useGlobalStore((s) => s.totalNudgeMs);
  const lastDriftMs = useGlobalStore((s) => s.lastDriftMs);
  const nudgeAudio = useGlobalStore((s) => s.nudgeAudio);
  const ntpMeasurements = useGlobalStore((s) => s.ntpMeasurements);
  const getCurrentTrackPosition = useGlobalStore((s) => s.getCurrentTrackPosition);

  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setCurrentTimeMs(getCurrentTrackPosition() * 1000);
    }, 100);
    return () => clearInterval(id);
  }, [isPlaying, getCurrentTrackPosition]);

  const jitter = calcJitter(ntpMeasurements);
  const ntpProgress = ntpMeasurements.length / MAX_NTP_MEASUREMENTS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 16 16" className="flex-shrink-0">
          <circle cx="8" cy="8" r="6" fill="none" stroke="var(--border)" strokeWidth="2" />
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeDasharray={`${ntpProgress * 37.7} 37.7`}
            strokeLinecap="round"
            transform="rotate(-90 8 8)"
          />
        </svg>
        <span className="font-mono text-xs text-muted-foreground">
          {ntpMeasurements.length}/{MAX_NTP_MEASUREMENTS} measurements
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center rounded-lg bg-secondary py-2.5">
          <div className="font-mono text-sm font-medium">
            {isSynced ? offsetEstimate.toFixed(1) : "—"}
          </div>
          <div className="text-[11px] text-muted-foreground">offset ms</div>
        </div>
        <div className="flex flex-col items-center rounded-lg bg-secondary py-2.5">
          <div className="font-mono text-sm font-medium">{roundTripEstimate.toFixed(1)}</div>
          <div className="text-[11px] text-muted-foreground">rtt ms</div>
        </div>
        <div className="flex flex-col items-center rounded-lg bg-secondary py-2.5">
          <div
            className={`font-mono text-sm font-medium ${
              Math.abs(lastDriftMs) > 75 ? "text-destructive" : ""
            }`}
          >
            {lastDriftMs > 0 ? "+" : ""}
            {lastDriftMs.toFixed(1)}
          </div>
          <div className="text-[11px] text-muted-foreground">drift ms</div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Jitter: <span className="font-mono">{jitter.toFixed(2)} ms</span>
      </div>

      <NudgeControls totalNudge={totalNudgeMs} onNudge={nudgeAudio} disabled={!isPlaying} />

      <details className="group rounded-lg bg-secondary">
        <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Details</span>
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col items-center gap-2 px-3 pb-3">
          <TimingDisplay
            currentTime={currentTimeMs}
            isPlaying={isPlaying}
            totalNudge={totalNudgeMs}
            clockOffset={isSynced ? offsetEstimate : null}
          />
        </div>
      </details>
    </div>
  );
};
