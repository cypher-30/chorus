#!/usr/bin/env bun

import { resolveAutoHostAddress } from "./lib/hostIp.mjs";

// Resolution precedence mirrors `auto` mode in dev-multidevice.mjs: an
// explicit override, then LAN, then Tailscale. Falling straight to
// loopback the moment LAN detection returns nothing would wrongly treat a
// legitimate Tailscale-only setup (`bun run dev:tailscale`) as a failure,
// so Tailscale is tried before giving up — see resolvedHost.mode below for
// which one actually won.
const explicitApiUrl = process.env.CHORUS_API_URL || process.env.NEXT_PUBLIC_API_URL;
const explicitWsUrl = process.env.CHORUS_WS_URL || process.env.NEXT_PUBLIC_WS_URL;
const manualHostIp = process.env.CHORUS_HOST_IP?.trim() || "";

let resolvedHost = { address: null, mode: null };
if (manualHostIp) {
  resolvedHost = { address: manualHostIp, mode: "manual (CHORUS_HOST_IP)" };
} else if (!explicitApiUrl && !explicitWsUrl) {
  resolvedHost = resolveAutoHostAddress();
}

const apiBase = explicitApiUrl || (resolvedHost.address
  ? `http://${resolvedHost.address}:8080`
  : "http://localhost:8080");

const wsBase = explicitWsUrl || (resolvedHost.address
  ? `ws://${resolvedHost.address}:8080/ws`
  : "ws://localhost:8080/ws");

// This script's entire purpose is proving the firewall/inbound path other
// devices depend on — a pass against loopback proves nothing about that
// and has previously produced a false "all clear" while a firewall rule
// blocked every other device on the network (see docs/startup-firewall-runbook.md).
const isLoopbackBase = (url) => {
  try {
    const { hostname } = new URL(url.replace(/^ws/, "http"));
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
};

const targetIsLoopback = isLoopbackBase(apiBase) || isLoopbackBase(wsBase);

const timeoutMs = 6000;

const withTimeout = async (promise, label) => {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]);
};

const checks = [];
const addCheck = (name, ok, details, hardFail = false) => {
  checks.push({ name, ok, details, hardFail });
};

const checkJsonEndpoint = async (name, path, validate, hardFail = true) => {
  const url = `${apiBase}${path}`;
  try {
    const response = await withTimeout(fetch(url), `${name} (${url})`);
    if (!response.ok) {
      addCheck(name, false, `HTTP ${response.status} from ${url}`, hardFail);
      return;
    }
    const data = await response.json();
    const validation = validate(data);
    addCheck(name, validation.ok, validation.details, hardFail);
  } catch (error) {
    addCheck(name, false, `${error}`, hardFail);
  }
};

const checkWebSocket = async () => {
  const roomId = "123456";
  const clientId = `preflight-${Date.now()}`;
  const url = `${wsBase}?roomId=${roomId}&username=preflight&clientId=${clientId}`;

  try {
    await withTimeout(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        let opened = false;
        let settled = false;

        const fail = (message) => {
          if (settled) return;
          settled = true;
          reject(new Error(message));
        };

        const pass = () => {
          if (settled) return;
          settled = true;
          resolve(true);
        };

        ws.onerror = () => {
          fail("WebSocket connection error");
        };

        ws.onopen = () => {
          opened = true;
          // A successful open is enough for connectivity preflight.
          setTimeout(() => {
            try {
              ws.close();
            } catch {
              // ignore
            }
            pass();
          }, 100);
        };

        ws.onclose = () => {
          if (!opened) {
            fail("WebSocket closed before opening");
          }
        };
      }),
      `WebSocket check (${url})`
    );

    addCheck("WebSocket handshake", true, `Connected to ${url}`, true);
  } catch (error) {
    addCheck("WebSocket handshake", false, `${error}`, true);
  }
};

await checkJsonEndpoint(
  "Health endpoint",
  "/health",
  (data) => ({
    ok: data?.status === "ok",
    details: data?.status === "ok" ? "status=ok" : "missing status=ok",
  }),
  true
);

await checkJsonEndpoint(
  "Active rooms endpoint",
  "/active-rooms",
  (data) => {
    const hasShape =
      typeof data?.totalListeners === "number" && Array.isArray(data?.rooms);
    return {
      ok: hasShape,
      details: hasShape
        ? `rooms=${data.rooms.length}, totalListeners=${data.totalListeners}`
        : "missing { totalListeners, rooms[] }",
    };
  },
  true
);

await checkJsonEndpoint(
  "Telegram status endpoint",
  "/telegram/status",
  (data) => {
    const valid = typeof data?.enabled === "boolean";
    if (!valid) {
      return { ok: false, details: "missing boolean enabled field" };
    }
    if (data.enabled) {
      return { ok: true, details: `enabled=true, bot=${data.botUsername || "unknown"}` };
    }
    if (data?.tokenConfigured) {
      return {
        ok: true,
        details: `enabled=false (token configured but not validated yet: ${data.reason || "unknown"})`,
      };
    }
    return {
      ok: true,
      details:
        "enabled=false (direct Upload tab should be used until TELEGRAM_BOT_TOKEN is configured)",
    };
  },
  false
);

await checkWebSocket();

const hardFailures = checks.filter((c) => c.hardFail && !c.ok);

const allowLoopback = process.env.CHORUS_ALLOW_LOOPBACK_PREFLIGHT === "true";
const targetLabel = explicitApiUrl || explicitWsUrl
  ? "explicit override (CHORUS_API_URL/CHORUS_WS_URL/NEXT_PUBLIC_*)"
  : resolvedHost.mode === "manual (CHORUS_HOST_IP)"
    ? resolvedHost.mode
    : resolvedHost.mode
      ? `auto-detected ${resolvedHost.mode}`
      : "loopback fallback (no LAN or Tailscale address detected)";

console.log("\nChorus 3-device preflight results");
console.log(`Target: ${apiBase} / ${wsBase} (${targetLabel})`);
for (const check of checks) {
  const icon = check.ok ? "PASS" : check.hardFail ? "FAIL" : "WARN";
  console.log(`- [${icon}] ${check.name}: ${check.details}`);
}

console.log("\nManual sync verification checklist:");
console.log("- Open docs/3-device-verification.md and complete every required step.");
console.log("- Use 3 physical devices (phone/tablet/laptop), not 3 tabs on one device.");

if (targetIsLoopback && !allowLoopback) {
  console.error(
    "\nPreflight failed: resolved target is loopback, which proves nothing about " +
      "whether a second device can actually reach this server (this is the exact gap " +
      "that let a firewall block go unnoticed before — see docs/startup-firewall-runbook.md)."
  );
  console.error(
    "Fix: run this from the same machine that will host the room (so LAN/Tailscale " +
      "detection can find a real address), or set CHORUS_HOST_IP explicitly."
  );
  console.error(
    "If you deliberately want a loopback-only run (e.g. CI, or testing this script " +
      "itself), set CHORUS_ALLOW_LOOPBACK_PREFLIGHT=true to skip this check."
  );
  process.exit(1);
}

if (hardFailures.length > 0) {
  console.error(`\nPreflight failed with ${hardFailures.length} hard failure(s).`);
  process.exit(1);
}

console.log("\nPreflight checks passed.");
