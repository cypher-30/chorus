"use client";

import { useSession, signIn } from "next-auth/react";
import Script from "next/script";
import { useEffect } from "react";
import { useGlobalStore } from "@/store/global";

export function SpotifyPlayer() {
  const { data: session } = useSession();
  const setSpotifyDeviceId = useGlobalStore((state) => state.setSpotifyDeviceId);
  const setSpotifyPlaybackState = useGlobalStore((state) => state.setSpotifyPlaybackState);
  const setCurrentTrack = useGlobalStore((state) => state.setCurrentTrack);

  useEffect(() => {
    // If the session has an error (like an expired token), trigger a sign-in to refresh it.
    if (session?.error === "RefreshAccessTokenError") {
      signIn();
    }
    
    if (!session?.accessToken) return;

    window.onSpotifyWebPlaybackSDKReady = () => {
      const token = session.accessToken as string;
      const player = new window.Spotify.Player({
        name: "Chorus Web Player",
        getOAuthToken: (cb) => cb(token),
        volume: 0.5,
      });

      player.addListener("ready", ({ device_id }) => {
        console.log("✅ Spotify Player is ready with device_id", device_id);
        setSpotifyDeviceId(device_id);
      });
      player.addListener("not_ready", ({ device_id }) => {
        console.log("❌ Device ID has gone offline", device_id);
        setSpotifyDeviceId(null);
      });

      player.addListener('authentication_error', ({ message }) => {
        console.error(message);
        // Attempt to refresh session/login if auth fails
        try { signIn(); } catch {}
      });
      player.addListener('account_error', ({ message }) => {
        console.error(message);
        alert("Account Error: A Spotify Premium account is required for this feature.");
      });

      // keep store in sync with player
      player.addListener('player_state_changed', (state) => {
        if (!state) return;
        const positionMs = state.position ?? 0;
        const durationMs = state.duration ?? 0;
        const isPlaying = !state.paused;
        const current = state.track_window?.current_track;
        if (current) {
          setCurrentTrack({
            uri: current.uri,
            name: current.name,
            artists: current.artists?.map((a: any) => ({ name: a.name })) ?? [],
            album: { images: (current.album?.images ?? []).map((img: any) => ({ url: img.url })) },
          });
        }
        setSpotifyPlaybackState({ positionMs, durationMs, isPlaying });
      });

      player.connect();
    };
  }, [session, setSpotifyDeviceId]);

  if (!session?.accessToken) return null;

  return <Script src="https://sdk.scdn.co/spotify-player.js" />;
}
