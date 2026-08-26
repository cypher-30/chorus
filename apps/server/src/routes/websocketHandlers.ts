import {
  ClientActionEnum,
  epochNow,
  WSBroadcastType,
  WSRequestSchema,
} from "@chorus/shared";
import { Server, ServerWebSocket } from "bun";
import { globalManager } from "../managers";
import { sendBroadcast, sendUnicast } from "../utils/responses";
import { WSData } from "../utils/websocket";
import { dispatchMessage } from "../websocket/dispatch";

export const createClientUpdate = (roomId: string) => {
  const room = globalManager.getRoom(roomId);
  const message: WSBroadcastType = {
    type: "ROOM_EVENT",
    event: {
      type: "CLIENT_CHANGE",
      clients: room ? room.getClientDTOs() : [],
      playbackControlsPermissions: room
        ? room.getPlaybackControlsPermissions()
        : "EVERYONE",
    },
  };
  return message;
};

export const handleOpen = async (
  ws: ServerWebSocket<WSData>,
  server: Server
) => {
  console.log(
    `WebSocket connection opened for user ${ws.data.username} in room ${ws.data.roomId}`
  );
  sendUnicast({
    ws,
    message: {
      type: "SET_CLIENT_ID",
      clientId: ws.data.clientId,
    },
  });

  const { roomId } = ws.data;
  ws.subscribe(roomId);

  const room = globalManager.getOrCreateRoom(roomId);
  room.addClient(ws);

  // Restore any persisted queue before reading state, so the first client
  // into a cold room receives it (no-op when the room already has sources)
  await room.restoreQueueIfAvailable();

  // Always tell the newly joined client the current queue state, even when
  // empty — a client reconnecting to a roomId whose room was cleaned up and
  // recreated (fresh RoomManager, empty audioSources) needs an explicit
  // "queue is empty now" message just as much as one joining a populated
  // room does, so it can drop any stale local queue/cache state instead of
  // silently keeping it. (This doesn't fully close that gap: a reconnect
  // without a full page reload keeps the client's local queueVersion,
  // and the fresh room starts back at 0, so handleSetAudioSources's
  // out-of-order guard on the client still drops this message in that
  // specific case — see PLAN.md's Known follow-ups.)
  const { audioSources } = room.getState();
  console.log(
    `Sending ${audioSources.length} audio source(s) to newly joined client ${ws.data.username}`
  );
  const audioSourcesMessage: WSBroadcastType = {
    type: "ROOM_EVENT",
    event: {
      type: "SET_AUDIO_SOURCES",
      ...room.getQueueState(),
    },
  };
  // Send directly to the WebSocket since this is a broadcast-type message sent to a single client
  ws.send(JSON.stringify(audioSourcesMessage));

  const message = createClientUpdate(roomId);
  sendBroadcast({ server, roomId, message });
};

export const handleMessage = async (
  ws: ServerWebSocket<WSData>,
  message: string | Buffer,
  server: Server
) => {
  const t1 = epochNow(); // Always calculate this immediately
  const { roomId, username } = ws.data;

  try {
    const parsedData = JSON.parse(message.toString());
    const parsedMessage = WSRequestSchema.parse(parsedData);

    if (parsedMessage.type !== ClientActionEnum.enum.NTP_REQUEST) {
      console.log(
        `[Room: ${roomId}] | User: ${username} | Message: ${JSON.stringify(
          parsedMessage
        )}`
      );
    }

    if (parsedMessage.type === ClientActionEnum.enum.NTP_REQUEST) {
      // Manually mutate the message to include the t1 timestamp
      parsedMessage.t1 = t1;
    }

    // Delegate to type-safe dispatcher
    await dispatchMessage({ ws, message: parsedMessage, server });
  } catch (error) {
    console.error("Invalid message format:", error);
    ws.send(
      JSON.stringify({ type: "ERROR", message: "Invalid message format" })
    );
  }
};

export const handleClose = async (
  ws: ServerWebSocket<WSData>,
  server: Server
) => {
  try {
    console.log(
      `WebSocket connection closed for user ${ws.data.username} in room ${ws.data.roomId}`
    );

    const { roomId, clientId } = ws.data;
    const room = globalManager.getRoom(roomId);

    if (room) {
      room.removeClient(clientId, ws);

      // Schedule cleanup for rooms with no active connections
      if (!room.hasActiveConnections()) {
        room.stopSpatialAudio();
        globalManager.scheduleRoomCleanup(roomId);
      }
    }

    const message = createClientUpdate(roomId);
    ws.unsubscribe(roomId);
    server.publish(roomId, JSON.stringify(message));
  } catch (error) {
    console.error(
      `Error handling WebSocket close for ${ws.data?.username}:`,
      error
    );
  }
};
