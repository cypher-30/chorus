"use client";
/* eslint-disable @next/next/no-img-element */

import { cn, formatTime } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { Music, X } from "lucide-react";
import { Switch } from "../ui/switch";

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

export const QueuePanel = () => {
  const audioSources = useGlobalStore((s) => s.audioSources);
  const selectedAudioUrl = useGlobalStore((s) => s.selectedAudioUrl);
  const playQueuedTrack = useGlobalStore((s) => s.playQueuedTrack);
  const removeFromQueue = useGlobalStore((s) => s.removeFromQueue);
  const reorderQueue = useGlobalStore((s) => s.reorderQueue);
  const clearQueue = useGlobalStore((s) => s.clearQueue);
  const skipDuplicates = useGlobalStore((s) => s.skipDuplicates);
  const setSkipDuplicates = useGlobalStore((s) => s.setSkipDuplicates);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-display text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          Queue
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              checked={skipDuplicates}
              onCheckedChange={setSkipDuplicates}
              className="scale-75"
            />
            Skip duplicates
          </label>
          <button
            onClick={clearQueue}
            disabled={audioSources.length === 0}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Clear
          </button>
          <span className="font-mono text-[11px] text-muted-foreground">
            {audioSources.length} tracks
          </span>
        </div>
      </div>

      {audioSources.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          Queue is empty — add a track above
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {audioSources.map((source, i) => {
            const isPending = source.url.startsWith("spotify:");
            const isNowPlaying = !isPending && source.url === selectedAudioUrl;
            return (
              <div
                key={source.url + i}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData("text/plain"));
                  reorderQueue(from, i);
                }}
                className={cn(
                  "group flex items-center gap-3 rounded-[10px] px-2 py-2.5 hover:bg-secondary",
                  isNowPlaying && "bg-secondary"
                )}
              >
                <button
                  onClick={() => playQueuedTrack(i)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  {source.artworkUrl ? (
                    <img
                      src={source.artworkUrl}
                      alt={sourceTitle(source.url, source.title)}
                      className="size-9 flex-shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent">
                      <Music className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "truncate text-[13px] font-medium",
                        isPending && "text-muted-foreground"
                      )}
                    >
                      {sourceTitle(source.url, source.title)}
                    </div>
                    {source.artist && (
                      <div className="truncate text-xs text-muted-foreground">
                        {source.artist}
                      </div>
                    )}
                  </div>
                </button>
                {isPending ? (
                  <span className="flex-shrink-0 whitespace-nowrap rounded-md bg-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                    NEEDS AUDIO
                  </span>
                ) : (
                  <span className="flex-shrink-0 font-mono text-[11px] text-muted-foreground">
                    {source.durationMs ? formatTime(source.durationMs / 1000) : ""}
                  </span>
                )}
                <button
                  onClick={() => removeFromQueue(i)}
                  title="Remove from queue"
                  className="flex-shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
