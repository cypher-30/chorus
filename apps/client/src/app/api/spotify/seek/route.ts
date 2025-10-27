import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { device_id, position_ms } = await req.json();
  if (typeof position_ms !== "number" || !device_id) {
    return NextResponse.json({ error: "device_id and position_ms required" }, { status: 400 });
  }

  const endpoint = `https://api.spotify.com/v1/me/player/seek?position_ms=${position_ms}&device_id=${device_id}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (response.ok) return NextResponse.json({ success: true });
  return NextResponse.json({ error: "Seek failed" }, { status: response.status });
}

