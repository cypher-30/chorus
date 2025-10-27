import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const seed_tracks = url.searchParams.get('seed_tracks');
  if (!seed_tracks) return NextResponse.json({ error: 'seed_tracks required' }, { status: 400 });
  const res = await fetch(`https://api.spotify.com/v1/recommendations?seed_tracks=${encodeURIComponent(seed_tracks)}&limit=10`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

