import { handleRoot } from "./routes/root";
import { handleStats } from "./routes/stats";
import { handleGetPresignedURL, handleUploadComplete } from "./routes/upload";
import { handleWebSocketUpgrade } from "./routes/websocket";
import { handleGetDefaultAudio } from "./routes/default";
import {
  handleClose,
  handleMessage,
  handleOpen,
} from "./routes/websocketHandlers";
import { corsHeaders, errorResponse } from "./utils/responses";
import { WSData } from "./utils/websocket";
import { BackupManager } from "./managers/BackupManager";
import { getActiveRooms } from "./routes/active";
import { handleRoomExists } from "./routes/roomExists";
import { handleQueueAdd, handleQueueSet } from "./routes/queue";
import { startTelegramBot } from "./telegram/bot";

const SHUTDOWN_BACKUP_TIMEOUT_MS = 8_000;

// Bun.serve with WebSocket support
const server = Bun.serve<WSData, undefined>({
  hostname: "0.0.0.0",
  port: 8080,
  async fetch(req, server) {
    const url = new URL(req.url);

    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      switch (url.pathname) {
        case "/":
          return handleRoot(req);

        case "/ws":
          return handleWebSocketUpgrade(req, server);

        case "/upload/get-presigned-url":
          return handleGetPresignedURL(req);

        case "/upload/complete":
          return handleUploadComplete(req, server);

        case "/stats":
          return handleStats();

        case "/default":
          return handleGetDefaultAudio(req);

        case "/active-rooms":
          return getActiveRooms(req);

        case "/room-exists":
          return handleRoomExists(req);

        case "/queue/set":
          return handleQueueSet(req, server);

        case "/queue/add":
          return handleQueueAdd(req, server);

        default:
          return errorResponse("Not found", 404);
      }
    } catch (err) {
      return errorResponse("Internal server error", 500);
    }
  },

  websocket: {
    open(ws) {
      handleOpen(ws, server);
    },

    message(ws, message) {
      handleMessage(ws, message, server);
    },

    close(ws) {
      handleClose(ws, server);
    },
  },
});

console.log(`HTTP listening on http://${server.hostname}:${server.port}`);

// Optional Telegram upload bot (no-op if TELEGRAM_BOT_TOKEN is unset)
startTelegramBot(server);

// Restore best-effort room state from the latest backup.
void BackupManager.restoreState(server);

// Simple graceful shutdown
let isShuttingDown = false;
const shutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("\n⚠️ Shutting down...");

  server.stop(); // Stop accepting new connections

  try {
    await Promise.race([
      BackupManager.backupState(),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Timed out while backing up state"));
        }, SHUTDOWN_BACKUP_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.error("⚠️ Backup on shutdown failed:", error);
  }

  process.exit(0);
};

// Handle shutdown signals
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
