import { useCallback, useEffect, useRef } from "react";
import { useGlobalStore, MAX_NTP_MEASUREMENTS } from "@/store/global";
import { NTP_CONSTANTS } from "@chorus/shared";

interface UseNtpHeartbeatProps {
  onConnectionStale?: () => void;
}

// Worker timers aren't throttled in background tabs, unlike main-thread
// setTimeout (clamped to >=1s, sometimes minutes). The worker just echoes a
// tick id back after the requested delay.
const WORKER_SCRIPT = `self.onmessage = (e) => {
  const { id, delay } = e.data;
  setTimeout(() => self.postMessage({ id }), delay);
};`;

export const useNtpHeartbeat = ({
  onConnectionStale,
}: UseNtpHeartbeatProps) => {
  const ntpTimerRef = useRef<number | null>(null);
  const lastNtpRequestTime = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  // Only the most recently scheduled tick is valid; older ticks are ignored
  const tickIdRef = useRef(0);
  const onTickRef = useRef<(() => void) | null>(null);
  const sendNTPRequest = useGlobalStore((state) => state.sendNTPRequest);

  const getWorker = useCallback((): Worker | null => {
    if (workerRef.current) return workerRef.current;
    try {
      const blob = new Blob([WORKER_SCRIPT], { type: "text/javascript" });
      const worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = (e: MessageEvent<{ id: number }>) => {
        if (e.data.id !== tickIdRef.current) return; // cancelled tick
        onTickRef.current?.();
      };
      workerRef.current = worker;
      return worker;
    } catch (e) {
      console.warn(
        "Worker timer unavailable, falling back to setTimeout",
        e
      );
      return null;
    }
  }, []);

  const clearScheduledTick = useCallback(() => {
    tickIdRef.current++; // invalidates any in-flight worker tick
    if (ntpTimerRef.current) {
      clearTimeout(ntpTimerRef.current);
      ntpTimerRef.current = null;
    }
  }, []);

  const scheduleTick = useCallback(
    (callback: () => void, delayMs: number) => {
      clearScheduledTick();
      const worker = getWorker();
      if (worker) {
        const id = ++tickIdRef.current;
        onTickRef.current = callback;
        worker.postMessage({ id, delay: delayMs });
      } else {
        ntpTimerRef.current = window.setTimeout(callback, delayMs);
      }
    },
    [clearScheduledTick, getWorker]
  );

  // Schedule next NTP request
  const scheduleNextNtpRequest = useCallback(() => {
    // Check if we have a pending request that timed out
    if (
      lastNtpRequestTime.current &&
      Date.now() - lastNtpRequestTime.current >
        NTP_CONSTANTS.RESPONSE_TIMEOUT_MS
    ) {
      console.error("NTP request timed out - connection may be stale");
      // Notify parent component that connection is stale
      onConnectionStale?.();
      return;
    }

    // Determine interval based on whether we have initial measurements
    const currentMeasurements = useGlobalStore.getState().ntpMeasurements;
    const interval =
      currentMeasurements.length < MAX_NTP_MEASUREMENTS
        ? NTP_CONSTANTS.INITIAL_INTERVAL_MS
        : NTP_CONSTANTS.STEADY_STATE_INTERVAL_MS;

    scheduleTick(() => {
      lastNtpRequestTime.current = Date.now();
      sendNTPRequest();
      scheduleNextNtpRequest(); // Schedule the next one
    }, interval);
  }, [sendNTPRequest, onConnectionStale, scheduleTick]);

  // Start the heartbeat when socket opens
  const startHeartbeat = useCallback(() => {
    scheduleNextNtpRequest();
  }, [scheduleNextNtpRequest]);

  // Stop the heartbeat
  const stopHeartbeat = useCallback(() => {
    clearScheduledTick();
    lastNtpRequestTime.current = null;
  }, [clearScheduledTick]);

  // Mark that we received an NTP response
  const markNTPResponseReceived = useCallback(() => {
    lastNtpRequestTime.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopHeartbeat();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [stopHeartbeat]);

  return {
    startHeartbeat,
    stopHeartbeat,
    markNTPResponseReceived,
  };
};
