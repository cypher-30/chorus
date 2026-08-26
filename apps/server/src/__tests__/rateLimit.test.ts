import { beforeEach, describe, expect, it } from "bun:test";
import {
  checkRateLimit,
  getRequestIp,
  resetRateLimiterForTests,
} from "../utils/rateLimit";

describe("rateLimit", () => {
  beforeEach(() => {
    resetRateLimiterForTests();
  });

  it("allows requests up to the configured limit", () => {
    const start = 1_000;
    expect(
      checkRateLimit({
        key: "queue:123456:1.1.1.1",
        limit: 2,
        windowMs: 10_000,
        nowMs: start,
      }).allowed
    ).toBe(true);

    expect(
      checkRateLimit({
        key: "queue:123456:1.1.1.1",
        limit: 2,
        windowMs: 10_000,
        nowMs: start + 10,
      }).allowed
    ).toBe(true);
  });

  it("blocks requests above the limit and returns retryAfter", () => {
    const start = 1_000;
    checkRateLimit({
      key: "queue:123456:1.1.1.1",
      limit: 1,
      windowMs: 10_000,
      nowMs: start,
    });

    const result = checkRateLimit({
      key: "queue:123456:1.1.1.1",
      limit: 1,
      windowMs: 10_000,
      nowMs: start + 200,
    });

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("resets counters once the window elapses", () => {
    const start = 1_000;
    checkRateLimit({
      key: "queue:123456:1.1.1.1",
      limit: 1,
      windowMs: 10_000,
      nowMs: start,
    });

    const result = checkRateLimit({
      key: "queue:123456:1.1.1.1",
      limit: 1,
      windowMs: 10_000,
      nowMs: start + 10_001,
    });

    expect(result.allowed).toBe(true);
  });

  it("gives different keys independent buckets", () => {
    const start = 1_000;
    checkRateLimit({
      key: "queue:123456:1.1.1.1",
      limit: 1,
      windowMs: 10_000,
      nowMs: start,
    });

    // A different client (different key) hitting the same room must not be
    // blocked by another client's usage.
    const result = checkRateLimit({
      key: "queue:123456:2.2.2.2",
      limit: 1,
      windowMs: 10_000,
      nowMs: start + 10,
    });

    expect(result.allowed).toBe(true);
  });
});

describe("getRequestIp", () => {
  it("prefers the real socket address from server.requestIP over headers", () => {
    const req = new Request("http://localhost/queue/set", {
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    const server = { requestIP: () => ({ address: "10.0.0.1" }) };

    expect(getRequestIp(req, server)).toBe("10.0.0.1");
  });

  it("falls back to x-forwarded-for when no server/socket address is available", () => {
    const req = new Request("http://localhost/queue/set", {
      headers: { "x-forwarded-for": "9.9.9.9, 8.8.8.8" },
    });
    const server = { requestIP: () => null };

    expect(getRequestIp(req, server)).toBe("9.9.9.9");
  });

  it("falls back to unknown with no server, no headers", () => {
    const req = new Request("http://localhost/queue/set");
    expect(getRequestIp(req)).toBe("unknown");
  });
});