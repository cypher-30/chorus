#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const cwd = process.cwd();

const candidates = [
  path.join(cwd, "node_modules", ".bin", "next"),
  path.join(cwd, "node_modules", ".bin", "next.exe"),
  path.join(cwd, "node_modules", ".bin", "next.cmd"),
  path.join(cwd, "..", "..", "node_modules", ".bin", "next"),
  path.join(cwd, "..", "..", "node_modules", ".bin", "next.exe"),
  path.join(cwd, "..", "..", "node_modules", ".bin", "next.cmd"),
];

const nextBin = candidates.find((candidate) => existsSync(candidate));

// Non-blocking `spawn`, not `spawnSync`: this wrapper needs to stay able to
// receive SIGINT/SIGTERM itself and forward them, so a parent that signals
// *this* process (e.g. scripts/dev-multidevice.mjs) still gets a chance to
// shut Next down cleanly instead of just killing this wrapper and leaving
// Next's own process tree behind. Observed on this machine: `next dev`
// spawns a separate `start-server.js` child that does not reliably die just
// because this wrapper exits — a plain single-PID kill from the parent is
// not sufficient by itself even with this fix; the parent is also
// responsible for a recursive/tree kill (see killTree in
// dev-multidevice.mjs). This fix removes one level of that orphaned tree.
const command = nextBin ?? process.execPath;
const commandArgs = nextBin ? args : ["x", "--bun", "next", ...args];

const child = spawn(command, commandArgs, { stdio: "inherit" });

const forwardSignal = (signal) => {
  try {
    child.kill(signal);
  } catch {
    // child may already be gone
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

const exitCode = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", (code, signal) => {
    resolve(code ?? (signal ? 1 : 0));
  });
});

process.exit(exitCode);
