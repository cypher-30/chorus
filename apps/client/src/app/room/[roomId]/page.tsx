import { RoomClientShell } from "@/components/room/RoomClientShell";
import { validateFullRoomId } from "@/lib/room";
import React from "react";

export default async function Page({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  if (!validateFullRoomId(roomId)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-2">
        <div>
          Invalid room ID: <span className="font-bold">{roomId}</span>.
        </div>
        <div className="text-sm text-gray-500">
          Please enter a valid 6-digit numeric code.
        </div>
      </div>
    );
  }

  return (
    <>
      <RoomClientShell roomId={roomId} />
    </>
  );
}
