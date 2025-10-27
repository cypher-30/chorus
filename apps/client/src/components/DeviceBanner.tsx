"use client";
import { useSession } from "next-auth/react";
import { useGlobalStore } from "@/store/global";

export function DeviceBanner() {
  const { data: session } = useSession();
  const deviceId = useGlobalStore((s) => s.spotifyDeviceId);
  const pending = useGlobalStore((s) => s.pendingSpotifyUri);

  if (!session?.accessToken) return null;
  if (deviceId) return null;

  return (
    <div className="w-full bg-yellow-500/10 border border-yellow-600/40 text-yellow-300 text-xs px-3 py-2 rounded">
      No active Spotify device. Open Spotify and select "Chorus Web Player" or press Play here and we’ll start when ready.
      {pending && <span className="ml-2 text-yellow-400">Pending track queued…</span>}
    </div>
  );
}

