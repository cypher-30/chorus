export const R2_AUDIO_FILE_NAME_DELIMITER = "___";

const STEADY_STATE_INTERVAL_MS = 5000;

// NTP Heartbeat Constants
export const NTP_CONSTANTS = {
  // Initial interval for rapid measurement collection
  INITIAL_INTERVAL_MS: 30,
  // Steady state interval after initial measurements
  STEADY_STATE_INTERVAL_MS: STEADY_STATE_INTERVAL_MS,
  // Timeout before considering connection stale. Generous (6 missed
  // heartbeats) so a throttled background tab or a couple of lost packets
  // don't get the client disconnected.
  RESPONSE_TIMEOUT_MS: 6 * STEADY_STATE_INTERVAL_MS,
  // Maximum number of NTP measurements to collect initially
  MAX_MEASUREMENTS: 40,
} as const;
