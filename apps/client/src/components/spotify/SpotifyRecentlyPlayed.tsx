"use client";
/* eslint-disable @next/next/no-img-element */
import { toast } from "sonner";
import { SpotifyTrack, useGlobalStore } from "@/store/global";

export function SpotifyRecentlyPlayed() {
  const previousTracks: SpotifyTrack[] = useGlobalStore((s) => s.previousTracks) || [];
  const addToQueue = useGlobalStore((s) => s.addToQueue);

  const handleAddTrack = async (track: SpotifyTrack) => {
    const result = await addToQueue(track);
    if (result === "added") {
      toast.success(`Added "${track.name}" to queue (Needs audio)`);
      return;
    }
    if (result === "duplicate") {
      toast.info(`"${track.name}" is already in the queue`);
      return;
    }
    toast.error("Failed to add track to queue");
  };

  if (previousTracks.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Recently Played</div>
    <div className="space-y-1">
        {previousTracks.slice(-10).reverse().map((t, idx) => (
          <button
            key={t.uri + idx}
            className="w-full text-left text-xs text-muted-foreground hover:text-foreground flex items-center gap-2"
            onClick={() => void handleAddTrack(t)}
          >
            {t.album?.images?.[2]?.url && <img src={t.album.images[2].url} className="size-6 rounded-sm" alt={t.name} />}
            <span className="truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
