"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { SpotifyTrack, useGlobalStore } from "@/store/global";

export function SpotifyRecommendations() {
  const addToQueue = useGlobalStore((s) => s.addToQueue);
  const [recs, setRecs] = useState<SpotifyTrack[]>([]);

  useEffect(() => {
    fetch("/api/spotify/recommendations")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setRecs(d.tracks || []))
      .catch((e) => {
        console.error("Failed to fetch top tracks:", e);
        setRecs([]);
      });
  }, []);

  if (recs.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Your Top Tracks</div>
      <div className="space-y-1">
        {recs.map((t) => (
          <button
            key={t.uri}
            className="w-full text-left text-xs text-muted-foreground hover:text-foreground flex items-center gap-2"
            onClick={() => addToQueue(t)}
          >
            {t.album?.images?.[2]?.url && <img src={t.album.images[2].url} className="size-6 rounded-sm" alt={t.name} />}
            <span className="truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
