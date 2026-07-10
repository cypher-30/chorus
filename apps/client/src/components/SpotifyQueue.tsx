"use client";
/* eslint-disable @next/next/no-img-element */
import { useGlobalStore } from "@/store/global";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

export function SpotifyQueue({ className = "" }: { className?: string }) {
  const trackQueue = useGlobalStore((s) => s.trackQueue);
  const currentTrack = useGlobalStore((s) => s.currentTrack);
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
          disabled={trackQueue.length === 0 && !currentTrack}
        >
          Clear queue
        </Button>
      </div>
      {currentTrack && (
        <div className="p-3 rounded bg-neutral-800/40">
          <div className="text-xs text-neutral-400 mb-1">Now playing</div>
          <div className="flex items-center gap-3">
            {currentTrack.album.images?.[0]?.url && (
              <img src={currentTrack.album.images[0].url} className="w-12 h-12" alt={currentTrack.name} />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{currentTrack.name}</div>
              <div className="text-xs text-neutral-400 truncate">
                {currentTrack.artists.map((a) => a.name).join(", ")}
              </div>
            </div>
          </div>
        </div>
      )}
      <div>
        <div className="text-xs text-neutral-400 mb-1">Up next</div>
        {trackQueue.length === 0 ? (
          <div className="text-xs text-neutral-500">Queue is empty</div>
        ) : (
          <div className="space-y-1">
            {trackQueue.map((t, i) => (
              <div
                key={t.uri + i}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(i));
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData('text/plain'));
                  reorderQueue(from, i);
                }}
                className="w-full p-2 rounded hover:bg-neutral-800/40 flex items-center gap-3"
              >
                <button onClick={() => playQueuedTrack(i)} className="flex items-center gap-3 flex-1 text-left">
                  {t.album.images?.[0]?.url && (
                    <img src={t.album.images[0].url} className="w-10 h-10" alt={t.name} />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm truncate">{t.name}</div>
                    <div className="text-xs text-neutral-500 truncate">
                      {t.artists.map((a) => a.name).join(", ")}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => removeFromQueue(i)}
                  className="text-xs text-neutral-400 hover:text-white"
                  title="Remove from queue"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
