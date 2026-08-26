"use client";

import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";

const STALE_MS = 15000;

export type StatusTone = "ok" | "warn" | "error";

export interface RoomStatus {
  tone: StatusTone;
  label: string;
}

/**
 * Derives the room's connection/sync status. Shared by StatusPill (header)
 * and anywhere else that needs the same tone/label (e.g. the sync drawer).
 */
export const useRoomStatus = (): RoomStatus => {
  const socket = useGlobalStore((s) => s.socket);
  const isSynced = useGlobalStore((s) => s.isSynced);
  const isPlaying = useGlobalStore((s) => s.isPlaying);
  const reconnectionInfo = useGlobalStore((s) => s.reconnectionInfo);
  const lastMessageReceivedTime = useGlobalStore((s) => s.lastMessageReceivedTime);
  const lastDriftMs = useGlobalStore((s) => s.lastDriftMs);

  const isStale =
    lastMessageReceivedTime !== null && Date.now() - lastMessageReceivedTime > STALE_MS;

  if (!socket || socket.readyState === WebSocket.CLOSED) {
    return { tone: "error", label: "Disconnected" };
  }
  if (reconnectionInfo.isReconnecting) {
    return { tone: "warn", label: "Reconnecting" };
  }
  if (isStale) {
    return { tone: "warn", label: "Connection stale" };
  }
  if (!isSynced) {
    return { tone: "warn", label: "Syncing clock" };
  }
  if (Math.abs(lastDriftMs) > 75) {
    return { tone: "error", label: "Resyncing" };
  }
  if (isPlaying) {
    return { tone: "ok", label: "Playing · Synced" };
  }
  return { tone: "ok", label: "Ready" };
};

const toneClasses: Record<StatusTone, { dot: string; text: string; bg: string }> = {
  ok: { dot: "bg-primary", text: "text-primary", bg: "bg-primary/15" },
  warn: { dot: "bg-warn", text: "text-warn", bg: "bg-warn-bg" },
  error: { dot: "bg-destructive", text: "text-destructive", bg: "bg-danger-bg" },
};

export const StatusPill = ({ className }: { className?: string }) => {
  const status = useRoomStatus();
  const tone = toneClasses[status.tone];

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1",
        tone.bg,
        className
      )}
    >
      <div
        className={cn(
          "size-1.5 rounded-full",
          tone.dot,
          status.tone !== "ok" && "animate-pulse"
        )}
      />
      <span className={cn("text-xs font-medium", tone.text)}>{status.label}</span>
    </div>
  );
};
