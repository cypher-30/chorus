import { ExtractWSRequestFrom } from "@chorus/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleMoveClient: HandlerFunction<
  ExtractWSRequestFrom["MOVE_CLIENT"]
> = async ({ ws, message, server }) => {
  const { room } = requireRoom(ws);

  // A client may only move itself — there's no UI (or reason) for moving
  // someone else, so treat a mismatched id as a protocol violation rather
  // than silently repositioning another device.
  if (message.clientId !== ws.data.clientId) {
    throw new Error(
      `Client ${ws.data.clientId} cannot move client ${message.clientId}`
    );
  }

  room.moveClient(message.clientId, message.position, server);

  // room.moveClient only broadcasts the updated SPATIAL_CONFIG (gains); the
  // position itself lives on the DTO sent via CLIENT_CHANGE, so without
  // this other clients' room maps never see the drag.
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "CLIENT_CHANGE",
        clients: room.getClientDTOs(),
        playbackControlsPermissions: room.getPlaybackControlsPermissions(),
      },
    },
  });
};
