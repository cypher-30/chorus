import { epochNow, ExtractWSRequestFrom } from "@chorus/shared";
import { sendBroadcast } from "../../utils/responses";
import { requirePlaybackPermission } from "../middlewares";
import { HandlerFunction } from "../types";

export const handlePlaybackAdvance: HandlerFunction<
  ExtractWSRequestFrom["PLAYBACK_ADVANCE"]
> = async ({ ws, message, server }) => {
  const { room } = requirePlaybackPermission(ws);

  // The room decides the next track once; duplicate/stale intents from other
  // clients reporting the same track end are dropped
  const playAction = room.advancePlayback(message.audioSource, message.direction);
  if (!playAction) return;

  const serverTimeToExecute = epochNow() + room.getScheduleDelayMs();
  room.updatePlaybackSchedulePlay(playAction, serverTimeToExecute);

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "SCHEDULED_ACTION",
      scheduledAction: playAction,
      serverTimeToExecute,
    },
  });

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
