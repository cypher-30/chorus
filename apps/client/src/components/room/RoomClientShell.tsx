"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ClientSpotifyPlayer = dynamic(
  () => import("@/components/SpotifyPlayer").then((mod) => mod.SpotifyPlayer),
  { ssr: false }
);

const ClientNewSyncer = dynamic(
  () => import("@/components/NewSyncer").then((mod) => mod.NewSyncer),
  { ssr: false }
);

export const RoomClientShell = ({ roomId }: { roomId: string }) => {
  const [mounted, setMounted] = useState(false);
  const [isGoogleInAppBrowser, setIsGoogleInAppBrowser] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setIsGoogleInAppBrowser(/\bGSA\//i.test(ua));
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (isGoogleInAppBrowser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md rounded-xl border border-border bg-card p-5 text-sm text-foreground">
          <p className="font-semibold">Open Chorus in Safari</p>
          <p className="mt-2 text-muted-foreground">
            The Google app&apos;s in-app browser can break WebSocket audio sync on iPhone.
            Tap the browser menu and open this page in Safari for stable playback.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ClientSpotifyPlayer />
      <ClientNewSyncer roomId={roomId} />
    </>
  );
};
