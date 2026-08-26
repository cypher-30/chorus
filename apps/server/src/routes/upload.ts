import {
  GetUploadUrlSchema,
  UploadCompleteSchema,
  UploadCompleteResponseType,
  UploadUrlResponseType,
  WSBroadcastType,
} from "@chorus/shared";
import type { Server } from "bun";
import { errorResponse, jsonResponse } from "../utils/responses";
import { globalManager } from "../managers";
import {
  generateAudioFileName,
  generatePresignedUploadUrl,
  getPublicAudioUrl,
  getQueueKey,
  uploadJSON,
} from "../lib/r2";
import type { WSData } from "../utils/websocket";

export const handleGetPresignedURL = async (req: Request) => {
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }
  try {
    const parsed = GetUploadUrlSchema.safeParse(await req.json());
    if (!parsed.success) {
      return errorResponse("roomId, fileName and audio/* contentType required", 400);
    }
    const { roomId, fileName, contentType } = parsed.data;
    const uniqueFileName = generateAudioFileName(fileName);
    const uploadUrl = await generatePresignedUploadUrl(
      roomId,
      uniqueFileName,
      contentType
    );
    const response: UploadUrlResponseType = {
      uploadUrl,
      publicUrl: getPublicAudioUrl(roomId, uniqueFileName),
    };
    return jsonResponse(response);
  } catch (error) {
    console.error("Failed to generate presigned upload URL:", error);
    return errorResponse("Failed to generate upload URL", 500);
  }
};

export const handleUploadComplete = async (
  req: Request,
  server: Server<WSData>
) => {
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }
  try {
    const parsed = UploadCompleteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return errorResponse("roomId, originalName and publicUrl required", 400);
    }
    const { roomId, publicUrl } = parsed.data;

    // Only accept URLs that point into this room's R2 prefix
    if (!publicUrl.startsWith(getPublicAudioUrl(roomId, ""))) {
      return errorResponse("publicUrl does not belong to this room", 400);
    }

    const room = globalManager.getRoom(roomId);
    if (!room) return errorResponse("Room not found", 404);

    const updated = room.addAudioSource({ url: publicUrl });
    const message: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: { type: "SET_AUDIO_SOURCES", ...room.getQueueState() },
    };
    server.publish(roomId, JSON.stringify(message));
    await uploadJSON(getQueueKey(roomId), updated);

    const response: UploadCompleteResponseType = { success: true };
    return jsonResponse(response);
  } catch (error) {
    console.error("Failed to complete upload:", error);
    return errorResponse("Failed to complete upload", 500);
  }
};
