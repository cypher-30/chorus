"use client";
/* eslint-disable @next/next/no-img-element */
import { SpotifyTrack, useGlobalStore } from "@/store/global";

export function SpotifyRecentlyPlayed() {
  const previousTracks: SpotifyTrack[] = useGlobalStore((s) => s.previousTracks) || [];
  const addToQueue = useGlobalStore((s) => s.addToQueue);
  if (previousTracks.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs text-neutral-400">Recently Played</div>
    <div className="space-y-1">
        {previousTracks.slice(-10).reverse().map((t, idx) => (
          <button
            key={t.uri + idx}
            className="w-full text-left text-xs text-neutral-300 hover:text-white flex items-center gap-2"
            onClick={() => addToQueue(t)}
          >
            {t.album?.images?.[2]?.url && <img src={t.album.images[2].url} className="w-6 h-6" alt={t.name} />}
            <span className="truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
