import { z } from "zod";
import {
  PauseActionSchema,
  PlayActionSchema,
  PlaybackControlsPermissionsEnum,
} from "./WSRequest";
import { AudioSourceSchema, PositionSchema } from "./basic";

// ROOM EVENTS

// Server-side client record (includes the live ws handle — never broadcast)
const ClientSchema = z.object({
  username: z.string(),
  clientId: z.string(),
  ws: z.any(),
  rtt: z.number().nonnegative().default(0), // Round-trip time in milliseconds
  countryCode: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  position: PositionSchema,
  lastNtpResponse: z.number().default(0), // Last NTP response timestamp
  isAdmin: z.boolean().default(false), // Admin status
  // Set once a client drags itself to a position via MOVE_CLIENT; excludes
  // it from positionClientsInCircle's auto-layout until reset. Server-only —
  // ClientDTOSchema below deliberately omits this, so it never reaches the
  // wire.
  hasManualPosition: z.boolean().default(false),
});
export type ClientType = z.infer<typeof ClientSchema>;

// Wire-safe client shape sent in CLIENT_CHANGE broadcasts
export const ClientDTOSchema = z.object({
  username: z.string(),
  clientId: z.string(),
  rtt: z.number().nonnegative().default(0),
  position: PositionSchema,
  isAdmin: z.boolean().default(false),
});
export type ClientDTOType = z.infer<typeof ClientDTOSchema>;

const ClientChangeMessageSchema = z.object({
  type: z.literal("CLIENT_CHANGE"),
  clients: z.array(ClientDTOSchema),
  playbackControlsPermissions: PlaybackControlsPermissionsEnum,
});

// Set audio sources. currentIndex points at the room's current track within
// sources (-1 when nothing is playing); queueVersion increments on every
// server-side queue mutation.
const SetAudioSourcesSchema = z.object({
  type: z.literal("SET_AUDIO_SOURCES"),
  sources: z.array(AudioSourceSchema),
  currentIndex: z.number().int().default(-1),
  queueVersion: z.number().int().default(0),
  shuffleEnabled: z.boolean().default(false),
});
export type SetAudioSourcesType = z.infer<typeof SetAudioSourcesSchema>;

const RoomEventSchema = z.object({
  type: z.literal("ROOM_EVENT"),
  event: z.discriminatedUnion("type", [
    ClientChangeMessageSchema,
    SetAudioSourcesSchema,
  ]),
});

// SCHEDULED ACTIONS
const SpatialConfigSchema = z.object({
  type: z.literal("SPATIAL_CONFIG"),
  gains: z.record(
    z.string(),
    z.object({ gain: z.number().min(0).max(1), rampTime: z.number() })
  ),
  listeningSource: PositionSchema,
});

export type SpatialConfigType = z.infer<typeof SpatialConfigSchema>;

const StopSpatialAudioSchema = z.object({
  type: z.literal("STOP_SPATIAL_AUDIO"),
});
export type StopSpatialAudioType = z.infer<typeof StopSpatialAudioSchema>;

export const ScheduledActionSchema = z.object({
  type: z.literal("SCHEDULED_ACTION"),
  serverTimeToExecute: z.number(),
  scheduledAction: z.discriminatedUnion("type", [
    PlayActionSchema,
    PauseActionSchema,
    SpatialConfigSchema,
    StopSpatialAudioSchema,
  ]),
});

// Export both broadcast types
export const WSBroadcastSchema = z.discriminatedUnion("type", [
  ScheduledActionSchema,
  RoomEventSchema,
]);
export type WSBroadcastType = z.infer<typeof WSBroadcastSchema>;
