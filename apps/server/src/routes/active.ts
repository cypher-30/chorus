import { GetActiveRoomsType } from "@chorus/shared";
import { globalManager } from "../managers";
import { jsonResponse } from "../utils/responses";

export const getActiveRooms = (_req: Request) => {
  const rooms = globalManager
    .getRooms()
    .map(([, room]) => {
      const queueState = room.getQueueState();
      const countryCodes = Array.from(
        new Set(
          room
            .getClients()
            .map((client) => client.countryCode)
            .filter(
              (code): code is string =>
                !!code && /^[A-Z]{2}$/.test(code.toUpperCase())
            )
            .map((code) => code.toUpperCase())
        )
      ).slice(0, 6);
      const currentSource =
        queueState.currentIndex >= 0
          ? queueState.sources[queueState.currentIndex]
          : null;

      return {
        roomId: room.getRoomId(),
        listenerCount: room.getNumClients(),
        trackCount: queueState.sources.length,
        currentTrack: currentSource
          ? {
              title: currentSource.title ?? "Unknown Track",
              artist: currentSource.artist,
              artworkUrl: currentSource.artworkUrl,
            }
          : null,
        hasSpatialAudio: room.getStats().hasSpatialAudio,
        countryCodes,
      };
    })
    .filter((room) => room.listenerCount > 0)
    .sort((a, b) => {
      if (b.listenerCount !== a.listenerCount) {
        return b.listenerCount - a.listenerCount;
      }
      return b.trackCount - a.trackCount;
    });

  const payload: GetActiveRoomsType = {
    totalListeners: rooms.reduce((sum, room) => sum + room.listenerCount, 0),
    rooms,
  };

  return jsonResponse(payload);
};