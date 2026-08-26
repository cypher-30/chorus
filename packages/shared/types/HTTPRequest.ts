import { z } from "zod";
import { AudioSourceSchema } from "./basic";

// Legacy upload schema (deprecated)
export const UploadAudioSchema = z.object({
  name: z.string(),
  audioData: z.string(), // base64 encoded audio data
  roomId: z.string(),
});
export type UploadAudioType = z.infer<typeof UploadAudioSchema>;

// R2 Upload URL Request
export const GetUploadUrlSchema = z.object({
  roomId: z.string(),
  fileName: z.string(),
  contentType: z
    .string()
    .refine(
      (type) => type.startsWith("audio/"),
      "Content type must be an audio mime type"
    ),
});
export type GetUploadUrlType = z.infer<typeof GetUploadUrlSchema>;

// R2 Upload URL Response - simplified to only essential fields
export const UploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  publicUrl: z.string().url(),
});
export type UploadUrlResponseType = z.infer<typeof UploadUrlResponseSchema>;

// Upload Complete Request - simplified to only essential fields
export const UploadCompleteSchema = z.object({
  roomId: z.string(),
  originalName: z.string(),
  publicUrl: z.string().url(),
});
export type UploadCompleteType = z.infer<typeof UploadCompleteSchema>;

// Upload Complete Response
export const UploadCompleteResponseSchema = z.object({
  success: z.boolean(),
});
export type UploadCompleteResponseType = z.infer<
  typeof UploadCompleteResponseSchema
>;

// Audio fetch request (unchanged)
export const GetAudioSchema = z.object({
  id: z.string(),
});
export type GetAudioType = z.infer<typeof GetAudioSchema>;

// Default audio fetch response
export const GetDefaultAudioSchema = z.array(AudioSourceSchema);
export type GetDefaultAudioType = z.infer<typeof GetDefaultAudioSchema>;

export const RoomSchema = z.object({
  roomId: z.string(),
  clientCount: z.number(),
  audioSourceCount: z.number(),
  hasSpatialAudio: z.boolean(),
});
export type RoomType = z.infer<typeof RoomSchema>;

export const ActiveRoomTrackSchema = z.object({
  title: z.string(),
  artist: z.string().optional(),
  artworkUrl: z.string().optional(),
});
export type ActiveRoomTrackType = z.infer<typeof ActiveRoomTrackSchema>;

export const ActiveRoomSchema = z.object({
  roomId: z.string(),
  listenerCount: z.number().int().nonnegative(),
  trackCount: z.number().int().nonnegative(),
  currentTrack: ActiveRoomTrackSchema.nullable(),
  hasSpatialAudio: z.boolean(),
  countryCodes: z.array(z.string()),
});
export type ActiveRoomType = z.infer<typeof ActiveRoomSchema>;

export const GetActiveRoomsSchema = z.object({
  totalListeners: z.number().int().nonnegative(),
  rooms: z.array(ActiveRoomSchema),
});
export type GetActiveRoomsType = z.infer<typeof GetActiveRoomsSchema>;
