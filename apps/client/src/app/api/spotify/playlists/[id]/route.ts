import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET(_req: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = context.params.id;
  const res = await fetch(`https://api.spotify.com/v1/playlists/${id}/tracks?limit=50`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

