import { ExtractWSRequestFrom } from "@chorus/shared";
import { sendBroadcast } from "../../utils/responses";
import { requireRoomAdmin } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSetPlaybackControls: HandlerFunction<
  ExtractWSRequestFrom["SET_PLAYBACK_CONTROLS"]
> = async ({ ws, message, server }) => {
  const { room } = requireRoomAdmin(ws);
  room.setPlaybackControls(message.permissions);

  // Let every client learn the new permission state
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
