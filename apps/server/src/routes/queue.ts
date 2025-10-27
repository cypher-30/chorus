import { jsonResponse, errorResponse } from "../utils/responses";
import { globalManager } from "../managers";
import { Server } from "bun";
import { AudioSourceType, WSBroadcastType } from "@chorus/shared";
import { uploadJSON } from "../lib/r2";

export async function handleQueueSet(req: Request, server: Server) {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { roomId, sources } = (await req.json()) as {
      roomId: string;
      sources: AudioSourceType[];
    };
    if (!roomId || !Array.isArray(sources)) {
      return errorResponse("roomId and sources required", 400);
    }
    const room = globalManager.getOrCreateRoom(roomId);
    room.setAudioSources(sources);
    const message: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: { type: "SET_AUDIO_SOURCES", sources },
    };
    server.publish(roomId, JSON.stringify(message));
    // Persist to R2
    await uploadJSON(`rooms/${roomId}/queue.json`, updated);
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse("Failed to set queue", 500);
  }
}

export async function handleQueueAdd(req: Request, server: Server) {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { roomId, source } = (await req.json()) as {
      roomId: string;
      source: AudioSourceType;
    };
    if (!roomId || !source?.url) return errorResponse("roomId and source required", 400);
    const room = globalManager.getOrCreateRoom(roomId);
    const updated = room.addAudioSource(source);
    const message: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: { type: "SET_AUDIO_SOURCES", sources: updated },
    };
    server.publish(roomId, JSON.stringify(message));
    // Persist to R2
    await uploadJSON(`rooms/${roomId}/queue.json`, updated);
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse("Failed to add to queue", 500);
  }
}
