"use client";

import { useSession, signIn } from "next-auth/react";
import Script from "next/script";
import { useEffect } from "react";
import { useGlobalStore } from "@/store/global";

type SpotifyReadyEvent = { device_id: string };
type SpotifyErrorEvent = { message: string };

interface SpotifyPlayer {
  addListener(event: "ready" | "not_ready", callback: (event: SpotifyReadyEvent) => void): void;
  addListener(event: "authentication_error" | "account_error", callback: (event: SpotifyErrorEvent) => void): void;
  addListener(event: "player_state_changed", callback: (state: PlayerState | null) => void): void;
  connect(): Promise<boolean>;
}

type SpotifyGlobal = {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume: number;
  }) => SpotifyPlayer;
};

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: SpotifyGlobal;
  }
}

type PlayerTrack = {
  uri: string;
  name: string;
  artists?: { name: string }[];
  album?: { images?: { url: string }[] };
};

type PlayerState = {
  position?: number;
  duration?: number;
  paused?: boolean;
  track_window?: {
    current_track?: PlayerTrack;
    previous_tracks?: unknown[];
  };
};

export function SpotifyPlayer() {
  const { data: session } = useSession();
  const setSpotifyDeviceId = useGlobalStore((state) => state.setSpotifyDeviceId);
  const setSpotifyPlaybackState = useGlobalStore((state) => state.setSpotifyPlaybackState);
  const setCurrentTrack = useGlobalStore((state) => state.setCurrentTrack);
  const onTrackEnded = useGlobalStore((state) => state.onTrackEnded);

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
        // The SDK calls this whenever it needs a token, which can be long
        // after mount — fetch the current session so a refreshed token is
        // used instead of the one captured at player creation.
        getOAuthToken: (cb) => {
          fetch("/api/auth/session")
            .then((res) => (res.ok ? res.json() : null))
            .then((s) => cb((s?.accessToken as string) ?? token))
            .catch(() => cb(token));
        },
        volume: 0.5,
      });

      player.addListener("ready", ({ device_id }) => {
        console.log("Spotify Player is ready with device_id", device_id);
        setSpotifyDeviceId(device_id);
      });
      player.addListener("not_ready", ({ device_id }) => {
        console.log("Spotify device has gone offline", device_id);
        setSpotifyDeviceId(null);
      });

      player.addListener("authentication_error", ({ message }) => {
        console.error(message);
        // Attempt to refresh session/login if auth fails
        try {
          signIn();
        } catch {}
      });
      player.addListener("account_error", ({ message }) => {
        console.error(message);
        alert("Account Error: A Spotify Premium account is required for this feature.");
      });

      // keep store in sync with player
      player.addListener("player_state_changed", (state: PlayerState | null) => {
        if (!state) return;
        const positionMs = state.position ?? 0;
        const durationMs = state.duration ?? 0;
        const isPlaying = !state.paused;
        const current = state.track_window?.current_track;
        if (current) {
          setCurrentTrack({
            uri: current.uri,
            name: current.name,
            artists: (current.artists ?? []).map((a) => ({ name: a.name })),
            album: { images: (current.album?.images ?? []).map((img) => ({ url: img.url })) },
          });
        }
        setSpotifyPlaybackState({ positionMs, durationMs, isPlaying });
        if (state.paused && positionMs === 0 && (state.track_window?.previous_tracks?.length ?? 0) > 0) {
          onTrackEnded();
        }
      });

      player.connect();
    };
  }, [session, setSpotifyDeviceId, setSpotifyPlaybackState, setCurrentTrack, onTrackEnded]);

  if (!session?.accessToken) return null;

  return <Script src="https://sdk.scdn.co/spotify-player.js" />;
}
