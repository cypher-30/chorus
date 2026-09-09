/**
 * Resolves which host the client should talk to for both HTTP (`getApiBaseUrl`)
 * and WebSocket (`getWsUrl`) traffic.
 *
 * Why this exists: `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` are baked in at
 * dev-server start (see `scripts/dev-multidevice.mjs`), which only ever picks
 * *one* host (LAN, Tailscale, or localhost). A machine commonly answers on
 * several of those at once, and a device can reach the app over any of them —
 * so pinning env vars breaks the moment someone browses to a different valid
 * address of the same machine. The fix: treat the page's own host as the
 * source of truth and fall back to env only when we can't infer anything
 * better (SSR, or a page host that isn't a real LAN/Tailscale/loopback IP).
 */

const apiUrlToWsUrl = (apiUrl?: string) => {
  if (!apiUrl) return undefined;

  try {
    const parsed = new URL(apiUrl);
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    parsed.pathname = "/ws";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
};

const isLoopbackHost = (host: string) =>
  host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";

const isIpv4Host = (host: string) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);

const isPrivateOrTailIp = (host: string) => {
  if (!isIpv4Host(host)) return false;

  if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  // Tailscale commonly uses CGNAT range 100.64.0.0/10
  if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(host)) return true;

  return false;
};

/**
 * Core resolution: given an env-derived URL (already protocol/path-correct
 * for the caller's purpose) and a default port, decide which host to
 * actually use based on the current page's host.
 */
const resolvePageFollowingUrl = (
  envUrl: string | undefined,
  pageDerived: string,
  defaultPort: string
): string => {
  if (typeof window === "undefined") {
    return envUrl || pageDerived;
  }

  const pageHost = window.location.hostname;
  const initial = envUrl || pageDerived;

  try {
    const parsed = new URL(initial);
    const pageIsRemote = !isLoopbackHost(pageHost);
    const pageIsLoopback = isLoopbackHost(pageHost);
    const envHostMismatched = parsed.hostname !== pageHost;
    const pageLooksLikeLanOrTail = isPrivateOrTailIp(pageHost);

    // If the page was reached on a real LAN/Tailscale host but the env value
    // points to loopback, use the current page host instead.
    if (pageIsRemote && isLoopbackHost(parsed.hostname)) {
      parsed.hostname = pageHost;
      if (!parsed.port) parsed.port = defaultPort;
      return parsed.toString();
    }

    // In local multi-device dev, if the page is on a LAN/Tailscale host but
    // env points to a different host (for example stale CHORUS_HOST_IP from a
    // previous run, or a different network interface than the one the
    // browsing device used), follow the page host.
    if (pageIsRemote && pageLooksLikeLanOrTail && envHostMismatched) {
      parsed.hostname = pageHost;
      parsed.port = defaultPort;
      return parsed.toString();
    }

    // If this tab was opened on localhost/127.0.0.1 but env points to a
    // non-loopback IP, prefer localhost for this tab to avoid host-routing
    // quirks where the machine can't loop back to its own LAN IP.
    if (pageIsLoopback && !isLoopbackHost(parsed.hostname)) {
      return pageDerived;
    }

    return parsed.toString();
  } catch {
    return pageDerived;
  }
};

/** Resolves the WebSocket URL (`ws(s)://host:8080/ws`). */
export const getWsUrl = (): string => {
  const envWs = process.env.NEXT_PUBLIC_WS_URL?.trim();
  const envApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  const wsFromApi = apiUrlToWsUrl(envApi);
  const envUrl = envWs || wsFromApi;

  if (typeof window === "undefined") {
    return envUrl || "ws://localhost:8080/ws";
  }

  const pageProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const pageHost = window.location.hostname;
  const pageDerived = `${pageProtocol}//${pageHost}:8080/ws`;

  return resolvePageFollowingUrl(envUrl, pageDerived, "8080");
};

/** Resolves the HTTP API base URL (`http(s)://host:8080`, no trailing slash). */
export const getApiBaseUrl = (): string => {
  const envApi = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (typeof window === "undefined") {
    return envApi || "http://localhost:8080";
  }

  const pageProtocol = window.location.protocol === "https:" ? "https:" : "http:";
  const pageHost = window.location.hostname;
  const pageDerived = `${pageProtocol}//${pageHost}:8080`;

  return resolvePageFollowingUrl(envApi, pageDerived, "8080").replace(/\/+$/, "");
};

/**
 * Rewrites a same-server `/storage/...` audio URL (persisted in a room's
 * queue, possibly minted with a different host than the one this device is
 * using — e.g. stored via Tailscale, fetched over LAN) onto the current
 * device's resolved API host. Non-`/storage/` URLs (S3/R2 public URLs,
 * external URLs) pass through unchanged.
 */
export const resolveStorageUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith("/storage/")) return url;

    const base = new URL(getApiBaseUrl());
    parsed.protocol = base.protocol;
    parsed.hostname = base.hostname;
    parsed.port = base.port;
    return parsed.toString();
  } catch {
    return url;
  }
};
