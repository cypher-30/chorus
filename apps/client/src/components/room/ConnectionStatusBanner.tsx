"use client";

import { useMemo } from "react";
import { useGlobalStore } from "@/store/global";
import { AlertTriangle, Wifi, WifiOff } from "lucide-react";

const STALE_MS = 15000;

export const ConnectionStatusBanner = () => {
  const socket = useGlobalStore((s) => s.socket);
  const isSynced = useGlobalStore((s) => s.isSynced);
  const reconnectionInfo = useGlobalStore((s) => s.reconnectionInfo);
  const lastMessageReceivedTime = useGlobalStore(
    (s) => s.lastMessageReceivedTime
  );

  const now = Date.now();
  const isStale =
    lastMessageReceivedTime !== null &&
    now - lastMessageReceivedTime > STALE_MS;

  const status = useMemo(() => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      return { tone: "error", text: "Disconnected. Reconnecting..." };
    }
    if (reconnectionInfo.isReconnecting) {
      return {
        tone: "warn",
        text: `Reconnecting... (attempt ${reconnectionInfo.currentAttempt}/${reconnectionInfo.maxAttempts || "∞"})`,
      };
    }
    if (isStale) {
      return { tone: "warn", text: "Connection stale. Refreshing..." };
    }
    if (!isSynced) {
      return { tone: "warn", text: "Syncing clock..." };
    }
    return { tone: "ok", text: "Connected & synced" };
  }, [socket, reconnectionInfo, isStale, isSynced]);

  const show = status.tone !== "ok";

  return (
    <div className="px-4 pt-2">
      <div
        className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
          show ? "bg-yellow-900/40 text-yellow-200" : "bg-green-900/30 text-green-200"
        }`}
      >
        {status.tone === "ok" ? (
          <Wifi className="h-3.5 w-3.5" />
        ) : status.tone === "warn" ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <WifiOff className="h-3.5 w-3.5" />
        )}
        <span>{status.text}</span>
      </div>
    </div>
  );
};
