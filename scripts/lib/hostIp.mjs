#!/usr/bin/env bun

// Shared host-address detection, extracted from dev-multidevice.mjs so
// scripts/verify-3-device-preflight.mjs can test the *actual* inbound path
// (LAN/Tailscale) instead of always hitting localhost — a preflight run
// against loopback can pass even while a firewall blocks every other
// device on the network, which is exactly the failure mode this exists to
// catch. Do not reimplement these heuristics elsewhere; the adapter
// filtering below encodes a real bug fix (see isLikelyVirtualAdapterName).

import os from "node:os";

export const isTailscaleIPv4 = (ip) =>
  // Tailscale's CGNAT range, 100.64.0.0/10
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(ip);

export const isPrivateIPv4 = (ip) =>
  ip.startsWith("10.") ||
  ip.startsWith("192.168.") ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);

// Adapter names that are virtual/VPN/tunnel interfaces, not the physical
// network the phone/laptop are actually on — even though their addresses
// can fall in a private range and pass isPrivateIPv4. Observed on this
// machine: a VPN client's "ProTUN" adapter handing out a 10.x address
// alongside the real Wi-Fi adapter's 192.168.x address; naively taking the
// first private-range match picked the unreachable VPN address instead.
export const isLikelyVirtualAdapterName = (name) =>
  /(tailscale|protun|vpn|tun\d*|tap\d*|ppp|virtual|hyper-?v|vethernet|wsl)/i.test(
    name
  );

export const getExternalIPv4Entries = () => {
  const interfaces = os.networkInterfaces();
  const entries = [];

  Object.entries(interfaces).forEach(([name, ifaceEntries]) => {
    (ifaceEntries || []).forEach((entry) => {
      if (entry.family === "IPv4" && !entry.internal) {
        entries.push({ name, address: entry.address });
      }
    });
  });

  return entries;
};

export const getExternalIPv4s = () =>
  getExternalIPv4Entries().map((e) => e.address);

export const getLanIPv4 = () => {
  const entries = getExternalIPv4Entries();

  // Prefer a private-range address on an adapter that doesn't look like a
  // VPN/tunnel/virtual interface (real Wi-Fi/Ethernet), then fall back to
  // any private-range address, excluding Tailscale's CGNAT range either way
  // — that has its own dedicated getTailscaleIPv4() path.
  const preferred = entries.find(
    (e) =>
      isPrivateIPv4(e.address) &&
      !isTailscaleIPv4(e.address) &&
      !isLikelyVirtualAdapterName(e.name)
  );
  if (preferred) return preferred.address;

  const fallback = entries.find(
    (e) => isPrivateIPv4(e.address) && !isTailscaleIPv4(e.address)
  );
  return fallback?.address || null;
};

export const getTailscaleIPv4 = () => {
  const candidates = ["tailscale", "tailscale.exe"];

  for (const command of candidates) {
    let result;

    try {
      result = Bun.spawnSync({
        cmd: [command, "ip", "-4"],
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch {
      continue;
    }

    if (result.exitCode !== 0) continue;

    const output = new TextDecoder().decode(result.stdout).trim();
    const first = output.split(/\r?\n/).find((line) => line.trim().length > 0);
    if (first) return first;
  }

  return null;
};

/**
 * Same LAN-then-Tailscale precedence `auto` mode uses in
 * dev-multidevice.mjs, minus the mode-specific / manual-override branches
 * that script also handles. Returns `{ address, mode }` where `mode` is
 * "lan" | "tailscale" | null (nothing detected).
 */
export const resolveAutoHostAddress = () => {
  const lanIp = getLanIPv4();
  if (lanIp) return { address: lanIp, mode: "lan" };

  const tailscaleIp = getTailscaleIPv4();
  if (tailscaleIp) return { address: tailscaleIp, mode: "tailscale" };

  return { address: null, mode: null };
};
