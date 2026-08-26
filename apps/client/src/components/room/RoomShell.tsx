"use client";

import { SOCIAL_LINKS } from "@/constants";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useGlobalStore } from "@/store/global";
import { motion } from "motion/react";
import { useState } from "react";
import { FaDiscord, FaGithub } from "react-icons/fa";
import { SyncProgress } from "../ui/SyncProgress";
import { AddMusicPanel } from "./AddMusicPanel";
import { Card } from "./Card";
import { DevicesPanel } from "./DevicesPanel";
import { NowPlaying } from "./NowPlaying";
import { QueuePanel } from "./QueuePanel";
import { RoomHeader } from "./RoomHeader";
import { Sheet } from "./Sheet";
import { SyncPanel } from "./SyncPanel";

interface RoomShellProps {
  roomId: string;
}

// Devices (the spatial map) and Sync (diagnostics) aren't part of the base
// room screen — they're reached via the header nav and open as a panel on
// top of it, on every screen size, rather than living as a permanent third
// column. Add music only gets its own sheet on mobile; on desktop it's a
// persistent rail, same as the design.
type NavPanel = "add-music" | "devices" | "sync" | null;

export const RoomShell = ({ roomId }: RoomShellProps) => {
  const isSynced = useGlobalStore((s) => s.isSynced);
  const isLoadingAudio = useGlobalStore((s) => s.isInitingSystem);
  const hasUserStartedSystem = useGlobalStore((s) => s.hasUserStartedSystem);
  const isDesktop = useIsDesktop();
  const [navPanel, setNavPanel] = useState<NavPanel>(null);

  const isReady = isSynced && !isLoadingAudio;
  // Loading gate before the room mounts, and the mid-session resync overlay
  // if the room ever loses sync after the user has already started —
  // matches the original Dashboard.tsx gating exactly.
  const showSyncProgress = isLoadingAudio || (!isSynced && hasUserStartedSystem);

  if (showSyncProgress) {
    return <SyncProgress />;
  }

  if (!isReady) return null;

  return (
    <motion.div
      className="h-screen w-full bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {isDesktop ? (
        <div className="mx-auto flex h-full max-w-[900px] flex-col gap-5 p-6">
          <RoomHeader
            roomCode={roomId}
            onOpenDevices={() => setNavPanel("devices")}
            onOpenSync={() => setNavPanel("sync")}
          />
          <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-5">
            <Card className="scrollbar-thin overflow-y-auto">
              <AddMusicPanel />
            </Card>
            <div className="flex min-h-0 flex-col gap-4">
              <NowPlaying />
              <Card className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                <QueuePanel />
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex h-full max-w-[520px] flex-col">
          <div className="flex-shrink-0 border-b border-border px-4 py-3">
            <RoomHeader
              roomCode={roomId}
              onOpenDevices={() => setNavPanel("devices")}
              onOpenSync={() => setNavPanel("sync")}
            />
          </div>
          <div className="scrollbar-thin flex flex-1 flex-col gap-5 overflow-y-auto p-4">
            <NowPlaying />
            <button
              onClick={() => setNavPanel("add-music")}
              className="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-dashed border-border bg-card text-sm font-medium text-muted-foreground"
            >
              + Add music
            </button>
            <QueuePanel />
          </div>

          <Sheet
            open={navPanel === "add-music"}
            onClose={() => setNavPanel(null)}
            title="Add music"
          >
            <AddMusicPanel />
          </Sheet>
        </div>
      )}

      {/* Devices and Sync: the same nav-triggered panel on every screen size */}
      <Sheet
        open={navPanel === "devices"}
        onClose={() => setNavPanel(null)}
        title="Devices in room"
      >
        <DevicesPanel />
        <div className="mt-4 flex items-center justify-center gap-5 border-t border-border pt-4">
          <a
            href={SOCIAL_LINKS.discord}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            <FaDiscord className="size-[18px]" />
          </a>
          <a
            href={SOCIAL_LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            <FaGithub className="size-4" />
          </a>
        </div>
      </Sheet>

      <Sheet
        open={navPanel === "sync"}
        onClose={() => setNavPanel(null)}
        title="Sync measurement"
      >
        <SyncPanel />
      </Sheet>
    </motion.div>
  );
};
