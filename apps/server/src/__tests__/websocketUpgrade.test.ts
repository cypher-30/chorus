import { describe, expect, it, mock } from "bun:test";
import type { Server } from "bun";
import type { WSData } from "../utils/websocket";

/**
 * Covers the A-2 fix: the WS upgrade route used to accept any string as
 * roomId. RoomManager.cleanup() deletes storage by prefix `room-{roomId}`
 * (now `room-{roomId}/`), so joining with a short/malformed roomId like "1"
 * could delete every room whose 6-digit code starts with "1" once that
 * room's cleanup ran. Rejecting non-6-digit roomIds at the door closes it.
 *
 * `bun test` shares one module registry across every test file in the run,
 * and a couple of other files stub `../utils/responses`' errorResponse as
 * `() => new Response()` (always 200, no status) since they never assert on
 * status codes themselves. This file does, so it re-installs a real-behaving
 * stub before importing the handler — otherwise whichever file's stub
 * happened to load last would silently decide these assertions.
 */
mock.module("../utils/responses", () => ({
  corsHeaders: {},
  jsonResponse: (data: any, status = 200) =>
    new Response(JSON.stringify(data), { status }),
  errorResponse: (message: string, status = 400) =>
    new Response(message, { status }),
}));

const { handleWebSocketUpgrade } = await import("../routes/websocket");

const createServer = (upgraded: boolean) =>
  ({
    upgrade: mock(() => upgraded),
  }) as unknown as Server<WSData>;

const req = (params: Record<string, string>) =>
  new Request(
    `http://localhost/ws?${new URLSearchParams(params).toString()}`
  );

describe("WebSocket upgrade validation (A-2)", () => {
  it("rejects a roomId that isn't 6 digits", async () => {
    const server = createServer(true);
    const res = handleWebSocketUpgrade(
      req({ roomId: "1", username: "alice" }),
      server
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
    expect((server.upgrade as any)).toHaveBeenCalledTimes(0);
  });

  it("rejects a roomId with non-digit characters", async () => {
    const server = createServer(true);
    const res = handleWebSocketUpgrade(
      req({ roomId: "12345a", username: "alice" }),
      server
    );
    expect((res as Response).status).toBe(400);
    expect((server.upgrade as any)).toHaveBeenCalledTimes(0);
  });

  it("rejects a username over the length cap", async () => {
    const server = createServer(true);
    const res = handleWebSocketUpgrade(
      req({ roomId: "123456", username: "a".repeat(65) }),
      server
    );
    expect((res as Response).status).toBe(400);
    expect((server.upgrade as any)).toHaveBeenCalledTimes(0);
  });

  it("accepts a valid 6-digit roomId and upgrades", async () => {
    const server = createServer(true);
    const res = handleWebSocketUpgrade(
      req({ roomId: "123456", username: "alice" }),
      server
    );
    expect(res).toBeUndefined();
    expect((server.upgrade as any)).toHaveBeenCalledTimes(1);
  });
});

/**
 * Item #5 of the long-standing open list (PLAN.md's active-rooms
 * country-metadata entry): `activeRooms.test.ts` covers the
 * dedupe/uppercase/cap rules on `countryCodes` but injects `countryCode`
 * directly on fake clients, bypassing the header-extraction half entirely.
 * These cases exercise the real extraction in handleWebSocketUpgrade
 * (routes/websocket.ts:53-60) via the `data` object handed to
 * `server.upgrade`. What remains genuinely unverifiable here is whether a
 * real deployment platform actually sends these headers — that's a
 * deployment fact, not something a unit test can assert.
 */
describe("WebSocket upgrade country-header extraction (active-rooms metadata)", () => {
  const upgradeData = (server: Server<WSData>) =>
    (server.upgrade as any).mock.calls[0][1].data as WSData;

  it("reads a Vercel-style x-vercel-ip-country header and uppercases it", () => {
    const server = createServer(true);
    const request = req({ roomId: "123456", username: "alice" });
    request.headers.set("x-vercel-ip-country", "us");

    handleWebSocketUpgrade(request, server);

    expect(upgradeData(server).countryCode).toBe("US");
  });

  it("falls back to a Cloudflare-style cf-ipcountry header", () => {
    const server = createServer(true);
    const request = req({ roomId: "123456", username: "alice" });
    request.headers.set("cf-ipcountry", "gb");

    handleWebSocketUpgrade(request, server);

    expect(upgradeData(server).countryCode).toBe("GB");
  });

  it("prefers x-vercel-ip-country when both headers are present", () => {
    const server = createServer(true);
    const request = req({ roomId: "123456", username: "alice" });
    request.headers.set("x-vercel-ip-country", "de");
    request.headers.set("cf-ipcountry", "fr");

    handleWebSocketUpgrade(request, server);

    expect(upgradeData(server).countryCode).toBe("DE");
  });

  it("drops an invalid (non-2-letter) country header instead of passing it through", () => {
    const server = createServer(true);
    const request = req({ roomId: "123456", username: "alice" });
    request.headers.set("x-vercel-ip-country", "usa");

    handleWebSocketUpgrade(request, server);

    expect(upgradeData(server).countryCode).toBeUndefined();
  });

  it("leaves countryCode undefined when neither header is present", () => {
    const server = createServer(true);
    const request = req({ roomId: "123456", username: "alice" });

    handleWebSocketUpgrade(request, server);

    expect(upgradeData(server).countryCode).toBeUndefined();
  });
});
