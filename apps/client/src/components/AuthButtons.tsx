"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "./ui/button";
import { FaSpotify } from "react-icons/fa"; // Import the Spotify icon

export function AuthButtons() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return null; // Don't show anything while checking the session
  }

  if (session) {
    // This is the view for when the user is signed in
    return (
      <div className="flex w-full items-center justify-between gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm">
        <span className="truncate text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{session.user?.name}</span>
        </span>
        <Button
          onClick={() => signOut()}
          size="sm"
          variant="destructive"
          className="flex-shrink-0 rounded-full"
        >
          Sign out
        </Button>
      </div>
    );
  }

  // This is the button for signing in
  return (
    <Button
      onClick={() => signIn("spotify")}
      className="flex w-full items-center justify-center rounded-full"
    >
      <FaSpotify size={16} />
      <span>Sign in with Spotify</span>
    </Button>
  );
}