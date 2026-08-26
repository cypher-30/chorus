import { jsonResponse, errorResponse, corsHeaders } from "../utils/responses";
import { globalManager } from "../managers";
import { Server } from "bun";
import {
  AudioSourceSchema,
  RoomIdSchema,
  WSBroadcastType,
} from "@chorus/shared";
import { z } from "zod";
import { uploadJSON, getQueueKey } from "../lib/r2";
import { checkRateLimit, getRequestIp } from "../utils/rateLimit";

const QueueSetSchema = z.object({
  roomId: RoomIdSchema,
  sources: z.array(AudioSourceSchema),
});

const QueueAddSchema = z.object({
  roomId: RoomIdSchema,
  source: AudioSourceSchema,
});

const QUEUE_RATE_LIMIT_WINDOW_MS = 10_000;
const QUEUE_RATE_LIMIT_MAX = 40;

const getRateLimitError = (retryAfterSeconds: number) =>
  new Response("Too many queue updates", {
    status: 429,
    headers: {
      ...corsHeaders,
      "Retry-After": String(retryAfterSeconds),
    },
  });

const checkQueueRateLimit = (req: Request, server: Server, roomId: string) => {
  const ip = getRequestIp(req, server);
  return checkRateLimit({
    key: `queue:${roomId}:${ip}`,
    limit: QUEUE_RATE_LIMIT_MAX,
    windowMs: QUEUE_RATE_LIMIT_WINDOW_MS,
  });
};

export async function handleQueueSet(req: Request, server: Server) {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const parsed = QueueSetSchema.safeParse(await req.json());
    if (!parsed.success) {
      return errorResponse("roomId (6 digits) and sources required", 400);
    }
    const { roomId, sources } = parsed.data;

    const rateLimitResult = checkQueueRateLimit(req, server, roomId);
    if (!rateLimitResult.allowed) {
      return getRateLimitError(rateLimitResult.retryAfterSeconds);
    }

    const room = globalManager.getRoom(roomId);
    if (!room) return errorResponse("Room not found", 404);
    room.setAudioSources(sources);
    const message: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: { type: "SET_AUDIO_SOURCES", ...room.getQueueState() },
    };
    server.publish(roomId, JSON.stringify(message));
    // Persist to R2
    await uploadJSON(getQueueKey(roomId), sources);
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse("Failed to set queue", 500);
  }
}

export async function handleQueueAdd(req: Request, server: Server) {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const parsed = QueueAddSchema.safeParse(await req.json());
    if (!parsed.success) {
      return errorResponse("roomId (6 digits) and source required", 400);
    }
    const { roomId, source } = parsed.data;

    const rateLimitResult = checkQueueRateLimit(req, server, roomId);
    if (!rateLimitResult.allowed) {
      return getRateLimitError(rateLimitResult.retryAfterSeconds);
    }

    const room = globalManager.getRoom(roomId);
    if (!room) return errorResponse("Room not found", 404);
    const updated = room.addAudioSource(source);
    const message: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: { type: "SET_AUDIO_SOURCES", ...room.getQueueState() },
    };
    server.publish(roomId, JSON.stringify(message));
    // Persist to R2
    await uploadJSON(getQueueKey(roomId), updated);
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse("Failed to add to queue", 500);
  }
}
