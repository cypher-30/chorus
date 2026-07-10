"use client";
import { useSession, signIn } from "next-auth/react";
import { useGlobalStore } from "@/store/global";

export function DeviceBanner() {
  const { data: session } = useSession();
  const deviceId = useGlobalStore((s) => s.spotifyDeviceId);
  const pending = useGlobalStore((s) => s.pendingSpotifyUri);
  const currentTrack = useGlobalStore((s) => s.currentTrack);

  if (!session?.accessToken) return null;
  if (deviceId) return null;

  const retry = async () => {
    try {
      if (!session) return;
      if (currentTrack) {
        // Try transferring playback by asking to play current track once
        await fetch("/api/spotify/play", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_id: deviceId ?? "",
            track_uri: currentTrack.uri,
          }),
        });
      } else {
        // Fallback just sign-in to refresh
        signIn();
      }
    } catch {}
  };

  return (
    <div className="w-full bg-yellow-500/10 border border-yellow-600/40 text-yellow-300 text-xs px-3 py-2 rounded">
      No active Spotify device. Open Spotify and select &quot;Chorus Web Player&quot; or press Play here and we&apos;ll start when ready.
      {pending && <span className="ml-2 text-yellow-400">Pending track queued...</span>}
      <button onClick={retry} className="ml-3 underline hover:no-underline">Retry</button>
    </div>
  );
}
