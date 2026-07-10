import { ExtractWSRequestFrom } from "@chorus/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleReorderClient: HandlerFunction<
  ExtractWSRequestFrom["REORDER_CLIENT"]
> = async ({ ws, message, server }) => {
  // Handle client reordering
  const { room } = requireRoom(ws);

  room.reorderClients(message.clientId, server);

  // Broadcast the updated client order to all clients (wire-safe DTOs)
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
