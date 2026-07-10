import { authOptions } from "@/lib/authOptions";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const limit = url.searchParams.get("limit") ?? "5";

  if (!q) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const SEARCH_ENDPOINT = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
    q
  )}&type=track&limit=${encodeURIComponent(limit)}`;

  try {
    const response = await fetch(SEARCH_ENDPOINT, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Spotify search failed", error);
    return NextResponse.json(
      { error: "Spotify search failed" },
      { status: 500 }
    );
  }
}

