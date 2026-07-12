"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";

interface ResolvedTrack {
  uri: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  durationMs?: number;
}

export function AddByLink() {
  const audioSources = useGlobalStore((s) => s.audioSources);
  const [link, setLink] = useState("");
  const [resolved, setResolved] = useState<ResolvedTrack[]>([]);
  const [capped, setCapped] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const handleResolve = async () => {
    if (!link.trim()) return;
    setIsResolving(true);
    setResolved([]);
    try {
      const res = await fetch("/api/spotify/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Couldn't resolve that link");
        return;
      }
      setResolved(data.tracks || []);
      setCapped(!!data.capped);
    } catch {
      toast.error("Couldn't resolve that link");
    } finally {
      setIsResolving(false);
    }
  };

  const handleAdd = async () => {
    if (resolved.length === 0) return;
    setIsAdding(true);
    try {
      // Dedupe against what's already queued (pending or already synced)
      const known = new Set(
        audioSources.flatMap((s) => [s.url, s.spotifyUri]).filter(Boolean)
      );
      const fresh = resolved.filter((t) => !known.has(t.uri));
      if (fresh.length === 0) {
        toast.info("All of those tracks are already in the queue");
        setResolved([]);
        setLink("");
        return;
      }

      const sources = [
        ...audioSources,
        ...fresh.map((t) => ({
          url: t.uri,
          spotifyUri: t.uri,
          title: t.title,
          artist: t.artist,
          artworkUrl: t.artworkUrl,
          durationMs: t.durationMs,
        })),
      ];
      const roomId = useRoomStore.getState().roomId;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/queue/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, sources }),
      });
      if (!res.ok) throw new Error(`queue/set failed: ${res.status}`);

      const skipped = resolved.length - fresh.length;
      toast.success(
        `Added ${fresh.length} track${fresh.length === 1 ? "" : "s"} to the queue` +
          (skipped > 0 ? ` (${skipped} already queued)` : "")
      );
      setResolved([]);
      setLink("");
    } catch (e) {
      console.error("Failed to add tracks", e);
      toast.error("Failed to add tracks to the queue");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="p-4 bg-neutral-800 rounded-lg w-full max-w-md mx-auto">
      <div className="flex gap-2">
        <Input
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleResolve()}
          placeholder="Paste a Spotify track, album, or playlist link..."
          className="bg-neutral-700 border-neutral-600 text-white"
        />
        <Button onClick={handleResolve} disabled={isResolving || !link.trim()}>
          {isResolving ? "..." : "Find"}
        </Button>
      </div>
      {resolved.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-300">
              Found {resolved.length} track{resolved.length === 1 ? "" : "s"}
              {capped && " (first 100)"}
            </span>
            <Button size="sm" onClick={handleAdd} disabled={isAdding}>
              {isAdding ? "Adding..." : "Add to queue"}
            </Button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {resolved.map((t) => (
              <div key={t.uri} className="flex items-center gap-2 p-1.5 bg-neutral-700/60 rounded">
                {t.artworkUrl && (
                  <img src={t.artworkUrl} alt={t.title} className="w-8 h-8 flex-shrink-0 rounded-sm" />
                )}
                <div className="truncate">
                  <p className="text-sm text-white truncate">{t.title}</p>
                  <p className="text-xs text-neutral-400 truncate">{t.artist}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-500">
            Tracks are added as “Needs audio” — send the matching file to the Telegram bot to make them playable.
          </p>
        </div>
      )}
    </div>
  );
}
