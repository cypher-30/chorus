import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BackupManager } from "../managers/BackupManager";
import { globalManager } from "../managers/GlobalManager";

// Mock the R2 operations
mock.module("../lib/r2", () => ({
  deleteObjectsWithPrefix: mock(async () => ({ deletedCount: 0 })),
  uploadJSON: mock(async () => {}),
  downloadJSON: mock(async (key: string) => {
    // Return test backup data
    return {
      timestamp: Date.now() - 60000, // 1 minute ago
      data: {
        rooms: {
          "test-room-1": {
            clients: [{ clientId: "ghost-1", username: "user1" }],
            audioSources: [
              { id: "audio-1", url: "test.mp3", name: "Test Audio" },
            ],
          },
          "test-room-2": {
            clients: [],
            audioSources: [],
          },
        },
      },
    };
  }),
  getLatestFileWithPrefix: mock(async () => "state-backup/backup-test.json"),
  getSortedFilesWithPrefix: mock(async () => []),
  deleteObject: mock(async () => {}),
  // Small delay simulates the real R2 round-trip, giving tests a window to
  // interleave a concurrent queue.json restore mid-validation (see the
  // "closes the TOCTOU" test below).
  validateAudioFileExists: mock(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
    return true;
  }),
  cleanupOrphanedRooms: mock(async () => ({
    orphanedRooms: [],
    totalRooms: 0,
    totalFiles: 0,
  })),
}));

describe("Restore Cleanup", () => {
  beforeEach(async () => {
    // Clear all rooms before each test
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      await globalManager.deleteRoom(roomId);
    }
  });

  it("should schedule cleanup for restored rooms with no active connections", async () => {
    let cleanupScheduled = false;
    let cleanupRoomId = "";

    // Spy on room cleanup scheduling
    const originalScheduleCleanup =
      globalManager.getOrCreateRoom("test").scheduleCleanup;
    globalManager.getOrCreateRoom("test").scheduleCleanup = function (
      callback,
      delay
    ) {
      cleanupScheduled = true;
      cleanupRoomId = this.getRoomId();
      // Don't actually schedule the timer in tests
    };

    // Restore state
    const restored = await BackupManager.restoreState();
    expect(restored).toBe(true);

    // Check that rooms were created
    expect(globalManager.hasRoom("test-room-1")).toBe(true);
    expect(globalManager.hasRoom("test-room-2")).toBe(true);

    // Check that both rooms have no active connections
    const room1 = globalManager.getRoom("test-room-1")!;
    const room2 = globalManager.getRoom("test-room-2")!;
    expect(room1.hasActiveConnections()).toBe(false);
    expect(room2.hasActiveConnections()).toBe(false);

    // Verify audio sources were restored
    expect(room1.getState().audioSources.length).toBe(1);
    expect(room2.getState().audioSources.length).toBe(0);
  });

  it("should not have active connections for restored rooms", async () => {
    // Restore state
    await BackupManager.restoreState();

    const room = globalManager.getRoom("test-room-1")!;

    // Room should exist but have no active connections
    expect(room).toBeDefined();
    expect(room.hasActiveConnections()).toBe(false);

    // Even though the backup had a client, it's just a ghost
    expect(room.getClients().length).toBe(0);
  });

  it("should cancel cleanup when a real client connects to restored room", async () => {
    // Restore state
    await BackupManager.restoreState();

    const room = globalManager.getRoom("test-room-1")!;
    let cleanupCalled = false;

    // Schedule cleanup manually to test cancellation
    room.scheduleCleanup(async () => {
      cleanupCalled = true;
    }, 100); // Short delay for testing

    // Simulate a real client connecting
    const mockWs = {
      data: {
        username: "realuser",
        clientId: "real-client-1",
        roomId: "test-room-1",
      },
      readyState: 1, // OPEN
      subscribe: mock(() => {}),
      send: mock(() => {}),
    };

    room.addClient(mockWs as any);

    // Wait to ensure cleanup would have fired if not cancelled
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Cleanup should not have been called
    expect(cleanupCalled).toBe(false);

    // Room should now have an active connection
    expect(room.hasActiveConnections()).toBe(true);
  });

  it("should execute cleanup for abandoned restored rooms", async () => {
    // Restore state
    await BackupManager.restoreState();

    const room = globalManager.getRoom("test-room-1")!;
    let cleanupCalled = false;

    // Schedule cleanup with short delay for testing
    room.scheduleCleanup(async () => {
      cleanupCalled = true;
      await room.cleanup();
      await globalManager.deleteRoom("test-room-1");
    }, 100);

    // Wait for cleanup to execute
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Cleanup should have been called
    expect(cleanupCalled).toBe(true);

    // Room should be deleted
    expect(globalManager.hasRoom("test-room-1")).toBe(false);
  });

  it("should not overwrite a room's queue that was already populated before restore runs", async () => {
    // Simulate handleOpen's queue.json restore (or a client adding a track)
    // winning the race against BackupManager.restoreState, which runs
    // unawaited at server startup (index.ts).
    const room = globalManager.getOrCreateRoom("test-room-1");
    room.setAudioSources([{ url: "https://example.com/already-here.mp3" }]);

    const restored = await BackupManager.restoreState();
    expect(restored).toBe(true);

    // The pre-existing queue must survive — restoreState must not clobber
    // it with the backup's (stale) audio sources.
    expect(room.getState().audioSources).toEqual([
      { url: "https://example.com/already-here.mp3" },
    ]);
  });

  it("should not clobber a queue populated mid-flight, after validation has already started", async () => {
    // The first version of the restore guard only checked audioSources
    // once, before the (awaited, network-bound) validation step — a
    // concurrent queue.json restore landing during that await would still
    // get overwritten. Start the restore, let validation begin, populate
    // the queue while it's in flight, then let the restore finish.
    const restorePromise = BackupManager.restoreState();

    // validateAudioFileExists sleeps 15ms; populate at 5ms so we're
    // guaranteed to land inside that window, after the entry check but
    // before the final write.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const room = globalManager.getOrCreateRoom("test-room-1");
    room.setAudioSources([{ url: "https://example.com/mid-flight.mp3" }]);

    await restorePromise;

    expect(room.getState().audioSources).toEqual([
      { url: "https://example.com/mid-flight.mp3" },
    ]);
  });

  it("should broadcast SET_AUDIO_SOURCES to clients that joined a room before its restore finished", async () => {
    // A client can connect (and get handleOpen's empty-queue response)
    // during the window between server startup and restoreState finishing.
    // They have no reason to expect another SET_AUDIO_SOURCES, so restore
    // must push one if it fills a room that already has a live client.
    const room = globalManager.getOrCreateRoom("test-room-1");
    const mockWs = {
      data: {
        username: "realuser",
        clientId: "real-client-1",
        roomId: "test-room-1",
      },
      readyState: 1, // OPEN
      subscribe: mock(() => {}),
      send: mock(() => {}),
    };
    room.addClient(mockWs as any);
    expect(room.hasActiveConnections()).toBe(true);

    const fakeServer = { publish: mock(() => {}) };
    await BackupManager.restoreState(fakeServer as any);

    expect(fakeServer.publish).toHaveBeenCalledTimes(1);
    const [topic, payload] = fakeServer.publish.mock.calls[0];
    expect(topic).toBe("test-room-1");
    const message = JSON.parse(payload as string);
    expect(message.event.type).toBe("SET_AUDIO_SOURCES");
    // AudioSourceSchema strips unrecognized fields (id/name from the
    // backup fixture); only url survives.
    expect(message.event.sources).toEqual([{ url: "test.mp3" }]);
  });

  it("should not broadcast for restored rooms with no active connections", async () => {
    const fakeServer = { publish: mock(() => {}) };
    await BackupManager.restoreState(fakeServer as any);

    expect(fakeServer.publish).not.toHaveBeenCalled();
  });

  it("should handle ghost clients correctly", async () => {
    // Create a room with a ghost client (no WebSocket)
    const room = globalManager.getOrCreateRoom("ghost-room");

    // Add a client without a valid WebSocket
    const ghostClient = {
      username: "ghost",
      clientId: "ghost-1",
      ws: null, // No WebSocket
      rtt: 0,
      position: { x: 0, y: 0 },
    };

    // Manually add ghost to clients map
    (room as any).clients.set("ghost-1", ghostClient);

    // Room should not be empty (has a ghost)
    expect(room.isEmpty()).toBe(false);

    // But should have no active connections
    expect(room.hasActiveConnections()).toBe(false);
  });
});
