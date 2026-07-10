import { authOptions } from "@/lib/authOptions";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function PUT(req: Request) {
  // Get the user's session to securely access their Spotify token
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "User not authenticated" },
      { status: 401 }
    );
  }

  let device_id: string | undefined;
  let track_uri: string | undefined;
  let position_ms: number | undefined;
  try {
    ({ device_id, track_uri, position_ms } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!device_id) {
    return NextResponse.json(
      { error: "Device ID is required" },
      { status: 400 }
    );
  }

  // With a track_uri Spotify starts that track (optionally at position_ms);
  // an empty body means "resume playback where it is"
  const playBody: Record<string, unknown> = {};
  if (track_uri) {
    playBody.uris = [track_uri];
    if (typeof position_ms === "number" && position_ms > 0) {
      playBody.position_ms = Math.floor(position_ms);
    }
  }

  // This is the official endpoint for Spotify's Web API to start playback
  const PLAY_ENDPOINT = `https://api.spotify.com/v1/me/player/play?device_id=${device_id}`;

  try {
    const response = await fetch(PLAY_ENDPOINT, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(playBody),
    });

    if (response.ok || response.status === 204) {
      // If Spotify returns a success code (like 204 No Content), it means it worked.
      return NextResponse.json({ success: true }, { status: 200 });
    } else {
      // Attempt transfer playback then retry play once
      try {
        const transfer = await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ device_ids: [device_id], play: true }),
        });
        if (transfer.ok || transfer.status === 204) {
          // Retry explicit play with the same body
          const retry = await fetch(PLAY_ENDPOINT, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(playBody),
          });
          if (retry.ok || retry.status === 204) {
            return NextResponse.json({ success: true }, { status: 200 });
          }
        }
      } catch {}
      // If still failing, surface error
      let details: unknown = undefined;
      try { details = await response.json(); } catch {}
      return NextResponse.json(
        { error: 'Failed to start playback', details },
        { status: response.status }
      );
    }
  } catch (error) {
    console.error("Internal Server Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
