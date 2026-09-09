import { RoomIdSchema } from "@chorus/shared";
import type { Server } from "bun";
import { z } from "zod";
import { globalManager } from "../managers";
import { telegramState } from "../telegram/bot";
import { getConfiguredMusicDirs, isFolderImportConfigured } from "../lib/folderImport";
import { getLibraryStats } from "../lib/library";
import { isYtDlpAutoFetchEnabled, isYtDlpAvailable } from "../lib/ytdlp";
import {
  findPendingTrackByUri,
  getRoomResolverTrackStates,
  getYtDlpQueueStats,
  pruneRoomResolverTrackStates,
  resolvePendingAndPublish,
  tryYtDlpInBackground,
} from "../lib/resolver";
import { errorResponse, jsonResponse } from "../utils/responses";
import type { WSData } from "../utils/websocket";

const RetryPendingTrackSchema = z.object({
  roomId: RoomIdSchema,
  clientId: z.string().min(1),
  pendingUri: z.string().startsWith("spotify:"),
});

// Surfaced verbatim in the QueuePanel Retry toast (retryPendingTrack in
// apps/client/src/lib/api.ts reads response.text() as the error message).
// Named explicitly instead of a bare "Room not found" so this can't be
// mistaken for a route-wiring/reload issue again: `globalManager` is a
// module-scope singleton (see GlobalManager.ts), so a `bun --hot` reload
// re-evaluates it into a fresh, empty room map while already-open
// WebSocket connections survive untouched — confirmed by reproduction
// (2026-09-09): after touching a server file, `/active-rooms` dropped to
// zero rooms while a still-open socket kept its room's WS session alive.
const ROOM_NOT_FOUND_MESSAGE =
  "Room not found (it may have been cleaned up, or the server was hot-reloaded since you joined — try refreshing the room)";

/**
 * Reports which steps of the resolver chain (lib/resolver.ts) are actually
 * live, so the UI can say why a Spotify pick is stuck on "Needs audio"
 * instead of leaving it unexplained — mirrors routes/telegram.ts's
 * `/telegram/status` for the same purpose.
 */
export const handleIngestStatus = async (req: Request) => {
  const stats = getLibraryStats();
  const ytdlpEnabled = isYtDlpAutoFetchEnabled();
  const ytdlpAvailable = isYtDlpAvailable();
  const ytdlpQueue = getYtDlpQueueStats();

  const url = new URL(req.url);
  const requestedRoomId = url.searchParams.get("roomId") ?? undefined;
  const parsedRoomId = requestedRoomId
    ? RoomIdSchema.safeParse(requestedRoomId)
    : null;

  let roomResolver:
    | {
        roomId: string;
        byPendingUri: Record<string, {
          status: "queued" | "retrying" | "fetching" | "failed";
          updatedAt: number;
          attempts: number;
          message?: string;
        }>;
      }
    | undefined;

  if (parsedRoomId?.success) {
    const roomId = parsedRoomId.data;
    const room = globalManager.getRoom(roomId);

    if (room) {
      const pendingUris = room
        .getPendingTracks()
        .map((pending) => {
          const source = room.getState().audioSources[pending.index];
          return source?.spotifyUri ?? source?.url;
        })
        .filter((uri): uri is string => Boolean(uri && uri.startsWith("spotify:")));

      pruneRoomResolverTrackStates(roomId, pendingUris);
      const tracked = getRoomResolverTrackStates(roomId);
      const byPendingUri = Object.fromEntries(
        pendingUris.map((pendingUri) => {
          const state = tracked[pendingUri];
          if (state) return [pendingUri, state];
          if (!ytdlpEnabled) {
            return [pendingUri, {
              status: "failed" as const,
              updatedAt: Date.now(),
              attempts: 0,
              message: "Auto-fetch disabled; provide audio via Telegram or upload",
            }];
          }
          return [pendingUri, {
            status: "queued" as const,
            updatedAt: Date.now(),
            attempts: 0,
          }];
        })
      );

      roomResolver = {
        roomId,
        byPendingUri,
      };
    }
  }

  return jsonResponse({
    library: {
      trackCount: stats.trackCount,
      totalBytes: stats.totalBytes,
    },
    folderImport: {
      configured: isFolderImportConfigured(),
      dirs: getConfiguredMusicDirs(),
    },
    ytdlp: {
      binariesAvailable: ytdlpAvailable,
      autoFetchEnabled: ytdlpEnabled,
      reason: ytdlpAvailable
        ? ytdlpEnabled
          ? "enabled"
          : "binaries_found_but_auto_fetch_disabled"
        : "yt-dlp_or_ffmpeg_not_on_path",
      queue: ytdlpQueue,
    },
    telegram: {
      enabled: telegramState.ready,
      tokenConfigured: telegramState.tokenConfigured,
      botUsername: telegramState.botUsername,
    },
    roomResolver,
  });
};

export const handleIngestRetry = async (
  req: Request,
  server: Server<WSData>
) => {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const parsed = RetryPendingTrackSchema.safeParse(await req.json());
    if (!parsed.success) {
      return errorResponse("roomId, clientId and spotify pendingUri are required", 400);
    }

    const { roomId, clientId, pendingUri } = parsed.data;
    const room = globalManager.getRoom(roomId);
    if (!room) return errorResponse(ROOM_NOT_FOUND_MESSAGE, 404);
    if (!room.getClient(clientId)) {
      return errorResponse("Client is not connected to this room", 403);
    }

    const origin = new URL(req.url).origin;

    // Re-run instant library/folder matching first in case bytes arrived since
    // the last failed fetch attempt.
    await resolvePendingAndPublish(roomId, server, origin);

    const currentRoom = globalManager.getRoom(roomId);
    if (!currentRoom) return errorResponse(ROOM_NOT_FOUND_MESSAGE, 404);

    const pendingTrack = findPendingTrackByUri(currentRoom, pendingUri);

    if (!pendingTrack) {
      return jsonResponse({ ok: true, status: "already_resolved" });
    }

    const pendingSource = currentRoom.getState().audioSources[pendingTrack.index];
    if (!pendingSource?.url.startsWith("spotify:")) {
      return jsonResponse({ ok: true, status: "already_resolved" });
    }

    const retryStatus = tryYtDlpInBackground(
      roomId,
      server,
      {
        index: pendingTrack.index,
        title: pendingSource.title ?? pendingSource.url,
        artist: pendingSource.artist,
      },
      pendingSource.spotifyUri ?? pendingSource.url,
      origin,
      "retrying"
    );

    if (retryStatus === "disabled") {
      return errorResponse("Auto-fetch is disabled", 409);
    }

    return jsonResponse({
      ok: true,
      status: retryStatus,
    });
  } catch {
    return errorResponse("Failed to retry pending track", 500);
  }
};
