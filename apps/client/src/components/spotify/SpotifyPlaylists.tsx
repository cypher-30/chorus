"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { SpotifyTrack, useGlobalStore } from "@/store/global";
import { toast } from "sonner";
import { usePostHog } from "posthog-js/react";
import { Button } from "../ui/button";

type Playlist = {
  id: string;
  name: string;
  images?: { url: string }[];
};

type PlaylistTrackItem = {
  track: SpotifyTrack;
};

export function SpotifyPlaylists() {
  const posthog = usePostHog();
  const addToQueue = useGlobalStore((s) => s.addToQueue);
  const skipDuplicates = useGlobalStore((s) => s.skipDuplicates);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<
    Record<string, { added: number; skipped: number; failed: number; total: number }>
  >({});
  const [failedTracks, setFailedTracks] = useState<Record<string, SpotifyTrack[]>>({});

  useEffect(() => {
    fetch("/api/spotify/playlists")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setPlaylists(d.items ?? []))
      .catch(() => setPlaylists([]));
  }, []);

  const convertTrack = (t: PlaylistTrackItem["track"]): SpotifyTrack | null => {
    if (!t?.uri) return null;
    return {
      uri: t.uri,
      name: t.name,
      artists: (t.artists ?? []).map((a) => ({ name: a.name })),
      album: { images: (t.album?.images ?? []).map((img) => ({ url: img.url })) },
    };
  };

  const enqueuePlaylist = async (id: string, name: string) => {
    const resetProgress = { added: 0, skipped: 0, failed: 0, total: 0 };
    try {
      setLoadingId(id);
      const res = await fetch(`/api/spotify/playlists/${id}`);
      if (!res.ok) throw new Error("Failed to fetch playlist");
      const data = await res.json();
      const mappedTracks = (data.items ?? []).map((it: PlaylistTrackItem) =>
        convertTrack(it.track)
      );
      const tracks: SpotifyTrack[] = mappedTracks.filter(
        (t: SpotifyTrack | null): t is SpotifyTrack => Boolean(t)
      );
      if (tracks.length === 0) {
        toast.error("No tracks found in playlist");
        return;
      }
      const state = useGlobalStore.getState();
      const seen = new Set<string>([
        ...state.audioSources.flatMap((s) =>
          [s.url, s.spotifyUri].filter((u): u is string => Boolean(u))
        ),
        state.currentTrack?.uri ?? "",
      ]);
      setProgress((p) => ({ ...p, [id]: { ...resetProgress, total: tracks.length } }));

      const failed: SpotifyTrack[] = [];
      let added = 0;
      let skipped = 0;

      for (const track of tracks) {
        if (skipDuplicates && seen.has(track.uri)) {
          skipped += 1;
          setProgress((p) => ({
            ...p,
            [id]: { added, skipped, failed: failed.length, total: tracks.length },
          }));
          continue;
        }
        seen.add(track.uri);
        const result = await addToQueue(track);
        if (result === "added") {
          added += 1;
        } else if (result === "duplicate") {
          skipped += 1;
        } else {
          failed.push(track);
        }
        setProgress((p) => ({
          ...p,
          [id]: { added, skipped, failed: failed.length, total: tracks.length },
        }));
      }

      setFailedTracks((prev) => ({ ...prev, [id]: failed }));

      if (failed.length > 0) {
        toast.error(`Added ${added} but ${failed.length} failed from ${name}`);
        posthog?.capture("playlist_import_failure", {
          playlist_id: id,
          playlist_name: name,
          added,
          skipped,
          failed: failed.length,
        });
      } else {
        const suffix = skipped > 0 ? ` (${skipped} skipped)` : "";
        toast.success(`Added ${added} tracks from ${name}${suffix}`);
        posthog?.capture("playlist_import_success", {
          playlist_id: id,
          playlist_name: name,
          added,
          skipped,
          failed: 0,
        });
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to add playlist");
      posthog?.capture("playlist_import_failure", {
        playlist_id: id,
        playlist_name: name,
        reason: "fetch_failed",
      });
    } finally {
      setLoadingId(null);
    }
  };

  const retryFailed = async (id: string, name: string) => {
    const pending = failedTracks[id] || [];
    if (pending.length === 0) return;
    const stillFailed: SpotifyTrack[] = [];
    for (const track of pending) {
      const result = await addToQueue(track);
      if (result === "error") {
        stillFailed.push(track);
      }
    }
    setFailedTracks((prev) => ({ ...prev, [id]: stillFailed }));
    if (stillFailed.length === 0) {
      toast.success(`Retried failed tracks for ${name}`);
    } else {
      toast.error(`Some tracks still failed to add for ${name}`);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Your Playlists</div>
      {playlists.length === 0 && (
        <div className="text-xs text-muted-foreground">No playlists found</div>
      )}
      {playlists.map((p) => (
        <div key={p.id} className="rounded-lg bg-secondary p-2">
          <div className="flex items-center gap-2">
            {p.images?.[2]?.url && <img src={p.images[2].url} className="size-8 rounded-md" alt={p.name} />}
            <div className="text-sm flex-1">
              {p.name}
              {progress[p.id] && (
                <div className="text-[10px] text-muted-foreground">
                  {progress[p.id].added}/{progress[p.id].total} added • {progress[p.id].skipped} skipped •{" "}
                  {progress[p.id].failed} failed
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => enqueuePlaylist(p.id, p.name)}
              disabled={loadingId === p.id}
              className="text-xs"
            >
              {loadingId === p.id ? "Adding..." : "Add playlist"}
            </Button>
          </div>
          {failedTracks[p.id]?.length ? (
            <div className="flex items-center justify-between mt-2 text-[11px] text-destructive">
              <span>{failedTracks[p.id].length} tracks failed</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-foreground"
                onClick={() => retryFailed(p.id, p.name)}
              >
                Retry failed
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
 
