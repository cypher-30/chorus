"use client";
/* eslint-disable @next/next/no-img-element */
import { useGlobalStore } from "@/store/global";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Music } from "lucide-react";

// Display name for a queue entry: embedded metadata, else the R2 filename
function sourceTitle(url: string, title?: string): string {
  if (title) return title;
  if (url.startsWith("spotify:")) return url;
  try {
    const last = new URL(url).pathname.split("/").pop() ?? url;
    return decodeURIComponent(last);
  } catch {
    return url;
  }
}

export function SpotifyQueue({ className = "" }: { className?: string }) {
  const audioSources = useGlobalStore((s) => s.audioSources);
  const selectedAudioUrl = useGlobalStore((s) => s.selectedAudioUrl);
  const playQueuedTrack = useGlobalStore((s) => s.playQueuedTrack);
  const removeFromQueue = useGlobalStore((s) => s.removeFromQueue);
  const reorderQueue = useGlobalStore((s) => s.reorderQueue);
  const clearQueue = useGlobalStore((s) => s.clearQueue);
  const skipDuplicates = useGlobalStore((s) => s.skipDuplicates);
  const setSkipDuplicates = useGlobalStore((s) => s.setSkipDuplicates);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between bg-neutral-800/40 rounded-md px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-neutral-300">
          <Switch
            checked={skipDuplicates}
            onCheckedChange={(v) => setSkipDuplicates(v)}
            className="scale-90"
          />
          <span>Skip duplicates on import</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-neutral-300 hover:text-white"
          onClick={clearQueue}
          disabled={audioSources.length === 0}
        >
          Clear queue
        </Button>
      </div>
      <div>
        <div className="text-xs text-neutral-400 mb-1">Queue</div>
        {audioSources.length === 0 ? (
          <div className="text-xs text-neutral-500">
            Queue is empty — paste a Spotify link or search above
          </div>
        ) : (
          <div className="space-y-1">
            {audioSources.map((source, i) => {
              const isPending = source.url.startsWith("spotify:");
              const isNowPlaying =
                !isPending && source.url === selectedAudioUrl;
              return (
                <div
                  key={source.url + i}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(i));
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    reorderQueue(from, i);
                  }}
                  className={cn(
                    "w-full p-2 rounded flex items-center gap-3 hover:bg-neutral-800/40",
                    isNowPlaying && "bg-neutral-800/60",
                    isPending && "opacity-50"
                  )}
                >
                  <button
                    onClick={() => playQueuedTrack(i)}
                    className="flex items-center gap-3 flex-1 text-left min-w-0"
                  >
                    {source.artworkUrl ? (
                      <img
                        src={source.artworkUrl}
                        className="w-10 h-10 flex-shrink-0 rounded-sm"
                        alt={sourceTitle(source.url, source.title)}
                      />
                    ) : (
                      <div className="w-10 h-10 flex-shrink-0 rounded-sm bg-neutral-800 flex items-center justify-center">
                        <Music className="w-4 h-4 text-neutral-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "text-sm truncate",
                          isNowPlaying && "text-primary-400 font-medium"
                        )}
                      >
                        {sourceTitle(source.url, source.title)}
                      </div>
                      {source.artist && (
                        <div className="text-xs text-neutral-500 truncate">
                          {source.artist}
                        </div>
                      )}
                    </div>
                  </button>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap",
                      isPending
                        ? "bg-neutral-700/80 text-neutral-400"
                        : "bg-green-900/50 text-green-400"
                    )}
                  >
                    {isPending ? "Needs audio" : isNowPlaying ? "Playing" : "Synced ✓"}
                  </span>
                  <button
                    onClick={() => removeFromQueue(i)}
                    className="text-xs text-neutral-400 hover:text-white flex-shrink-0"
                    title="Remove from queue"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
