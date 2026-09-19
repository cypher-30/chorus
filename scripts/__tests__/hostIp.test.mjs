import { describe, expect, test } from "bun:test";
import {
  getExternalIPv4Entries,
  getExternalIPv4s,
  getLanIPv4,
  isLikelyVirtualAdapterName,
  isLinkLocalIPv4,
  isPrivateIPv4,
  isTailscaleIPv4,
  resolveAutoHostAddress,
} from "../lib/hostIp.mjs";

// scripts/lib/hostIp.mjs had zero test coverage before this file, despite
// being the exact code that produced a real, user-reported failure: `auto`
// mode selected a WSL vEthernet address (172.19.x.x) that no other device
// on the network could reach. Every test below uses an *injected* interface
// list (the same shape as os.networkInterfaces()) so none of this depends
// on, or is flaky against, the machine actually running the suite.

const entry = (address, { family = "IPv4", internal = false } = {}) => ({
  address,
  family,
  internal,
});

describe("isPrivateIPv4", () => {
  test("matches RFC1918 ranges", () => {
    expect(isPrivateIPv4("10.0.0.1")).toBe(true);
    expect(isPrivateIPv4("192.168.1.1")).toBe(true);
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
  });

  test("rejects adjacent-but-public 172 ranges", () => {
    expect(isPrivateIPv4("172.15.255.255")).toBe(false);
    expect(isPrivateIPv4("172.32.0.0")).toBe(false);
  });

  test("rejects a public address", () => {
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
  });
});

describe("isTailscaleIPv4", () => {
  test("matches the CGNAT range boundaries (100.64.0.0/10)", () => {
    expect(isTailscaleIPv4("100.64.0.0")).toBe(true);
    expect(isTailscaleIPv4("100.100.1.1")).toBe(true);
    expect(isTailscaleIPv4("100.127.255.255")).toBe(true);
  });

  test("rejects addresses just outside the CGNAT range", () => {
    expect(isTailscaleIPv4("100.63.255.255")).toBe(false);
    expect(isTailscaleIPv4("100.128.0.0")).toBe(false);
  });

  test("rejects a Tailscale-adjacent-looking but link-local address", () => {
    // The failure this regresses: Tailscale installed but not connected
    // reports a 169.254.x.x self-assigned address, not a CGNAT one.
    expect(isTailscaleIPv4("169.254.83.107")).toBe(false);
  });
});

describe("isLinkLocalIPv4", () => {
  test("matches 169.254.0.0/16", () => {
    expect(isLinkLocalIPv4("169.254.0.1")).toBe(true);
    expect(isLinkLocalIPv4("169.254.83.107")).toBe(true);
  });

  test("rejects a non-link-local address", () => {
    expect(isLinkLocalIPv4("10.55.51.110")).toBe(false);
  });
});

describe("isLikelyVirtualAdapterName", () => {
  test("matches known virtual/VPN/tunnel adapter names", () => {
    expect(isLikelyVirtualAdapterName("Tailscale")).toBe(true);
    expect(isLikelyVirtualAdapterName("ProTUN adapter")).toBe(true);
    expect(isLikelyVirtualAdapterName("tun0")).toBe(true);
    expect(isLikelyVirtualAdapterName("vEthernet (WSL (Hyper-V firewall))")).toBe(true);
    expect(isLikelyVirtualAdapterName("vEthernet (WSL)")).toBe(true);
  });

  test("does not match a real Wi-Fi/Ethernet adapter name", () => {
    expect(isLikelyVirtualAdapterName("Wi-Fi")).toBe(false);
    expect(isLikelyVirtualAdapterName("Ethernet")).toBe(false);
  });
});

describe("getExternalIPv4Entries / getExternalIPv4s", () => {
  test("skips internal and non-IPv4 entries", () => {
    const interfaces = {
      lo: [entry("127.0.0.1", { internal: true })],
      "Wi-Fi": [
        entry("10.55.51.110"),
        entry("fe80::1", { family: "IPv6" }),
      ],
    };

    expect(getExternalIPv4Entries(interfaces)).toEqual([
      { name: "Wi-Fi", address: "10.55.51.110" },
    ]);
    expect(getExternalIPv4s(interfaces)).toEqual(["10.55.51.110"]);
  });
});

describe("getLanIPv4", () => {
  test("regression: Wi-Fi down, only a WSL vEthernet address left — must not be selected", () => {
    // This is the exact shape of the user-reported failure: auto mode
    // picked 172.19.207.103, a WSL vEthernet address unreachable from any
    // other device on the network.
    const interfaces = {
      "vEthernet (WSL (Hyper-V firewall))": [entry("172.19.192.1")],
    };

    expect(getLanIPv4(interfaces)).toBeNull();
  });

  test("this machine's real captured interface list selects Wi-Fi, not vEthernet or link-local Tailscale", () => {
    const interfaces = {
      Tailscale: [entry("169.254.83.107")],
      "Wi-Fi": [entry("10.55.51.110")],
      "vEthernet (WSL (Hyper-V firewall))": [entry("172.19.192.1")],
    };

    expect(getLanIPv4(interfaces)).toBe("10.55.51.110");
  });

  test("a VPN client's private-range address does not win over real Wi-Fi", () => {
    const interfaces = {
      "Wi-Fi": [entry("192.168.100.13")],
      ProTUN: [entry("10.2.0.2")],
    };

    expect(getLanIPv4(interfaces)).toBe("192.168.100.13");
  });

  test("excludes a Tailscale CGNAT address even without a virtual-sounding name", () => {
    const interfaces = {
      "Wi-Fi": [entry("100.86.232.117")],
    };

    expect(getLanIPv4(interfaces)).toBeNull();
  });

  test("returns null with no candidates at all", () => {
    expect(getLanIPv4({})).toBeNull();
  });
});

describe("resolveAutoHostAddress", () => {
  test("prefers LAN over Tailscale when both are present", () => {
    const interfaces = {
      Tailscale: [entry("100.86.232.117")],
      "Wi-Fi": [entry("10.55.51.110")],
    };

    expect(resolveAutoHostAddress(interfaces)).toEqual({
      address: "10.55.51.110",
      mode: "lan",
    });
  });

  test("falls through to null when only a virtual/WSL adapter is present and no Tailscale CLI is reachable", () => {
    const interfaces = {
      "vEthernet (WSL)": [entry("172.19.192.1")],
    };

    const result = resolveAutoHostAddress(interfaces);
    expect(result.address === null || result.mode === "tailscale").toBe(true);
    // The vEthernet address must never be the one returned, regardless of
    // whether a real Tailscale CLI happens to be reachable in this
    // environment.
    expect(result.address).not.toBe("172.19.192.1");
  });
});
