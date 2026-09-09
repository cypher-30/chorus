#!/usr/bin/env bun

import path from "node:path";
import net from "node:net";
import {
  getExternalIPv4s,
  getLanIPv4,
  getTailscaleIPv4,
  isPrivateIPv4,
  isTailscaleIPv4,
} from "./lib/hostIp.mjs";

const requestedMode = (process.argv[2] || "auto").toLowerCase();
const validModes = new Set(["auto", "lan", "tailscale"]);

if (!validModes.has(requestedMode)) {
  console.error(`Invalid mode: ${requestedMode}. Use one of: auto, lan, tailscale.`);
  process.exit(1);
}

const rootDir = process.cwd();
const bunBin = process.execPath;
const HEALTHCHECK_TIMEOUT_MS = 30_000;
const HEALTHCHECK_POLL_MS = 400;
const AUTH_WARMUP_TIMEOUT_MS = 20_000;
const AUTH_WARMUP_POLL_MS = 500;

let hostIp = process.env.CHORUS_HOST_IP?.trim() || "";
let resolvedMode = requestedMode;

const resolveHostIp = () => {
  if (hostIp) return hostIp;

  if (requestedMode === "tailscale") {
    resolvedMode = "tailscale";
    return getTailscaleIPv4() || "";
  }

  if (requestedMode === "lan") {
    resolvedMode = "lan";
    return getLanIPv4() || "";
  }

  // Prefer LAN over Tailscale in auto mode: the LAN address works for every
  // device on the same network regardless of whether it's also on the
  // tailnet, whereas a Tailscale-only pick breaks the moment a device joins
  // over plain LAN/Wi-Fi instead (this was an observed real failure — see
  // PLAN.md's multi-device host-resolution entry). `tailscale` mode is still
  // available explicitly via `bun run dev:tailscale` for tailnet-only setups.
  const lanIp = getLanIPv4();
  if (lanIp) {
    resolvedMode = "lan";
    return lanIp;
  }

  const tailscaleIp = getTailscaleIPv4();
  if (tailscaleIp) {
    resolvedMode = "tailscale";
    return tailscaleIp;
  }

  return "";
};

hostIp = resolveHostIp();

const runningInWsl = Boolean(process.env.WSL_DISTRO_NAME);
const localIPv4Set = new Set(getExternalIPv4s());
const isHostIpAssignedLocally = localIPv4Set.has(hostIp);
const hasManualHostOverride = Boolean(process.env.CHORUS_HOST_IP?.trim());

// This command's only purpose is multi-device use, so it must never
// silently degrade to an address only this machine can reach — that
// produces the exact failure it exists to prevent (a second device dials a
// host it can't reach, or the server dials itself). Fail loud with
// actionable guidance instead.
if (
  !hasManualHostOverride &&
  runningInWsl &&
  hostIp &&
  !isHostIpAssignedLocally
) {
  console.error(
    `Auto-selected IP ${hostIp} (${resolvedMode} mode), but it is not assigned to this network stack (seen locally: ${
      [...localIPv4Set].join(", ") || "none"
    }).`
  );
  console.error(
    "This can happen when the Bun process and the OS network stack disagree (e.g. a Windows Bun binary run through WSL interop, or vice versa)."
  );
  console.error(
    "Set CHORUS_HOST_IP to the address other devices should use, then retry."
  );
  process.exit(1);
}

if (!hostIp) {
  if (resolvedMode === "tailscale") {
    console.error(
      "Could not detect Tailscale IPv4. Install Tailscale CLI (or expose tailscale.exe in WSL) or set CHORUS_HOST_IP manually."
    );
    process.exit(1);
  }

  console.error(
    "Could not detect a LAN or Tailscale IPv4. Set CHORUS_HOST_IP manually."
  );
  process.exit(1);
}

const apiUrl = `http://${hostIp}:8080`;
const wsUrl = `ws://${hostIp}:8080/ws`;
const clientUrl = `http://${hostIp}:3000`;

const parseUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const normalizeSpotifyAuthHostname = (hostname) => {
  if (!hostname) return hostname;
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "::1") return "127.0.0.1";
  return normalized;
};

const configuredAuthOrigin = process.env.CHORUS_AUTH_ORIGIN?.trim() || clientUrl;
const parsedAuthOrigin = parseUrl(configuredAuthOrigin);
let authProtocol = parsedAuthOrigin?.protocol || "http:";
let authHostname = normalizeSpotifyAuthHostname(parsedAuthOrigin?.hostname || hostIp);
let authHost = parsedAuthOrigin
  ? `${authHostname}${parsedAuthOrigin.port ? `:${parsedAuthOrigin.port}` : ""}`
  : `${authHostname}:3000`;
let authOrigin = `${authProtocol}//${authHost}`;
let authOriginIsSecure = authProtocol === "https:";
let authOriginIsLoopbackLiteral = authHostname === "127.0.0.1" || authHostname === "::1";

let shouldLockAuthOrigin =
  process.env.CHORUS_LOCK_AUTH_ORIGIN === "true" ||
  (process.env.CHORUS_LOCK_AUTH_ORIGIN == null &&
    (authOriginIsSecure || authOriginIsLoopbackLiteral));

if (!authOriginIsSecure && !authOriginIsLoopbackLiteral) {
  console.warn(
    `Configured auth origin (${authOrigin}) is insecure for Spotify OAuth. Pinning OAuth callbacks to http://127.0.0.1:3000.`
  );
  authProtocol = "http:";
  authHostname = "127.0.0.1";
  authHost = "127.0.0.1:3000";
  authOrigin = "http://127.0.0.1:3000";
  authOriginIsSecure = false;
  authOriginIsLoopbackLiteral = true;
  shouldLockAuthOrigin = true;
}

const getHealthcheckCandidates = () => [
  `${apiUrl}/health`,
  "http://127.0.0.1:8080/health",
  "http://localhost:8080/health",
];

const getAuthWarmupCandidates = () => [
  `${clientUrl}/api/auth/providers`,
  "http://127.0.0.1:3000/api/auth/providers",
  "http://localhost:3000/api/auth/providers",
];

console.log("Starting Chorus multi-device dev mode");
console.log(`Mode: ${resolvedMode}${requestedMode === "auto" ? " (auto-selected)" : ""}`);
console.log(`Host IP: ${hostIp}`);
console.log(`Client URL: ${clientUrl}`);
console.log(`NEXT_PUBLIC_API_URL=${apiUrl}`);
console.log(`NEXT_PUBLIC_WS_URL=${wsUrl}`);
console.log(
  `NEXTAUTH_URL=${
    shouldLockAuthOrigin ? authOrigin : "(dynamic per-request host in dev)"
  }`
);
console.log(`CHORUS_AUTH_ORIGIN=${authOrigin}`);
console.log(`CHORUS_LOCK_AUTH_ORIGIN=${shouldLockAuthOrigin ? "true" : "false"}`);
console.log(
  `Spotify redirect URI: ${
    shouldLockAuthOrigin
      ? `${authOrigin}/api/auth/callback/spotify`
      : "derived from the host you're browsing in dev"
  }`
);

if (!authOriginIsSecure) {
  console.log("Spotify OAuth local HTTP mode uses loopback IP literal (127.0.0.1).\n");
}

// The chosen host is only what got baked into env vars at boot — the app
// itself now follows whatever host a device actually browses to (see
// apps/client/src/lib/serverUrl.ts), so print every address this machine
// answers on. Any of these should work for a device that can reach it.
{
  const otherAddresses = new Set(getExternalIPv4s());
  otherAddresses.delete(hostIp);
  otherAddresses.add("127.0.0.1"); // this device only

  const labelFor = (ip) => {
    if (ip === "127.0.0.1") return "this device only";
    if (isTailscaleIPv4(ip)) return "tailscale";
    if (isPrivateIPv4(ip)) return "lan";
    return "other";
  };

  if (otherAddresses.size > 0) {
    console.log("\nAlso reachable at:");
    for (const ip of otherAddresses) {
      console.log(`  http://${ip}:3000  (${labelFor(ip)})`);
    }
  }
}

console.log("\nUse Ctrl+C once to stop both processes.\n");

let serverExitCode = null;

const waitForServerHealth = async () => {
  const deadline = Date.now() + HEALTHCHECK_TIMEOUT_MS;
  const healthUrls = getHealthcheckCandidates();

  while (Date.now() < deadline) {
    if (serverExitCode !== null) {
      throw new Error(`Server exited before healthcheck passed (exit code ${serverExitCode}).`);
    }

    for (const healthUrl of healthUrls) {
      try {
        const response = await fetch(healthUrl, {
          signal: AbortSignal.timeout(1_500),
        });
        if (response.ok) return;
      } catch {
        // Keep polling until timeout.
      }
    }

    await Bun.sleep(HEALTHCHECK_POLL_MS);
  }

  throw new Error(
    `Server did not become healthy within ${HEALTHCHECK_TIMEOUT_MS / 1000}s (${healthUrls.join(", ")}).`
  );
};

const isPortFree = (port) =>
  new Promise((resolve) => {
    const tester = net.createServer();

    tester.once("error", () => {
      resolve(false);
    });

    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, "0.0.0.0");
  });

const isChorusHealthOk = async () => {
  const candidates = getHealthcheckCandidates();

  for (const healthUrl of candidates) {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(1_500),
      });

      if (!response.ok) continue;

      const body = await response.json();
      if (body?.status === "ok") return true;
    } catch {
      // try next candidate
    }
  }

  return false;
};

const warmUpNextAuthProviders = async () => {
  const deadline = Date.now() + AUTH_WARMUP_TIMEOUT_MS;
  const candidates = getAuthWarmupCandidates();

  while (Date.now() < deadline) {
    for (const authUrl of candidates) {
      try {
        const response = await fetch(authUrl, {
          signal: AbortSignal.timeout(1_500),
        });
        if (response.ok) {
          console.log(`Pre-warmed auth route: ${authUrl}`);
          return;
        }
      } catch {
        // Keep polling until timeout.
      }
    }

    await Bun.sleep(AUTH_WARMUP_POLL_MS);
  }

  console.warn(
    `Auth route warm-up timed out after ${AUTH_WARMUP_TIMEOUT_MS / 1000}s. First sign-in/session check may be slower.`
  );
};

const serverPortFree = await isPortFree(8080);
const clientPortFree = await isPortFree(3000);
const serverAlreadyRunning = !serverPortFree && (await isChorusHealthOk());

if (!serverPortFree && !serverAlreadyRunning) {
  console.error("Port 8080 is already in use by a non-Chorus process.");
  console.error("Stop the existing process first, then retry with: bun run up");
  console.error("If needed in WSL, run: pkill -f 'src/index.ts'");
  process.exit(1);
}

if (!clientPortFree && serverAlreadyRunning) {
  console.log("Chorus already appears to be running (ports 8080 and 3000 are in use).");
  console.log(`Open: http://${hostIp}:3000`);
  process.exit(0);
}

if (!clientPortFree) {
  console.error("Port 3000 is already in use by another process.");
  console.error("Stop the existing process first, then retry with: bun run up");
  console.error("If needed in WSL, run: pkill -f 'next dev'");
  process.exit(1);
}

let server;

if (!serverAlreadyRunning) {
  server = Bun.spawn({
    cmd: [bunBin, "run", "dev"],
    cwd: path.join(rootDir, "apps", "server"),
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, CHORUS_PUBLIC_API_URL: apiUrl },
  });

  server.exited.then((code) => {
    serverExitCode = code;
  });
}

if (serverAlreadyRunning) {
  console.log("Detected existing Chorus server on port 8080. Reusing it.");
} else {
  try {
    console.log("Waiting for server healthcheck before launching client...");
    await waitForServerHealth();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    try {
      server.kill();
    } catch {
      // ignore
    }
    process.exit(1);
  }

  console.log("Server is healthy. Launching client...\n");
}

let client;

client = Bun.spawn({
  cmd: [bunBin, "run", "dev:network"],
  cwd: path.join(rootDir, "apps", "client"),
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_API_URL: apiUrl,
    NEXT_PUBLIC_WS_URL: wsUrl,
    ...(shouldLockAuthOrigin ? { NEXTAUTH_URL: authOrigin } : {}),
    CHORUS_AUTH_ORIGIN: authOrigin,
    CHORUS_LOCK_AUTH_ORIGIN: shouldLockAuthOrigin ? "true" : "false",
  },
});

void warmUpNextAuthProviders();

const safeKill = (proc) => {
  if (!proc) return;
  try {
    proc.kill();
  } catch {
    // ignore
  }
};

const stopAll = () => {
  safeKill(server);
  safeKill(client);
};

process.on("SIGINT", () => {
  console.log("\nStopping Chorus multi-device mode...");
  stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

const clientExit = client.exited.then((code) => ({ name: "client", code }));

const firstExit = server
  ? await Promise.race([
      server.exited.then((code) => ({ name: "server", code })),
      clientExit,
    ])
  : await clientExit;

if (firstExit.code !== 0) {
  console.error(`${firstExit.name} exited with code ${firstExit.code}`);
}

stopAll();
await Promise.allSettled(server ? [server.exited, client.exited] : [client.exited]);
process.exit(firstExit.code);
