import { beforeEach, describe, expect, it } from "bun:test";
import type { Server } from "bun";
import { globalManager } from "../managers/GlobalManager";
import { handleIngestRetry } from "../routes/ingest";
import type { WSData } from "../utils/websocket";

/**
 * Regression coverage for the `/ingest/retry` 404, previously (mis)documented
 * in PLAN.md/README.md as a "runtime reload hiccup." The real cause was a
 * `bun run --hot` reload re-evaluating the module-scope `globalManager`
 * singleton into a fresh, empty room map while already-open WebSocket
 * connections survived — fixed by stashing the singleton on `globalThis`
 * (see GlobalManager.ts). These tests can't exercise the hot-reload
 * mechanism itself (nothing in `bun test` reloads modules mid-run — that
 * was confirmed by manual reproduction instead, see PLAN.md), but they do
 * lock in the handler's error codes/messages so the next occurrence of
 * "retry 404s" is diagnosable from the response body alone rather than
 * guessed at again.
 */

const fakeServer = {} as unknown as Server<WSData>;

describe("handleIngestRetry error responses", () => {
  beforeEach(async () => {
    for (const roomId of globalManager.getRoomIds()) {
      await globalManager.deleteRoom(roomId);
    }
  });

  it("returns a self-explanatory 404 (not a bare 'Room not found') for an unknown room", async () => {
    const req = new Request("http://localhost/ingest/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: "999999",
        clientId: "someone",
        pendingUri: "spotify:track:abc",
      }),
    });

    const res = await handleIngestRetry(req, fakeServer);

    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain("Room not found");
    // The whole point of the fix: name the hot-reload possibility so this
    // isn't mistaken for a routing bug again.
    expect(text.toLowerCase()).toContain("hot-reloaded");
  });

  it("returns 403 (not 404) when the room exists but the client is not a member", async () => {
    const roomId = "123456";
    globalManager.getOrCreateRoom(roomId);

    const req = new Request("http://localhost/ingest/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        clientId: "intruder",
        pendingUri: "spotify:track:abc",
      }),
    });

    const res = await handleIngestRetry(req, fakeServer);

    expect(res.status).toBe(403);
    expect(await res.text()).toContain("not connected");
  });

  it("rejects non-POST methods with 405", async () => {
    const req = new Request("http://localhost/ingest/retry", { method: "GET" });
    const res = await handleIngestRetry(req, fakeServer);
    expect(res.status).toBe(405);
  });

  it("rejects a malformed body with 400", async () => {
    const req = new Request("http://localhost/ingest/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: "123456" }),
    });
    const res = await handleIngestRetry(req, fakeServer);
    expect(res.status).toBe(400);
  });
});
