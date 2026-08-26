"use client";

import { SOCIAL_LINKS } from "@/constants";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { Crown, Users } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { FaDiscord, FaGithub } from "react-icons/fa";
import { DEVICE_COLORS } from "./SpatialMap";
import { StatusPill } from "./StatusPill";

interface RoomHeaderProps {
  roomCode: string;
  onOpenDevices: () => void;
  onOpenSync: () => void;
}

export const Logo = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" className="flex-shrink-0">
    <circle cx="29" cy="50" r="27" fill="oklch(88% 0.06 350)" />
    <circle cx="50" cy="50" r="27" fill="oklch(68% 0.19 350)" />
    <circle cx="71" cy="50" r="27" fill="oklch(38% 0.13 350)" />
  </svg>
);

export const RoomHeader = ({ roomCode, onOpenDevices, onOpenSync }: RoomHeaderProps) => {
  const userId = useRoomStore((s) => s.userId);
  const clients = useGlobalStore((s) => s.connectedClients);
  const currentUser = clients.find((c) => c.clientId === userId);
  const isAdmin = currentUser?.isAdmin ?? false;

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Room link copied");
  };

  return (
    <div className="flex flex-shrink-0 items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
        </Link>
        {isAdmin && <Crown className="size-3.5 text-warn" fill="currentColor" />}
        <button
          onClick={copyRoomLink}
          title="Copy room link"
          className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 font-mono text-[13px] tracking-wide hover:bg-accent"
        >
          {roomCode}
        </button>
        <StatusPill />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onOpenDevices}
          className="flex items-center gap-1.5 text-foreground"
          aria-label="Devices"
        >
          <div className="flex">
            {clients.slice(0, 3).map((c, i) => (
              <div
                key={c.clientId}
                className="-ml-1.5 flex size-6 items-center justify-center rounded-full border-2 border-background text-[9px] font-semibold text-white first:ml-0"
                style={{ backgroundColor: DEVICE_COLORS[i % DEVICE_COLORS.length] }}
              >
                {c.username.slice(0, 2).toUpperCase()}
              </div>
            ))}
          </div>
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Users className="size-3" />
            {clients.length}
          </span>
        </button>
        <button
          onClick={onOpenSync}
          title="Sync diagnostics"
          className="flex size-7 items-center justify-center rounded-md border border-border bg-secondary font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          Δ
        </button>
        <div className="hidden items-center gap-2.5 md:flex">
          <a
            href={SOCIAL_LINKS.discord}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <FaDiscord className="size-[17px]" />
          </a>
          <a
            href={SOCIAL_LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <FaGithub className="size-4" />
          </a>
        </div>
      </div>
    </div>
  );
};
