import { describe, expect, it, beforeEach, mock } from "bun:test";
import { epochNow } from "@chorus/shared";
import { Server } from "bun";

// Mock broadcast/unicast so handlers don't need a real Bun server
const sendBroadcastMock = mock(() => {});
mock.module("../utils/responses", () => ({
  sendBroadcast: sendBroadcastMock,
  sendUnicast: mock(() => {}),
  corsHeaders: {},
  jsonResponse: mock(() => new Response()),
  errorResponse: mock(() => new Response()),
}));

// Mock R2 so nothing touches the network
mock.module("../lib/r2", () => ({
  downloadJSON: mock(async () => null),
  uploadJSON: mock(async () => {}),
  deleteObjectsWithPrefix: mock(async () => ({ deletedCount: 0 })),
  validateAudioFileExists: mock(async () => true),
  getQueueKey: (roomId: string) => `room-${roomId}/queue.json`,
}));

import { globalManager } from "../managers/GlobalManager";
import { RoomManager } from "../managers/RoomManager";
import { handlePlaybackAdvance } from "../websocket/handlers/playbackAdvance";
import { requirePlaybackPermission } from "../websocket/middlewares";
import { SCHEDULE_TIME_MS } from "../config";

const makeWs = (roomId: string, clientId: string, username = "user") =>
  ({
    data: { roomId, clientId, username },
    subscribe: mock(() => {}),
    send: mock(() => {}),
  }) as any;

const mockServer = { publish: mock(() => {}) } as unknown as Server;

describe("Server-authoritative playback advance", () => {
  beforeEach(async () => {
    sendBroadcastMock.mockClear();
    for (const roomId of globalManager.getRoomIds()) {
      await globalManager.deleteRoom(roomId);
    }
  });

  const setupRoom = (roomId = "advance-room") => {
    const room = globalManager.getOrCreateRoom(roomId);
    room.addAudioSource({ url: "spotify:track:A" });
    room.addAudioSource({ url: "spotify:track:B" });
    room.addAudioSource({ url: "spotify:track:C" });
    room.updatePlaybackSchedulePlay(
      { type: "PLAY", audioSource: "spotify:track:A", trackTimeSeconds: 0 },
      epochNow()
    );
    return room;
  };

  it("advances sequentially to the next track", () => {
    const room = setupRoom();
    const action = room.advancePlayback("spotify:track:A");
    expect(action).toEqual({
      type: "PLAY",
      audioSource: "spotify:track:B",
      trackTimeSeconds: 0,
    });
  });

  it("advances backwards with direction prev (wrapping)", () => {
    const room = setupRoom();
    const action = room.advancePlayback("spotify:track:A", "prev");
    expect(action?.audioSource).toBe("spotify:track:C");
  });

  it("dedupes duplicate advance reports for the same track end", () => {
    const room = setupRoom();
    expect(room.advancePlayback("spotify:track:A")).not.toBeNull();
    // Same report from other clients within the dedupe window: no-op
    expect(room.advancePlayback("spotify:track:A")).toBeNull();
    expect(room.advancePlayback("spotify:track:A")).toBeNull();
  });

  it("ignores stale reports from a track that is no longer current", () => {
    const room = setupRoom();
    const first = room.advancePlayback("spotify:track:A")!;
    room.updatePlaybackSchedulePlay(first, epochNow());
    // A client still reporting the old track's end must not advance again
    expect(room.advancePlayback("spotify:track:A")).toBeNull();
  });

  it("returns null for an empty queue", () => {
    const room = globalManager.getOrCreateRoom("empty-room");
    expect(room.advancePlayback("spotify:track:A")).toBeNull();
  });

  it("shuffle picks a server-decided track different from the current one", () => {
    const room = setupRoom();
    room.setShuffle(true);
    const action = room.advancePlayback("spotify:track:A")!;
    expect(action.audioSource).not.toBe("spotify:track:A");
    expect(["spotify:track:B", "spotify:track:C"]).toContain(
      action.audioSource
    );
  });

  it("broadcasts exactly one PLAY for N concurrent advance intents", async () => {
    const roomId = "handler-room";
    const room = setupRoom(roomId);
    room.addClient(makeWs(roomId, "c1"));
    room.addClient(makeWs(roomId, "c2"));
    room.addClient(makeWs(roomId, "c3"));

    const message = {
      type: "PLAYBACK_ADVANCE",
      audioSource: "spotify:track:A",
      direction: "next",
    } as any;
    for (const clientId of ["c1", "c2", "c3"]) {
      await handlePlaybackAdvance({
        ws: makeWs(roomId, clientId),
        message,
        server: mockServer,
      });
    }

    const playBroadcasts = sendBroadcastMock.mock.calls.filter(
      (call: any[]) =>
        call[0]?.message?.type === "SCHEDULED_ACTION" &&
        call[0]?.message?.scheduledAction?.type === "PLAY"
    );
    expect(playBroadcasts).toHaveLength(1);
  });
});

describe("Playback permissions", () => {
  beforeEach(async () => {
    for (const roomId of globalManager.getRoomIds()) {
      await globalManager.deleteRoom(roomId);
    }
  });

  it("blocks non-admins when the room is ADMIN_ONLY", () => {
    const roomId = "perm-room";
    const room = globalManager.getOrCreateRoom(roomId);
    room.addClient(makeWs(roomId, "admin-client")); // first client = admin
    room.addClient(makeWs(roomId, "member-client"));
    room.setPlaybackControls("ADMIN_ONLY");

    expect(() =>
      requirePlaybackPermission(makeWs(roomId, "member-client"))
    ).toThrow();
    expect(() =>
      requirePlaybackPermission(makeWs(roomId, "admin-client"))
    ).not.toThrow();
  });

  it("allows everyone when the room is EVERYONE", () => {
    const roomId = "perm-room-2";
    const room = globalManager.getOrCreateRoom(roomId);
    room.addClient(makeWs(roomId, "admin-client"));
    room.addClient(makeWs(roomId, "member-client"));

    expect(() =>
      requirePlaybackPermission(makeWs(roomId, "member-client"))
    ).not.toThrow();
  });
});

describe("RTT-aware scheduling", () => {
  it("floors at SCHEDULE_TIME_MS with no RTT data", () => {
    const room = new RoomManager("rtt-room-1");
    expect(room.getScheduleDelayMs()).toBe(SCHEDULE_TIME_MS);
  });

  it("scales with the slowest client's RTT plus margin, capped at 1s", () => {
    const roomId = "rtt-room-2";
    const room = globalManager.getOrCreateRoom(roomId);
    room.addClient(makeWs(roomId, "fast"));
    room.addClient(makeWs(roomId, "slow"));

    room.setClientRTT("fast", 40);
    room.setClientRTT("slow", 400);
    expect(room.getScheduleDelayMs()).toBe(500); // 400 + 100 margin

    room.setClientRTT("slow", 5000);
    expect(room.getScheduleDelayMs()).toBe(1000); // capped
  });
});

describe("Queue state versioning", () => {
  it("bumps queueVersion on every mutation and tracks currentIndex", () => {
    const room = new RoomManager("version-room");
    const v0 = room.getQueueState().queueVersion;

    room.addAudioSource({ url: "spotify:track:A" });
    room.addAudioSource({ url: "spotify:track:B" });
    expect(room.getQueueState().queueVersion).toBe(v0 + 2);

    room.setShuffle(true);
    const state = room.getQueueState();
    expect(state.queueVersion).toBe(v0 + 3);
    expect(state.shuffleEnabled).toBe(true);
    expect(state.currentIndex).toBe(-1); // nothing playing yet

    room.updatePlaybackSchedulePlay(
      { type: "PLAY", audioSource: "spotify:track:B", trackTimeSeconds: 0 },
      epochNow()
    );
    expect(room.getQueueState().currentIndex).toBe(1);
  });
});
