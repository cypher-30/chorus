"use client";

import { SOCIAL_LINKS } from "@/constants";
import { MAX_NTP_MEASUREMENTS, useGlobalStore } from "@/store/global";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

interface SyncProgressProps {
  // Loading state flags
  isLoading?: boolean; // Initial loading phase (room/socket/audio)
  loadingMessage?: string; // Message for initial loading phase

  // Sync state
  isSyncComplete?: boolean; // Whether sync is complete
}

const OuterModal = ({ children }: { children: React.ReactNode }) => {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="w-full max-w-[340px] px-1">{children}</div>
    </motion.div>
  );
};

const Panel = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-7 py-8 text-center"
    initial={{ opacity: 0, y: 5 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, ease: "easeOut" }}
  >
    {children}
  </motion.div>
);

export const SyncProgress = ({
  isLoading = false,
  loadingMessage = "Loading...",
}: SyncProgressProps) => {
  // Internal state for tracking progress animation
  const syncProgress = useGlobalStore(
    (state) => state.ntpMeasurements.length / MAX_NTP_MEASUREMENTS
  );
  const isSyncComplete = useGlobalStore((state) => state.isSynced);
  const setIsInitingSystem = useGlobalStore(
    (state) => state.setIsInitingSystem
  );
  const hasUserStartedSystem = useGlobalStore(
    (state) => state.hasUserStartedSystem
  );
  const [animatedProgress, setAnimatedProgress] = useState(0);

  // Message state based on current progress phase
  const [message, setMessage] = useState("Loading...");

  // Effect to handle initial loading animation (0-20%)
  useEffect(() => {
    // In loading phase, animate progress from 0 to 20%
    if (isLoading) {
      setMessage(loadingMessage);

      const initialLoadInterval = setInterval(() => {
        setAnimatedProgress((prev) => {
          // Cap at 0.19 (19%) to visually indicate we're still loading
          const nextProgress = prev + 0.005;
          return nextProgress >= 0.1 ? 0.1 : nextProgress;
        });
      }, 40);

      return () => clearInterval(initialLoadInterval);
    }

    // In syncing phase, scale progress from 20% to 100%
    setMessage("Measuring offset against the room server");

    // If sync is complete, set to 100%
    if (isSyncComplete) {
      setAnimatedProgress(1);
    } else {
      // Otherwise, scale the syncProgress to 20%-100% range
      setAnimatedProgress(0.1 + syncProgress * 0.9);
    }
  }, [isLoading, syncProgress, isSyncComplete, loadingMessage]);

  // Normalize progress to ensure it's between 0 and 1
  const normalizedProgress = Math.min(Math.max(animatedProgress, 0), 1);

  const reconnectionInfo = useGlobalStore((state) => state.reconnectionInfo);

  // Check if max reconnection attempts have been reached
  const hasReconnectionFailed =
    reconnectionInfo.isReconnecting &&
    reconnectionInfo.currentAttempt >= reconnectionInfo.maxAttempts;

  // If reconnection failed after max attempts
  if (hasReconnectionFailed) {
    return (
      <OuterModal>
        <Panel>
          <motion.div
            className="mb-4 flex size-12 items-center justify-center rounded-full bg-danger-bg text-destructive"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <motion.path
                d="M6 6L18 18M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              />
            </svg>
          </motion.div>

          <motion.h2
            className="mb-1.5 font-display text-[17px] font-semibold"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            Couldn&apos;t reconnect
          </motion.h2>

          <motion.p
            className="mb-5 text-center text-[13px] text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            Unable to establish connection after {reconnectionInfo.maxAttempts}{" "}
            attempts
          </motion.p>

          <motion.a
            href="/"
            className="w-full rounded-full bg-primary px-5 py-2.5 text-center text-sm font-semibold text-primary-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            whileHover={{ scale: 1.015 }}
            transition={{ duration: 0.3 }}
          >
            Retry
          </motion.a>

          <motion.p
            className="mt-4 text-center text-xs text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            Check your connection and try again
          </motion.p>
        </Panel>
      </OuterModal>
    );
  }

  // If reconnecting, show that instead of sync progress
  if (reconnectionInfo.isReconnecting) {
    return (
      <OuterModal>
        <Panel>
          <motion.div
            className="mb-4 flex size-12 items-center justify-center"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" className="text-primary">
              <motion.circle
                cx="6"
                cy="12"
                r="2"
                fill="currentColor"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
              />
              <motion.circle
                cx="12"
                cy="12"
                r="2"
                fill="currentColor"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
              />
              <motion.circle
                cx="18"
                cy="12"
                r="2"
                fill="currentColor"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
              />
            </svg>
          </motion.div>

          <motion.h2
            className="mb-1.5 font-display text-[17px] font-semibold"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            Reconnecting…
          </motion.h2>

          <motion.p
            className="mb-5 text-center text-[13px] text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            Attempt {reconnectionInfo.currentAttempt} of{" "}
            {reconnectionInfo.maxAttempts}
          </motion.p>

          <motion.p
            className="text-center text-xs text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            {
              "You might have a spotty connection or a new deployment is in progress. If this issue persists, please report it on the "
            }
            <a
              href={SOCIAL_LINKS.discord}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Discord
            </a>
            .
          </motion.p>
        </Panel>
      </OuterModal>
    );
  }

  if (isSyncComplete) {
    // If user has already started the system (reconnection), auto-dismiss
    if (hasUserStartedSystem) {
      return null;
    }

    return (
      <OuterModal>
        <Panel>
          <motion.div
            className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <motion.path
                d="M20 6L9 17L4 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              />
            </svg>
          </motion.div>

          <motion.h2
            className="mb-1.5 font-display text-[17px] font-semibold"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            Sync complete
          </motion.h2>

          <motion.p
            className="mb-5 text-center text-[13px] text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            Your device is now synchronized with this room.
          </motion.p>

          <motion.button
            className="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            whileHover={{ scale: 1.015 }}
            transition={{ duration: 0.3 }}
            onClick={() => setIsInitingSystem(false)}
          >
            Start System
          </motion.button>

          <motion.p
            className="mt-4 text-center text-xs text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            Use native device speakers.
          </motion.p>
        </Panel>
      </OuterModal>
    );
  }

  return (
    <OuterModal>
      <Panel>
        <div className="relative mb-3 size-[88px]">
          <svg className="size-full" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="var(--border)"
              strokeWidth="6"
            />

            {/* Progress circle */}
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 42}
              initial={{
                pathLength: 0,
                strokeDashoffset: 2 * Math.PI * 42,
              }}
              animate={{
                pathLength: normalizedProgress,
                strokeDashoffset: 2 * Math.PI * 42 * (1 - normalizedProgress),
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{
                transformOrigin: "center",
                transform: "rotate(-90deg)",
              }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className="font-mono text-base font-medium"
              key={Math.round(normalizedProgress * 100)}
              initial={{ opacity: 0.8 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {`${Math.round(normalizedProgress * 100)}%`}
            </motion.div>
          </div>
        </div>

        <motion.h2
          className="mb-1.5 font-display text-[17px] font-semibold"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          Calibrating clocks
        </motion.h2>

        <motion.p
          className="mb-5 text-center text-[13px] text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          {message}
        </motion.p>

        {/* Progress bar */}
        <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: "0%" }}
            animate={{ width: `${normalizedProgress * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </Panel>
    </OuterModal>
  );
};
