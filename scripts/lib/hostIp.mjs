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

// Auto-configuration/link-local range, 169.254.0.0/16 — the address an
// adapter self-assigns when it can't reach a DHCP server (e.g. Tailscale
// reporting an address here means Tailscale is installed but not actually
// connected). Never worth advertising as a reachable address to another
// device.
export const isLinkLocalIPv4 = (ip) => /^169\.254\./.test(ip);

// Adapter names that are virtual/VPN/tunnel interfaces, not the physical
// network the phone/laptop are actually on — even though their addresses
// can fall in a private range and pass isPrivateIPv4. Observed on this
// machine: a VPN client's "ProTUN" adapter handing out a 10.x address
// alongside the real Wi-Fi adapter's 192.168.x address; naively taking the
// first private-range match picked the unreachable VPN address instead.
// Also matches Windows' WSL vEthernet adapter (172.x) — an address that is
// "locally assigned" from a Windows Bun binary's point of view but reaches
// nothing outside this machine (see the getLanIPv4 fallback below; this was
// a real observed failure, not a hypothetical one).
export const isLikelyVirtualAdapterName = (name) =>
  /(tailscale|protun|vpn|tun\d*|tap\d*|ppp|virtual|hyper-?v|vethernet|wsl)/i.test(
    name
  );

// All exported helpers below accept an optional `interfaces` map (the same
// shape as os.networkInterfaces()) so callers — notably tests — can inject
// a fixed adapter list instead of depending on the machine's real network
// state. Defaults to the live OS state for normal (non-test) callers.

export const getExternalIPv4Entries = (interfaces = os.networkInterfaces()) => {
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

export const getExternalIPv4s = (interfaces = os.networkInterfaces()) =>
  getExternalIPv4Entries(interfaces).map((e) => e.address);

export const getLanIPv4 = (interfaces = os.networkInterfaces()) => {
  const entries = getExternalIPv4Entries(interfaces);

  // A private-range address on an adapter that doesn't look like a
  // VPN/tunnel/virtual interface (real Wi-Fi/Ethernet), excluding
  // Tailscale's CGNAT range — that has its own dedicated getTailscaleIPv4()
  // path. Deliberately no permissive fallback that drops the
  // isLikelyVirtualAdapterName exclusion: on a machine with Wi-Fi down, the
  // only remaining private-range candidate can be a WSL vEthernet address —
  // reachable only from this machine, never from another device on the
  // network — which would defeat the entire purpose of this function (a
  // real, observed failure; see PLAN.md). Returning null here is correct:
  // it lets the caller's fail-loud CHORUS_HOST_IP path fire instead of
  // silently booting onto an unreachable address.
  const match = entries.find(
    (e) =>
      isPrivateIPv4(e.address) &&
      !isTailscaleIPv4(e.address) &&
      !isLikelyVirtualAdapterName(e.name)
  );
  return match?.address || null;
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
export const resolveAutoHostAddress = (interfaces = os.networkInterfaces()) => {
  const lanIp = getLanIPv4(interfaces);
  if (lanIp) return { address: lanIp, mode: "lan" };

  const tailscaleIp = getTailscaleIPv4();
  if (tailscaleIp) return { address: tailscaleIp, mode: "tailscale" };

  return { address: null, mode: null };
};
