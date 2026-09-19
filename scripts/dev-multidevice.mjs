#!/usr/bin/env bun

import path from "node:path";
import net from "node:net";
import {
  getExternalIPv4s,
  getLanIPv4,
  getTailscaleIPv4,
  isLinkLocalIPv4,
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
  // Link-local (169.254.x.x) addresses are excluded: an adapter reports one
  // when it self-assigned because it couldn't reach a DHCP/peer server
  // (e.g. Tailscale installed but not actually connected) — never a
  // reachable address for another device, so advertising it is misleading.
  const otherAddresses = new Set(
    getExternalIPv4s().filter((ip) => !isLinkLocalIPv4(ip))
  );
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
let shuttingDown = false;

// This script's process is a native Windows binary here (bun.exe run
// through WSL interop — see CLAUDE.md), so its own spawned children are
// real Windows processes, and `taskkill`/`netstat` are the right tools to
// inspect and reap them. process.platform reports "win32" for that case
// regardless of the WSL shell wrapping it.
const isWindowsRuntime = process.platform === "win32";

// Finds the PID currently LISTENING on `port`, so a conflict message can
// name it instead of guessing at a shell-specific kill command. Best
// effort: returns null (never throws) if the lookup tool isn't available
// or nothing is found — callers must degrade gracefully.
const findPortHolder = (port) => {
  if (isWindowsRuntime) {
    let result;
    try {
      result = Bun.spawnSync({
        cmd: ["netstat.exe", "-ano"],
        stdout: "pipe",
        stderr: "ignore",
      });
    } catch {
      return null;
    }
    if (result.exitCode !== 0) return null;

    const output = new TextDecoder().decode(result.stdout);
    for (const rawLine of output.split(/\r?\n/)) {
      const columns = rawLine.trim().split(/\s+/);
      if (columns.length < 5) continue;
      const [proto, localAddress, , state, pid] = columns;
      if (proto !== "TCP") continue;
      if (state !== "LISTENING") continue;
      if (!localAddress.endsWith(`:${port}`)) continue;
      const parsedPid = Number(pid);
      if (Number.isFinite(parsedPid) && parsedPid > 0) return parsedPid;
    }
    return null;
  }

  // POSIX best effort — lsof isn't guaranteed to be installed everywhere,
  // so a failure here just means the caller falls back to generic guidance.
  try {
    const result = Bun.spawnSync({
      cmd: ["lsof", "-t", `-i:${port}`, "-sTCP:LISTEN"],
      stdout: "pipe",
      stderr: "ignore",
    });
    if (result.exitCode !== 0) return null;
    const first = new TextDecoder()
      .decode(result.stdout)
      .trim()
      .split(/\r?\n/)[0];
    const parsedPid = Number(first);
    return Number.isFinite(parsedPid) && parsedPid > 0 ? parsedPid : null;
  } catch {
    return null;
  }
};

const suggestKillCommand = (pid) =>
  isWindowsRuntime ? `taskkill.exe /PID ${pid} /T /F` : `kill -9 ${pid}`;

const describePortConflict = (port) => {
  const pid = findPortHolder(port);
  if (pid) {
    return `Port ${port} is held by PID ${pid}. Stop it, then retry: ${suggestKillCommand(pid)}`;
  }
  return isWindowsRuntime
    ? `Port ${port} is already in use. Find it with \`netstat -ano | findstr :${port}\`, then \`taskkill /PID <pid> /T /F\`, then retry.`
    : `Port ${port} is already in use. Stop whatever holds it, then retry: bun run up`;
};

// Reaps a spawned process AND its descendants. A plain proc.kill() only
// signals the immediate child — observed on this machine, that leaves
// Next's own internal process tree (next dev spawns a separate
// start-server.js child) running and holding the port after "shutdown"
// (see PLAN.md's process-tree finding). `taskkill /T` walks the real
// Windows parent-child chain regardless of whether the intermediate
// wrappers handle signals gracefully.
const killTree = (proc) => {
  if (!proc) return;

  if (isWindowsRuntime && proc.pid) {
    try {
      Bun.spawnSync({
        cmd: ["taskkill.exe", "/PID", String(proc.pid), "/T", "/F"],
        stdout: "ignore",
        stderr: "ignore",
      });
      return;
    } catch {
      // fall through to a plain kill below
    }
  }

  try {
    proc.kill();
  } catch {
    // ignore — already gone
  }
};

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
    if (shuttingDown) return;

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

  // Informational, not an error: this only means the *first* Spotify
  // sign-in/session check after startup may take a beat longer while
  // Next.js compiles the auth route on demand. Nothing is broken.
  if (!shuttingDown) {
    console.log(
      `(Auth route warm-up didn't finish within ${AUTH_WARMUP_TIMEOUT_MS / 1000}s — non-fatal, the app still starts normally. First sign-in check may just be a little slower.)`
    );
  }
};

const serverPortFree = await isPortFree(8080);
const clientPortFree = await isPortFree(3000);
const serverAlreadyRunning = !serverPortFree && (await isChorusHealthOk());

if (!serverPortFree && !serverAlreadyRunning) {
  console.error("Port 8080 is already in use by a non-Chorus process.");
  console.error(describePortConflict(8080));
  process.exit(1);
}

if (!clientPortFree && serverAlreadyRunning) {
  console.log("Chorus already appears to be running (ports 8080 and 3000 are in use).");
  console.log(`Open: http://${hostIp}:3000`);
  process.exit(0);
}

if (!clientPortFree) {
  console.error("Port 3000 is already in use by another process.");
  console.error(describePortConflict(3000));
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

let client;

// Defined before the client is spawned so an early-exit failure path below
// (the re-probe) can clean up the already-started server too.
const stopAll = () => {
  shuttingDown = true;
  killTree(server);
  killTree(client);
};

if (serverAlreadyRunning) {
  console.log("Detected existing Chorus server on port 8080. Reusing it.");
} else {
  try {
    console.log("Waiting for server healthcheck before launching client...");
    await waitForServerHealth();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    killTree(server);
    process.exit(1);
  }

  console.log("Server is healthy. Launching client...\n");
}

// Re-probe immediately before spawning the client. This narrows, but
// cannot fully close, the race in PLAN.md's finding: a stale process can be
// alive-but-not-yet-bound at the earlier pre-flight check above, then bind
// during the health-check wait that just ran (observed gap on this
// machine: ~7s between such a process starting and it actually binding the
// port). Catching it here — instead of letting the client crash with a raw
// Next.js EADDRINUSE stack trace — means the actual holder can be named.
if (!(await isPortFree(3000))) {
  console.error("\nPort 3000 became occupied while the server was starting.");
  console.error(describePortConflict(3000));
  killTree(server);
  process.exit(1);
}

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

  // Handle EADDRINUSE at the point of failure rather than only at
  // pre-flight: even the re-probe above can't close every instance of the
  // race (a stale process can still bind between that check and the
  // client's own bind attempt). If the client is what died, check whether
  // that's what happened and name the real holder — the one piece of
  // information a raw EADDRINUSE trace doesn't give the user.
  if (firstExit.name === "client" && !(await isPortFree(3000))) {
    console.error(describePortConflict(3000));
  }
}

stopAll();
await Promise.allSettled(server ? [server.exited, client.exited] : [client.exited]);
process.exit(firstExit.code);
