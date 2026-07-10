import { ExtractWSRequestFrom } from "@chorus/shared";
import { sendBroadcast } from "../../utils/responses";
import { requirePlaybackPermission } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleSetShuffle: HandlerFunction<
  ExtractWSRequestFrom["SET_SHUFFLE"]
> = async ({ ws, message, server }) => {
  const { room } = requirePlaybackPermission(ws);

  room.setShuffle(message.enabled);

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_AUDIO_SOURCES",
        ...room.getQueueState(),
      },
    },
  });
};
