import { authOptions } from "@/lib/authOptions";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const items: unknown[] = [];
  let offset = 0;
  const limit = 100;

  try {
    while (true) {
      const res = await fetch(
        `https://api.spotify.com/v1/playlists/${id}/tracks?limit=${limit}&offset=${offset}`,
        {
          headers: { Authorization: `Bearer ${session.accessToken}` },
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const errorBody = await res.json().catch(() => undefined);
        return NextResponse.json(
          { error: "Failed to fetch playlist tracks", details: errorBody },
          { status: res.status }
        );
      }

      const data = await res.json();
      items.push(...(data.items ?? []));

      const total: number = data.total ?? items.length;
      offset += limit;
      if (!data.next || items.length >= total) {
        break;
      }
    }

    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Unexpected error fetching playlist", details: `${error}` },
      { status: 500 }
    );
  }
}

