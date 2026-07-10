import { authOptions } from "@/lib/authOptions";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

// Spotify deprecated /v1/recommendations for apps onboarded after Nov 2024,
// so this serves the user's top tracks instead.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(
      "https://api.spotify.com/v1/me/top/tracks?limit=10&time_range=short_term",
      {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        cache: "no-store",
      }
    );
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }
    // Keep the { tracks } shape the panel expects
    return NextResponse.json({ tracks: data.items ?? [] });
  } catch (error) {
    console.error("Spotify top tracks error:", error);
    return NextResponse.json({ error: "Failed to fetch top tracks" }, { status: 502 });
  }
}
