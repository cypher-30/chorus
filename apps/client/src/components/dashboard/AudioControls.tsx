"use client";

import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { PlaybackControlsPermissionsEnum } from "@chorus/shared";
import { Construction, Orbit } from "lucide-react";
import { motion } from "motion/react";
import { usePostHog } from "posthog-js/react";
import { Button } from "../ui/button";

export const AudioControls = () => {
  const posthog = usePostHog();
  const startSpatialAudio = useGlobalStore((state) => state.startSpatialAudio);
  const stopSpatialAudio = useGlobalStore(
    (state) => state.sendStopSpatialAudio
  );
  const isLoadingAudio = useGlobalStore((state) => state.isInitingSystem);
  const isPlaying = useGlobalStore((state) => state.isPlaying);
  const togglePlayPause = useGlobalStore((state) => state.togglePlayPause);
  const playNextTrack = useGlobalStore((state) => state.playNextTrack);
  const setPlaybackPermissions = useGlobalStore((s) => s.setPlaybackPermissions);
  const connectedClients = useGlobalStore((s) => s.connectedClients);
  const userId = useRoomStore((s) => s.userId);
  const isAdmin = connectedClients.find((c) => c.clientId === userId)?.isAdmin ?? false;

  const handleStartSpatialAudio = () => {
    startSpatialAudio();
    posthog.capture("start_spatial_audio");
  };

  const handleStopSpatialAudio = () => {
    stopSpatialAudio();
    posthog.capture("stop_spatial_audio");
  };

  return (
    <motion.div className="px-4 space-y-3 py-3">
      {/* Playback controls */}
      <motion.div className="bg-neutral-800/20 rounded-md p-3 hover:bg-neutral-800/30 transition-colors">
        <div className="flex justify-between items-center">
          <div className="text-xs text-neutral-300">Playback</div>
          <div className="flex gap-2">
            <Button
              className="text-xs px-3 py-1 h-auto bg-primary-600/80 hover:bg-primary-600 text-white"
              size="sm"
              onClick={() => {
                togglePlayPause();
                posthog.capture(isPlaying ? "pause_click" : "play_click");
              }}
              disabled={isLoadingAudio}
            >
              {isPlaying ? "Pause" : "Play"}
            </Button>
            <Button
              className="text-xs px-3 py-1 h-auto bg-neutral-700/60 hover:bg-neutral-700 text-white"
              size="sm"
              onClick={() => {
                playNextTrack();
                posthog.capture("next_click");
              }}
              disabled={isLoadingAudio}
            >
              Next
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Admin-only playback controls permissions */}
      {isAdmin && (
        <motion.div className="bg-neutral-800/20 rounded-md p-3 hover:bg-neutral-800/30 transition-colors">
          <div className="flex items-center justify-between">
            <div className="text-xs text-neutral-300">Who can control playback?</div>
            <select
              className="bg-neutral-800 text-xs px-2 py-1 rounded border border-neutral-700"
              onChange={(e) => setPlaybackPermissions(e.target.value as any)}
              defaultValue={PlaybackControlsPermissionsEnum.enum.EVERYONE}
            >
              <option value={PlaybackControlsPermissionsEnum.enum.EVERYONE}>Everyone</option>
              <option value={PlaybackControlsPermissionsEnum.enum.ADMIN_ONLY}>Admins only</option>
            </select>
          </div>
        </motion.div>
      )}
      <h2 className={`text-xs font-medium uppercase tracking-wide ${
          isLoadingAudio ? "text-neutral-500" : "text-neutral-400"
        }`}>
        Spatial Audio {isLoadingAudio && (
          <span className="text-xs opacity-70">(loading...)</span>
        )}
      </h2>

      <div className="space-y-3">
        <motion.div className="bg-neutral-800/20 rounded-md p-3 hover:bg-neutral-800/30 transition-colors">
          <div className="flex justify-between items-center">
            <div className="text-xs text-neutral-300 flex items-center gap-1.5">
              <Orbit className="h-3 w-3 text-primary-500" />
              <span>Rotation</span>
            </div>
            <div className="flex gap-2">
              <Button
                className="text-xs px-3 py-1 h-auto bg-primary-600/80 hover:bg-primary-600 text-white"
                size="sm"
                onClick={handleStartSpatialAudio}
                disabled={isLoadingAudio}
              >
                Start
              </Button>
              <Button
                className="text-xs px-3 py-1 h-auto bg-neutral-700/60 hover:bg-neutral-700 text-white"
                size="sm"
                onClick={handleStopSpatialAudio}
                disabled={isLoadingAudio}
              >
                Stop
              </Button>
            </div>
          </div>
        </motion.div>
        <div className="bg-neutral-800/20 rounded-md p-3 hover:bg-neutral-800/30 transition-colors">
          <div className="flex flex-col gap-2">
            <div className="text-xs text-neutral-500 flex items-center gap-1.5">
              <Construction className="h-3 w-3 text-neutral-400" />
              <span>More coming soon...</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
