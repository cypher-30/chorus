"use client";

import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { PlaybackControlsPermissionsType } from "@chorus/shared";
import { Orbit, RotateCcw } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { GainMeter } from "./GainMeter";
import { SpatialMap } from "./SpatialMap";
import { Switch } from "../ui/switch";

export const DevicesPanel = () => {
  const posthog = usePostHog();
  const userId = useRoomStore((s) => s.userId);
  const clients = useGlobalStore((s) => s.connectedClients);
  const isSpatialAudioEnabled = useGlobalStore((s) => s.isSpatialAudioEnabled);
  const setIsSpatialAudioEnabled = useGlobalStore((s) => s.setIsSpatialAudioEnabled);
  const listeningSource = useGlobalStore((s) => s.listeningSourcePosition);
  const updateListeningSource = useGlobalStore((s) => s.updateListeningSource);
  const startSpatialAudio = useGlobalStore((s) => s.startSpatialAudio);
  const stopSpatialAudio = useGlobalStore((s) => s.sendStopSpatialAudio);
  const reorderClient = useGlobalStore((s) => s.reorderClient);
  const playbackControlsPermissions = useGlobalStore((s) => s.playbackControlsPermissions);
  const sendPlaybackControls = useGlobalStore((s) => s.sendPlaybackControls);

  const currentUser = clients.find((c) => c.clientId === userId);
  const isAdmin = currentUser?.isAdmin ?? false;

  const handleSetPermissions = (value: PlaybackControlsPermissionsType) => {
    sendPlaybackControls(value);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Spatial audio</div>
          <div className="text-xs text-muted-foreground">Pan volume by position in the room</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            title="Orbit the listening source automatically"
            onClick={() => {
              startSpatialAudio();
              posthog.capture("start_spatial_audio");
            }}
            className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          >
            <Orbit className="size-3.5" />
          </button>
          <Switch
            checked={isSpatialAudioEnabled}
            onCheckedChange={(checked) => {
              setIsSpatialAudioEnabled(checked);
              if (checked) {
                updateListeningSource(listeningSource);
              } else {
                stopSpatialAudio();
                posthog.capture("stop_spatial_audio");
              }
            }}
          />
        </div>
      </div>

      <SpatialMap />
      <div className="text-center text-[11px] text-muted-foreground">
        Drag the headphone icon to re-pan, or drag your own dot to set where you are
      </div>
      <GainMeter />

      <div className="flex justify-end">
        <button
          onClick={() => reorderClient(userId)}
          title="Bring your device to the front and reset everyone's position to an even circle"
          className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-foreground hover:bg-accent"
        >
          <RotateCcw className="size-3.5" /> Reset layout
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {clients.map((client) => {
          const isYou = client.clientId === userId;
          return (
            <div
              key={client.clientId}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 data-[you=true]:bg-secondary"
              data-you={isYou}
            >
              <div className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold">
                {client.username.slice(0, 2).toUpperCase()}
              </div>
              <span className="flex-1 truncate text-sm">{client.username}</span>
              {client.isAdmin && (
                <span className="rounded-md bg-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                  ADMIN
                </span>
              )}
              <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                Synced
              </span>
            </div>
          );
        })}
        {clients.length === 0 && (
          <div className="py-3 text-center text-xs text-muted-foreground">
            No other devices connected
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2.5">
          <span className="text-sm">Playback control</span>
          <div className="flex gap-1">
            <button
              onClick={() => handleSetPermissions("EVERYONE")}
              className={`rounded-md px-2.5 py-1 text-xs ${
                playbackControlsPermissions === "EVERYONE"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Everyone
            </button>
            <button
              onClick={() => handleSetPermissions("ADMIN_ONLY")}
              className={`rounded-md px-2.5 py-1 text-xs ${
                playbackControlsPermissions === "ADMIN_ONLY"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Admins
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
