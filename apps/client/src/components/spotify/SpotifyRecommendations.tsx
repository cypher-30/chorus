"use client";
import { useEffect, useState } from "react";
import { useGlobalStore } from "@/store/global";

export function SpotifyRecommendations() {
  const currentTrack = useGlobalStore((s) => s.currentTrack);
  const previousTracks = useGlobalStore((s) => s.previousTracks) as any[] | undefined;
  const addToQueue = useGlobalStore((s) => s.addToQueue);
  const [recs, setRecs] = useState<any[]>([]);

  useEffect(() => {
    const seed = currentTrack?.uri?.split(":").pop() || previousTracks?.slice(-1)[0]?.uri?.split(":").pop();
    if (!seed) return;
    fetch(`/api/spotify/recommendations?seed_tracks=${encodeURIComponent(seed)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setRecs(d.tracks || []))
      .catch(() => setRecs([]));
  }, [currentTrack?.uri, previousTracks?.length]);

  if (recs.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs text-neutral-400">Recommended</div>
      <div className="space-y-1">
        {recs.map((t) => (
          <button
            key={t.id}
            className="w-full text-left text-xs text-neutral-300 hover:text-white flex items-center gap-2"
            onClick={() => addToQueue({
              uri: t.uri,
              name: t.name,
              artists: t.artists?.map((a: any) => ({ name: a.name })) ?? [],
              album: { images: t.album?.images?.map((img: any) => ({ url: img.url })) ?? [] },
            })}
          >
            {t.album?.images?.[2]?.url && <img src={t.album.images[2].url} className="w-6 h-6" />}
            <span className="truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

