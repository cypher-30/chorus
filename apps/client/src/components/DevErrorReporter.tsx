"use client";

import { getApiBaseUrl } from "@/lib/serverUrl";
import { useEffect, useRef } from "react";

const DEDUPE_WINDOW_MS = 10_000;
const MAX_DEDUPE_KEYS = 120;
const MAX_MESSAGE_LEN = 1500;
const MAX_STACK_LEN = 4000;

type ClientErrorReport = {
  source: string;
  message: string;
  stack?: string;
  href?: string;
  userAgent?: string;
  file?: string;
  line?: number;
  column?: number;
  deviceHint?: string;
};

type EarlyClientErrorReport = Partial<ClientErrorReport>;

declare global {
  interface Window {
    __chorusEarlyErrors?: EarlyClientErrorReport[];
    __chorusOriginalConsoleError?: typeof console.error;
    __chorusEarlyConsoleErrorPatched?: boolean;
  }
}

const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 3)}...` : value;

const safeStringify = (value: unknown): string => {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const buildMessage = (parts: unknown[]) => {
  const text = parts.map((part) => safeStringify(part)).join(" | ");
  return truncate(text || "Unknown console error", MAX_MESSAGE_LEN);
};

export const DevErrorReporter = () => {
  const recentRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const endpoint = `${getApiBaseUrl()}/client-errors`;

    const shouldSend = (key: string) => {
      const now = Date.now();
      const recent = recentRef.current;
      const lastSeen = recent.get(key);

      if (lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) return false;

      recent.set(key, now);
      if (recent.size > MAX_DEDUPE_KEYS) {
        const cutoff = now - DEDUPE_WINDOW_MS;
        for (const [k, ts] of recent.entries()) {
          if (ts < cutoff || recent.size > MAX_DEDUPE_KEYS) {
            recent.delete(k);
          }
          if (recent.size <= MAX_DEDUPE_KEYS) break;
        }
      }
      return true;
    };

    const postReport = (report: ClientErrorReport) => {
      const key = `${report.source}::${report.message}`;
      if (!shouldSend(key)) return;

      const body = JSON.stringify(report);

      // Fire-and-forget reporting. Never throw or log from here to avoid
      // recursion with console.error interception.
      void fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body,
        keepalive: true,
      }).catch(() => {});
    };

    // Drain any errors captured before React mounted (hydration mismatches
    // often happen before this component's effect can install listeners).
    const earlyReports = Array.isArray(window.__chorusEarlyErrors)
      ? [...window.__chorusEarlyErrors]
      : [];
    window.__chorusEarlyErrors = [];
    for (const early of earlyReports) {
      const source =
        typeof early.source === "string" && early.source.length > 0
          ? early.source
          : "early.unknown";
      const message =
        typeof early.message === "string" && early.message.length > 0
          ? truncate(early.message, MAX_MESSAGE_LEN)
          : "Unknown early error";
      postReport({
        source,
        message,
        stack:
          typeof early.stack === "string"
            ? truncate(early.stack, MAX_STACK_LEN)
            : undefined,
        href: typeof early.href === "string" ? early.href : undefined,
        userAgent:
          typeof early.userAgent === "string"
            ? truncate(early.userAgent, 300)
            : undefined,
        file: typeof early.file === "string" ? truncate(early.file, 300) : undefined,
        line: typeof early.line === "number" ? early.line : undefined,
        column: typeof early.column === "number" ? early.column : undefined,
        deviceHint:
          typeof early.deviceHint === "string" ? early.deviceHint : undefined,
      });
    }

    const getContext = () => ({
      href: window.location.href,
      userAgent: truncate(navigator.userAgent || "", 300),
      deviceHint: `${window.innerWidth}x${window.innerHeight}`,
    });

    const onWindowError = (event: ErrorEvent) => {
      postReport({
        source: "window.error",
        message: truncate(event.message || "Unhandled window error", MAX_MESSAGE_LEN),
        stack: event.error?.stack
          ? truncate(event.error.stack, MAX_STACK_LEN)
          : undefined,
        file: event.filename ? truncate(event.filename, 300) : undefined,
        line: event.lineno || undefined,
        column: event.colno || undefined,
        ...getContext(),
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? `${reason.name}: ${reason.message}`
          : safeStringify(reason);

      postReport({
        source: "unhandledrejection",
        message: truncate(message || "Unhandled promise rejection", MAX_MESSAGE_LEN),
        stack:
          reason instanceof Error && reason.stack
            ? truncate(reason.stack, MAX_STACK_LEN)
            : undefined,
        ...getContext(),
      });
    };

    const originalConsoleError =
      window.__chorusOriginalConsoleError ?? console.error;
    const originalConsoleWarn = console.warn;

    if (window.__chorusEarlyConsoleErrorPatched) {
      console.error = originalConsoleError;
      window.__chorusEarlyConsoleErrorPatched = false;
    }

    postReport({
      source: "reporter.online",
      message: "DevErrorReporter mounted",
      ...getContext(),
    });

    console.error = (...args: unknown[]) => {
      originalConsoleError(...args);
      postReport({
        source: "console.error",
        message: buildMessage(args),
        ...getContext(),
      });
    };

    console.warn = (...args: unknown[]) => {
      originalConsoleWarn(...args);
      postReport({
        source: "console.warn",
        message: buildMessage(args),
        ...getContext(),
      });
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
};
