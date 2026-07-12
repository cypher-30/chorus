import { z } from "zod";

export const GRID = {
  SIZE: 100,
  ORIGIN_X: 50,
  ORIGIN_Y: 50,
  CLIENT_RADIUS: 25,
} as const;

export const PositionSchema = z.object({
  x: z.number().min(0).max(GRID.SIZE),
  y: z.number().min(0).max(GRID.SIZE),
});
export type PositionType = z.infer<typeof PositionSchema>;

// url is both identity and type discriminator: `spotify:track:ID` = pending
// (metadata only, needs a real audio file), http R2 URL = synced/playable.
// Metadata fields are optional so legacy `{ url }` queues still parse.
export const AudioSourceSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  artist: z.string().optional(),
  artworkUrl: z.string().optional(),
  durationMs: z.number().optional(),
  // Original Spotify URI, preserved after `url` flips to an R2 URL
  spotifyUri: z.string().optional(),
});
export type AudioSourceType = z.infer<typeof AudioSourceSchema>;

// Room codes are always 6 digits (see client-side validateFullRoomId)
export const RoomIdSchema = z.string().regex(/^\d{6}$/);
