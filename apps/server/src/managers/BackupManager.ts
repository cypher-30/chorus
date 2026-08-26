import pLimit from "p-limit";
import type { Server } from "bun";
import type { WSBroadcastType } from "@chorus/shared";
import {
  cleanupOrphanedRooms,
  deleteObject,
  downloadJSON,
  getLatestFileWithPrefix,
  getSortedFilesWithPrefix,
  uploadJSON,
  validateAudioFileExists,
} from "../lib/r2";
import { globalManager } from "./GlobalManager";
import {
  RoomBackupType,
  ServerBackupSchema,
  ServerBackupType,
} from "./RoomManager";
import type { WSData } from "../utils/websocket";

interface RoomRestoreResult {
  room: {
    id: string;
    numClients: number;
    numAudioSources: number;
  };
  success: boolean;
  error?: string;
}

export class BackupManager {
  private static readonly BACKUP_PREFIX = "state-backup/";
  private static readonly DEFAULT_RESTORE_CONCURRENCY = 1000;

  /**
   * Restore a single room from backup data
   */
  private static async restoreRoom(
    roomId: string,
    roomData: RoomBackupType,
    server?: Server<WSData>
  ): Promise<RoomRestoreResult> {
    try {
      const room = globalManager.getOrCreateRoom(roomId);

      // This restore runs at process startup, racing handleOpen's own
      // queue.json restore (routes/websocketHandlers.ts) for ownership of
      // audioSources — whichever finishes last wins, with no broadcast to
      // announce the change. If a client has already populated (or restored)
      // a queue for this room by the time we get here, leave it alone;
      // queue.json is the newer, authoritative persistence path.
      if (room.getState().audioSources.length > 0) {
        return {
          room: {
            id: roomId,
            numClients: roomData.clients.length,
            numAudioSources: room.getState().audioSources.length,
          },
          success: true,
        };
      }

      // Concurrently validate all audio sources in R2 (no limit on concurrency)
      const validationPromises = roomData.audioSources.map((source) =>
        validateAudioFileExists(source.url)
      );
      const validationResults = await Promise.all(validationPromises);

      // Filter out audio sources that are not valid
      const validAudioSources = roomData.audioSources.filter(
        (_, index) => validationResults[index]
      );

      // Re-check right before the write: the validation await above is a
      // network round-trip, wide enough for handleOpen's queue.json restore
      // to land in between and populate audioSources after the earlier
      // check passed. No further await happens between this check and the
      // write, so this closes the race rather than narrowing it.
      if (room.getState().audioSources.length > 0) {
        return {
          room: {
            id: roomId,
            numClients: roomData.clients.length,
            numAudioSources: room.getState().audioSources.length,
          },
          success: true,
        };
      }

      // Restore audio sources
      room.setAudioSources(validAudioSources);

      // A client can join between process start and this restore finishing
      // (the R2 validation above is a network round-trip); handleOpen would
      // have sent them an empty queue on join and has no reason to send
      // another one. Tell any such clients about the queue we just filled
      // in — a no-op publish if nobody is subscribed to this room's topic.
      if (server && room.hasActiveConnections()) {
        const message: WSBroadcastType = {
          type: "ROOM_EVENT",
          event: { type: "SET_AUDIO_SOURCES", ...room.getQueueState() },
        };
        server.publish(roomId, JSON.stringify(message));
      }

      // Always schedule cleanup on restoration because we don't know if any clients will reconnect.
      globalManager.scheduleRoomCleanup(roomId);
      return {
        room: {
          id: roomId,
          numClients: roomData.clients.length,
          numAudioSources: validAudioSources.length,
        },
        success: true,
      };
    } catch (error) {
      console.error(`❌ Failed to restore room ${roomId}:`, error);
      return {
        room: {
          id: roomId,
          numClients: roomData.clients.length,
          numAudioSources: roomData.audioSources.length,
        },
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate a timestamped backup filename
   */
  private static generateBackupFilename(): string {
    const now = new Date();
    // Convert ISO timestamp to filename-safe format
    // e.g., "2024-01-15T14:30:45.123Z" -> "2024-01-15_14-30-45"
    const timestamp = now
      .toISOString()
      .replace(/[:.]/g, "-") // Replace colons and dots with dashes
      .replace("T", "_") // Replace T separator with underscore
      .slice(0, -5); // Remove milliseconds and Z suffix
    return `${this.BACKUP_PREFIX}backup-${timestamp}.json`;
  }

  /**
   * Save the current server state to R2
   */
  static async backupState(): Promise<void> {
    try {
      console.log("🔄 Starting state backup...");

      // Collect state from all rooms
      const rooms: ServerBackupType["data"]["rooms"] = {};

      globalManager.forEachRoom((room, roomId) => {
        rooms[roomId] = room.createBackup();
      });

      const backupData: ServerBackupType = {
        timestamp: Date.now(),
        data: { rooms },
      };

      const filename = this.generateBackupFilename();

      // Upload to R2 using the utility function
      await uploadJSON(filename, backupData);

      console.log(
        `✅ State backup completed: ${filename} (${
          rooms ? Object.keys(rooms).length : 0
        } rooms)`
      );

      // Clean up old backups after successful backup
      await this.cleanupOldBackups();
    } catch (error) {
      console.error("❌ State backup failed:", error);
      throw error;
    }
  }

  /**
   * Restore server state from the latest backup in R2
   */
  static async restoreState(server?: Server<WSData>): Promise<boolean> {
    try {
      console.log("🔍 Looking for state backups...");

      // Get the latest backup file
      const latestBackupKey = await getLatestFileWithPrefix(this.BACKUP_PREFIX);

      if (!latestBackupKey) {
        console.log("📭 No backups found");

        // Still clean up orphaned rooms even if no backup exists
        await this.cleanupOrphanedRooms();

        return false;
      }

      console.log(`📥 Restoring from: ${latestBackupKey}`);

      // Download and parse the backup
      const rawBackupData = await downloadJSON(latestBackupKey);

      if (!rawBackupData) {
        throw new Error("Failed to read backup data");
      }

      // Validate backup data with Zod schema
      const parseResult = ServerBackupSchema.safeParse(rawBackupData);

      if (!parseResult.success) {
        throw new Error(
          `Invalid backup data format: ${parseResult.error.message}`
        );
      }

      const backupData = parseResult.data;

      // Get configurable concurrency limit
      const concurrency = this.DEFAULT_RESTORE_CONCURRENCY;
      const limit = pLimit(concurrency);

      const roomEntries = Object.entries(backupData.data.rooms);
      console.log(
        `🔄 Restoring ${roomEntries.length} rooms with concurrency limit of ${concurrency}...`
      );

      // Process rooms in parallel with concurrency control using p-limit
      const restorePromises = roomEntries.map(([roomId, roomData]) =>
        limit(() => this.restoreRoom(roomId, roomData, server))
      );

      const results = await Promise.allSettled(restorePromises);

      // Analyze results
      const successful: RoomRestoreResult[] = [];
      const failed: RoomRestoreResult[] = [];

      results.forEach((result) => {
        if (result.status !== "fulfilled") {
          failed.push(result.reason);
          return;
        }

        if (result.value.success) {
          successful.push(result.value);
        } else {
          failed.push(result.value);
        }
      });

      const ageMinutes = Math.floor(
        (Date.now() - backupData.timestamp) / 60000
      );

      console.log(
        `✅ State restoration completed from ${ageMinutes} minutes ago:`
      );
      console.log(`   - Successfully restored ${successful.length} rooms`);
      if (successful.length > 0) {
        successful.forEach((result) => {
          console.log(
            `     Room ${result.room.id}: ${result.room.numClients} clients, ${result.room.numAudioSources} audio sources`
          );
        });
      }

      if (failed.length > 0) {
        console.log(`   - Failed to restore: ${failed.length} rooms`);
        failed.forEach((failure) => {
          console.log(`     ❌ ${failure.room.id}: ${failure.error}`);
        });
      }

      // Clean up orphaned rooms after state restore
      await this.cleanupOrphanedRooms();

      return true;
    } catch (error) {
      console.error("❌ State restore failed:", error);
      return false;
    }
  }

  /**
   * Clean up old backups (keep last N backups)
   */
  static async cleanupOldBackups(keepCount: number = 5): Promise<void> {
    try {
      // Get all backup files sorted by name (newest first)
      const backupFiles = await getSortedFilesWithPrefix(
        this.BACKUP_PREFIX,
        ".json"
      );

      if (backupFiles.length <= keepCount) {
        return; // Nothing to clean up
      }

      // Identify files to delete (everything after the first keepCount)
      const filesToDelete = backupFiles.slice(keepCount);

      // Delete old backups
      for (const fileKey of filesToDelete) {
        try {
          await deleteObject(fileKey);
          console.log(`  🗑️ Deleted: ${fileKey}`);
        } catch (error) {
          console.error(`  ❌ Failed to delete ${fileKey}:`, error);
        }
      }

      console.log(
        `✅ Cleanup completed. Kept ${keepCount} most recent backups.`
      );
    } catch (error) {
      // Don't throw - cleanup failures shouldn't break the backup process
      console.error("⚠️ Backup cleanup failed (non-critical):", error);
    }
  }

  /**
   * Clean up orphaned rooms that exist in R2 but not in server memory
   */
  static async cleanupOrphanedRooms(): Promise<void> {
    try {
      console.log("🧹 Cleaning up orphaned rooms...");

      const activeRooms = new Set<string>(globalManager.getRoomIds());
      await cleanupOrphanedRooms(activeRooms, true);
    } catch (error) {
      // Don't throw - cleanup failures shouldn't break the restore process
      console.error("⚠️ Orphaned room cleanup failed:", error);
    }
  }
}
