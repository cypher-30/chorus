import { authOptions } from "@/lib/authOptions";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

// Max tracks returned for an album/playlist paste
const MAX_TRACKS = 100;

export interface ResolvedTrack {
  uri: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  durationMs?: number;
}

// Accepts open.spotify.com/{type}/{id} (with optional locale prefix like
// /intl-fr/) and spotify:{type}:{id}
function parseSpotifyLink(
  input: string
): { type: "track" | "album" | "playlist"; id: string } | null {
  const trimmed = input.trim();

  const uriMatch = trimmed.match(/^spotify:(track|album|playlist):([A-Za-z0-9]+)$/);
  if (uriMatch) {
    return { type: uriMatch[1] as "track" | "album" | "playlist", id: uriMatch[2] };
  }

  try {
    const url = new URL(trimmed);
    if (!/(^|\.)spotify\.com$/.test(url.hostname)) return null;
    const pathMatch = url.pathname.match(
      /\/(?:intl-[a-z]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/
    );
    if (!pathMatch) return null;
    return { type: pathMatch[1] as "track" | "album" | "playlist", id: pathMatch[2] };
  } catch {
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeTrack(t: any, fallbackArtworkUrl?: string): ResolvedTrack | null {
  if (!t?.uri || !t?.name) return null;
  return {
    uri: t.uri,
    title: t.name,
    artist: (t.artists ?? []).map((a: any) => a.name).join(", "),
    artworkUrl: t.album?.images?.[0]?.url ?? fallbackArtworkUrl,
    durationMs: t.duration_ms,
  };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let link: string | undefined;
  try {
    const body = await req.json();
    link = body?.url;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!link || typeof link !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const parsed = parseSpotifyLink(link);
  if (!parsed) {
    return NextResponse.json(
      { error: "Not a Spotify track, album, or playlist link" },
      { status: 400 }
    );
  }

  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const spotify = async (path: string): Promise<any> => {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Spotify API ${res.status} for ${path}`);
    }
    return res.json();
  };

  try {
    const tracks: ResolvedTrack[] = [];
    let capped = false;

    if (parsed.type === "track") {
      const t = normalizeTrack(await spotify(`/tracks/${parsed.id}`));
      if (t) tracks.push(t);
    } else if (parsed.type === "album") {
      // Album tracks carry no images; use the album cover for every track
      const album = await spotify(`/albums/${parsed.id}`);
      const artworkUrl: string | undefined = album.images?.[0]?.url;
      let next: string | null = `/albums/${parsed.id}/tracks?limit=50`;
      while (next && tracks.length < MAX_TRACKS) {
        const page = await spotify(next);
        for (const item of page.items ?? []) {
          const t = normalizeTrack(item, artworkUrl);
          if (t && tracks.length < MAX_TRACKS) tracks.push(t);
        }
        next = page.next ? page.next.replace("https://api.spotify.com/v1", "") : null;
      }
      capped = !!next;
    } else {
      let next: string | null = `/playlists/${parsed.id}/tracks?limit=50`;
      while (next && tracks.length < MAX_TRACKS) {
        const page = await spotify(next);
        for (const item of page.items ?? []) {
          // Skip local files and episodes — they have no fetchable audio identity
          if (!item?.track || item.track.is_local || item.track.type !== "track") continue;
          const t = normalizeTrack(item.track);
          if (t && tracks.length < MAX_TRACKS) tracks.push(t);
        }
        next = page.next ? page.next.replace("https://api.spotify.com/v1", "") : null;
      }
      capped = !!next;
    }

    if (tracks.length === 0) {
      return NextResponse.json(
        { error: "No playable tracks found at that link" },
        { status: 404 }
      );
    }

    return NextResponse.json({ type: parsed.type, tracks, capped });
  } catch (err) {
    console.error("Spotify resolve failed:", err);
    return NextResponse.json(
      { error: "Couldn't fetch that link from Spotify — check the link and try again" },
      { status: 502 }
    );
  }
}
