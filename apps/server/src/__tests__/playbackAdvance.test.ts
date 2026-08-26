import { describe, expect, it, beforeEach, mock } from "bun:test";
import { epochNow } from "@chorus/shared";
import type { Server } from "bun";
import type { WSData } from "../utils/websocket";

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

const mockServer = {
  publish: mock((_topic: string, _payload: string) => 0),
} as unknown as Server<WSData>;

describe("Server-authoritative playback advance", () => {
  beforeEach(async () => {
    sendBroadcastMock.mockClear();
    for (const roomId of globalManager.getRoomIds()) {
      await globalManager.deleteRoom(roomId);
    }
  });

  const setupRoom = (roomId = "advance-room") => {
    const room = globalManager.getOrCreateRoom(roomId);
    room.addAudioSource({ url: "https://r2.test/room-x/a.mp3" });
    room.addAudioSource({ url: "https://r2.test/room-x/b.mp3" });
    room.addAudioSource({ url: "https://r2.test/room-x/c.mp3" });
    room.updatePlaybackSchedulePlay(
      { type: "PLAY", audioSource: "https://r2.test/room-x/a.mp3", trackTimeSeconds: 0 },
      epochNow()
    );
    return room;
  };

  it("advances sequentially to the next track", () => {
    const room = setupRoom();
    const action = room.advancePlayback("https://r2.test/room-x/a.mp3");
    expect(action).toEqual({
      type: "PLAY",
      audioSource: "https://r2.test/room-x/b.mp3",
      trackTimeSeconds: 0,
    });
  });

  it("advances backwards with direction prev (wrapping)", () => {
    const room = setupRoom();
    const action = room.advancePlayback("https://r2.test/room-x/a.mp3", "prev");
    expect(action?.audioSource).toBe("https://r2.test/room-x/c.mp3");
  });

  it("dedupes duplicate advance reports for the same track end", () => {
    const room = setupRoom();
    expect(room.advancePlayback("https://r2.test/room-x/a.mp3")).not.toBeNull();
    // Same report from other clients within the dedupe window: no-op
    expect(room.advancePlayback("https://r2.test/room-x/a.mp3")).toBeNull();
    expect(room.advancePlayback("https://r2.test/room-x/a.mp3")).toBeNull();
  });

  it("ignores stale reports from a track that is no longer current", () => {
    const room = setupRoom();
    const first = room.advancePlayback("https://r2.test/room-x/a.mp3")!;
    room.updatePlaybackSchedulePlay(first, epochNow());
    // A client still reporting the old track's end must not advance again
    expect(room.advancePlayback("https://r2.test/room-x/a.mp3")).toBeNull();
  });

  it("returns null for an empty queue", () => {
    const room = globalManager.getOrCreateRoom("empty-room");
    expect(room.advancePlayback("https://r2.test/room-x/a.mp3")).toBeNull();
  });

  it("shuffle picks a server-decided track different from the current one", () => {
    const room = setupRoom();
    room.setShuffle(true);
    const action = room.advancePlayback("https://r2.test/room-x/a.mp3")!;
    expect(action.audioSource).not.toBe("https://r2.test/room-x/a.mp3");
    expect(["https://r2.test/room-x/b.mp3", "https://r2.test/room-x/c.mp3"]).toContain(
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
      audioSource: "https://r2.test/room-x/a.mp3",
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

    room.addAudioSource({ url: "https://r2.test/room-x/a.mp3" });
    room.addAudioSource({ url: "https://r2.test/room-x/b.mp3" });
    expect(room.getQueueState().queueVersion).toBe(v0 + 2);

    room.setShuffle(true);
    const state = room.getQueueState();
    expect(state.queueVersion).toBe(v0 + 3);
    expect(state.shuffleEnabled).toBe(true);
    expect(state.currentIndex).toBe(-1); // nothing playing yet

    room.updatePlaybackSchedulePlay(
      { type: "PLAY", audioSource: "https://r2.test/room-x/b.mp3", trackTimeSeconds: 0 },
      epochNow()
    );
    expect(room.getQueueState().currentIndex).toBe(1);
  });
});

describe("Pending tracks (spotify: placeholders)", () => {
  const A = "https://r2.test/room-x/a.mp3";
  const C = "https://r2.test/room-x/c.mp3";

  const setupMixedRoom = () => {
    const room = new RoomManager("pending-room");
    room.addAudioSource({ url: A, title: "Synced A" });
    room.addAudioSource({
      url: "spotify:track:P1",
      title: "Pending One",
      artist: "Artist One",
    });
    room.addAudioSource({ url: C, title: "Synced C" });
    room.addAudioSource({ url: "spotify:track:P2", title: "Pending Two" });
    room.updatePlaybackSchedulePlay(
      { type: "PLAY", audioSource: A, trackTimeSeconds: 0 },
      epochNow()
    );
    return room;
  };

  it("advance skips pending entries in both directions", () => {
    const room = setupMixedRoom();
    expect(room.advancePlayback(A)?.audioSource).toBe(C);

    const room2 = setupMixedRoom();
    // prev from A wraps past both pending entries to C
    expect(room2.advancePlayback(A, "prev")?.audioSource).toBe(C);
  });

  it("shuffle advance only picks synced entries", () => {
    for (let i = 0; i < 10; i++) {
      const room = setupMixedRoom();
      room.setShuffle(true);
      expect(room.advancePlayback(A)?.audioSource).toBe(C);
    }
  });

  it("returns null when every entry is pending", () => {
    const room = new RoomManager("all-pending-room");
    room.addAudioSource({ url: "spotify:track:P1", title: "Pending One" });
    expect(room.advancePlayback("spotify:track:P1")).toBeNull();
  });

  it("getPendingTracks lists pending entries with queue indices", () => {
    const room = setupMixedRoom();
    expect(room.getPendingTracks()).toEqual([
      { index: 1, title: "Pending One", artist: "Artist One" },
      { index: 3, title: "Pending Two", artist: undefined },
    ]);
  });

  it("matchAudioToTrack swaps the url in place and keeps metadata", () => {
    const room = setupMixedRoom();
    const before = room.getQueueState().queueVersion;
    const updated = room.matchAudioToTrack(1, "https://r2.test/room-x/p1.mp3")!;
    expect(updated).not.toBeNull();
    expect(updated[1]).toEqual({
      url: "https://r2.test/room-x/p1.mp3",
      title: "Pending One",
      artist: "Artist One",
      spotifyUri: "spotify:track:P1",
    });
    expect(room.getQueueState().queueVersion).toBe(before + 1);
    // Now playable: advance from A reaches the upgraded track
    expect(room.advancePlayback(A)?.audioSource).toBe(
      "https://r2.test/room-x/p1.mp3"
    );
  });

  it("matchAudioToTrack rejects indices that aren't pending", () => {
    const room = setupMixedRoom();
    expect(room.matchAudioToTrack(0, "https://r2.test/x.mp3")).toBeNull(); // synced
    expect(room.matchAudioToTrack(99, "https://r2.test/x.mp3")).toBeNull(); // out of range
  });
});
