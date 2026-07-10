import { authOptions } from "@/lib/authOptions";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");
  if (!ids) return NextResponse.json({ error: "ids required" }, { status: 400 });
  const endpoint = `https://api.spotify.com/v1/tracks?ids=${encodeURIComponent(ids)}`;
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

