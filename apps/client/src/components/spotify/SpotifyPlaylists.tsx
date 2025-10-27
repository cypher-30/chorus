"use client";
import { useEffect, useState } from "react";
import { useGlobalStore } from "@/store/global";

export function SpotifyPlaylists() {
  const addToQueue = useGlobalStore((s) => s.addToQueue);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [tracks, setTracks] = useState<Record<string, any[]>>({});

  useEffect(() => {
    fetch('/api/spotify/playlists')
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d) => setPlaylists(d.items || []))
      .catch(() => setPlaylists([]));
  }, []);

  const loadTracks = async (id: string) => {
    if (tracks[id]) return;
    const res = await fetch(`/api/spotify/playlists/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    const items = (data.items || []).map((it: any) => it.track).filter(Boolean);
    setTracks((t) => ({ ...t, [id]: items }));
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-neutral-400">Your Playlists</div>
      {playlists.length === 0 && (
        <div className="text-xs text-neutral-500">No playlists found</div>
      )}
      {playlists.map((p) => (
        <div key={p.id} className="bg-neutral-800/30 rounded-md p-2">
          <button className="text-left w-full" onClick={() => loadTracks(p.id)}>
            <div className="flex items-center gap-2">
              {p.images?.[2]?.url && <img src={p.images[2].url} className="w-8 h-8" />}
              <div className="text-sm">{p.name}</div>
            </div>
          </button>
          {tracks[p.id] && (
            <div className="mt-2 space-y-1 max-h-48 overflow-auto">
              {tracks[p.id].slice(0,20).map((t: any) => (
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
          )}
        </div>
      ))}
    </div>
  );
}

