import { epochNow, ExtractWSRequestFrom } from "@chorus/shared";
import { SCHEDULE_TIME_MS } from "../../config";
import { sendBroadcast } from "../../utils/responses";
import { requirePlaybackPermission } from "../middlewares";
import { HandlerFunction } from "../types";

export const handlePlay: HandlerFunction<
  ExtractWSRequestFrom["PLAY"]
> = async ({ ws, message, server }) => {
  const { room } = requirePlaybackPermission(ws);

  // RTT-aware: wait long enough for the slowest client to receive this
  const serverTimeToExecute = epochNow() + room.getScheduleDelayMs();

  // Update playback state
  room.updatePlaybackSchedulePlay(message, serverTimeToExecute);

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "SCHEDULED_ACTION",
      scheduledAction: message,
      serverTimeToExecute: serverTimeToExecute,
    },
  });
};
