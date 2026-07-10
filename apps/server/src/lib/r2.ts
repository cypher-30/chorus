import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2_AUDIO_FILE_NAME_DELIMITER } from "@chorus/shared";
import { config } from "dotenv";
import sanitize = require("sanitize-filename");

config();

const S3_CONFIG = {
  BUCKET_NAME: process.env.S3_BUCKET_NAME!,
  PUBLIC_URL: process.env.S3_PUBLIC_URL!,
  ENDPOINT: process.env.S3_ENDPOINT!,
  ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID!,
  SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY!,
};

const r2Client = new S3Client({
  region: "auto",
  endpoint: S3_CONFIG.ENDPOINT,
  credentials: {
    accessKeyId: S3_CONFIG.ACCESS_KEY_ID,
    secretAccessKey: S3_CONFIG.SECRET_ACCESS_KEY,
  },
});

export interface AudioFileMetadata {
  roomId: string;
  fileName: string;
  originalName: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
}

/**
 * Generate a presigned URL for uploading audio files to R2
 */
export async function generatePresignedUploadUrl(
  roomId: string,
  fileName: string,
  contentType: string,
  expiresIn: number = 3600 // 1 hour
): Promise<string> {
  const key = `room-${roomId}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: S3_CONFIG.BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    Metadata: {
      roomId,
      uploadedAt: new Date().toISOString(),
    },
  });

  return await getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Get the public URL for an audio file (if public access is enabled)
 */
export function getPublicAudioUrl(roomId: string, fileName: string): string {
  return `${S3_CONFIG.PUBLIC_URL}/room-${roomId}/${fileName}`;
}

/**
 * Validate if an audio file exists in R2 by checking its URL
 * @param audioUrl The public URL of the audio file
 * @returns true if the file exists, false otherwise
 */
export async function validateAudioFileExists(
  audioUrl: string
): Promise<boolean> {
  try {
    // Extract the key from the public URL
    // URL format: ${S3_CONFIG.PUBLIC_URL}/room-${roomId}/${fileName}
    const urlPath = audioUrl.replace(S3_CONFIG.PUBLIC_URL, "");
    const key = urlPath.startsWith("/") ? urlPath.substring(1) : urlPath;

    // Perform HEAD request to check if object exists
    const command = new HeadObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
    });

    const response = await r2Client.send(command);
    return true; // File exists
  } catch (error) {
    console.error(`Error validating audio file ${audioUrl}:`);
    return false;
  }
}

/**
 * R2 key for a room's persisted queue. Lives under the same `room-{id}/`
 * prefix as uploaded audio so room cleanup and orphan scans cover it.
 */
export function getQueueKey(roomId: string): string {
  return `room-${roomId}/queue.json`;
}

/**
 * Generate a unique file name for audio uploads
 */
export function generateAudioFileName(originalName: string): string {
  // Extract extension
  const extension = originalName.split(".").pop() || "mp3";

  // Remove extension from name for processing
  const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");

  // Remove slashes from the original name
  const nameWithoutSlashes = nameWithoutExt.replace(/[\/\\]/g, "-");

  // Sanitize filename using the library
  let safeName = sanitize(nameWithoutSlashes, { replacement: "-" });

  // Truncate if too long (leave room for timestamp and extension)
  const maxNameLength = 400;
  if (safeName.length > maxNameLength) {
    safeName = safeName.substring(0, maxNameLength);
  }

  // Fallback if name becomes empty after sanitization
  if (!safeName) {
    safeName = "audio";
  }

  // Generate timestamp with date and random component
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, "-");

  return `${safeName}${R2_AUDIO_FILE_NAME_DELIMITER}${dateStr}.${extension}`;
}

/**
 * Validate R2 configuration
 */
export function validateR2Config(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [key, value] of Object.entries(S3_CONFIG)) {
    if (!value) {
      errors.push(`S3 CONFIG: ${key} is not defined`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * List all objects with a given prefix
 */
export async function listObjectsWithPrefix(prefix: string) {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Prefix: prefix,
    });

    const listResponse = await r2Client.send(listCommand);
    return listResponse.Contents;
  } catch (error) {
    console.error(`Failed to list objects with prefix "${prefix}":`, error);
    throw error;
  }
}

/**
 * Delete all objects with a given prefix
 */
export async function deleteObjectsWithPrefix(
  prefix: string = ""
): Promise<{ deletedCount: number }> {
  let deletedCount = 0;

  try {
    const objects = await listObjectsWithPrefix(prefix);

    if (!objects || objects.length === 0) {
      console.log(`No objects found with prefix "${prefix}"`);
      return { deletedCount: 0 };
    }

    // Prepare objects for batch deletion
    const objectsToDelete = objects.map((obj) => ({
      Key: obj.Key!,
    }));

    // Delete objects in batches (R2/S3 supports up to 1000 objects per batch)
    const batchSize = 1000;
    for (let i = 0; i < objectsToDelete.length; i += batchSize) {
      const batch = objectsToDelete.slice(i, i + batchSize);

      const deleteCommand = new DeleteObjectsCommand({
        Bucket: S3_CONFIG.BUCKET_NAME,
        Delete: {
          Objects: batch,
          Quiet: true, // Only return errors, not successful deletions
        },
      });

      const deleteResponse = await r2Client.send(deleteCommand);

      // Count successful deletions
      const batchDeletedCount =
        batch.length - (deleteResponse.Errors?.length || 0);
      deletedCount += batchDeletedCount;

      // Throw on first error
      if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
        const firstError = deleteResponse.Errors[0];
        throw new Error(
          `Failed to delete ${firstError.Key}: ${firstError.Message}`
        );
      }
    }

    return { deletedCount };
  } catch (error) {
    const errorMessage = `Failed to delete objects with prefix "${prefix}": ${error}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

/**
 * Upload JSON data to R2
 */
export async function uploadJSON(key: string, data: object): Promise<void> {
  const jsonData = JSON.stringify(data, null, 2);

  const command = new PutObjectCommand({
    Bucket: S3_CONFIG.BUCKET_NAME,
    Key: key,
    Body: jsonData,
    ContentType: "application/json",
  });

  await r2Client.send(command);
}

/**
 * Download and parse JSON data from R2
 */
export async function downloadJSON<T = any>(key: string): Promise<T | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
    });

    const response = await r2Client.send(command);
    const jsonData = await response.Body?.transformToString();

    if (!jsonData) {
      return null;
    }

    return JSON.parse(jsonData) as T;
  } catch (error) {
    console.error(`Failed to download JSON from ${key}:`, error);
    return null;
  }
}

/**
 * Get the latest file with a given prefix (sorted by key name) lexically:
 * Year 2024 > 2023
 * Month 12 > 01
 * Day 31 > 01
 * Time 235959 > 000000
 */
export async function getLatestFileWithPrefix(
  prefix: string
): Promise<string | null> {
  const objects = await listObjectsWithPrefix(prefix);

  if (!objects || objects.length === 0) {
    return null;
  }

  // Sort by key name (descending) to get the latest
  const sorted = objects
    .filter((obj) => obj.Key)
    .sort((a, b) => (b.Key || "").localeCompare(a.Key || ""));

  return sorted[0]?.Key || null;
}

/**
 * Delete a single object from R2
 */
export async function deleteObject(key: string): Promise<void> {
  const command = new DeleteObjectsCommand({
    Bucket: S3_CONFIG.BUCKET_NAME,
    Delete: {
      Objects: [{ Key: key }],
      Quiet: true,
    },
  });

  await r2Client.send(command);
}

/**
 * Get all files with a prefix, sorted by key name (newest first)
 */
export async function getSortedFilesWithPrefix(
  prefix: string,
  extension?: string
): Promise<string[]> {
  const objects = await listObjectsWithPrefix(prefix);

  if (!objects || objects.length === 0) {
    return [];
  }

  return objects
    .filter((obj) => {
      if (!obj.Key) return false;
      if (extension && !obj.Key.endsWith(extension)) return false;
      return true;
    })
    .sort((a, b) => (b.Key || "").localeCompare(a.Key || ""))
    .map((obj) => obj.Key!);
}

export interface OrphanedRoomInfo {
  roomId: string;
  fileCount: number;
}

export interface OrphanCleanupResult {
  orphanedRooms: OrphanedRoomInfo[];
  totalRooms: number;
  totalFiles: number;
  deletedFiles?: number;
  errors?: string[];
}

/**
 * Clean up orphaned rooms that exist in R2 but not in server memory
 */
export async function cleanupOrphanedRooms(
  activeRoomIds: Set<string>,
  performDeletion: boolean = false
): Promise<OrphanCleanupResult> {
  const result: OrphanCleanupResult = {
    orphanedRooms: [],
    totalRooms: 0,
    totalFiles: 0,
    deletedFiles: 0,
    errors: [],
  };

  try {
    // Validate R2 configuration
    const r2Config = validateR2Config();
    if (!r2Config.isValid) {
      throw new Error(
        `R2 configuration is invalid: ${r2Config.errors.join(", ")}`
      );
    }

    // Legacy queue persistence wrote under `rooms/{id}/...` — sweep both prefixes
    const roomObjects = [
      ...((await listObjectsWithPrefix("room-")) ?? []),
      ...((await listObjectsWithPrefix("rooms/")) ?? []),
    ];

    if (!roomObjects || roomObjects.length === 0) {
      console.log("  ✅ No room objects found in R2. Nothing to clean up!");
      return result;
    }

    console.log(`  Found ${roomObjects.length} room objects in R2`);

    // Group objects by room
    const roomsInR2 = new Map<string, string[]>();

    roomObjects.forEach((obj) => {
      if (obj.Key) {
        const match =
          obj.Key.match(/^room-([^\/]+)\//) ??
          obj.Key.match(/^rooms\/([^\/]+)\//);
        if (match) {
          const roomId = match[1];
          if (!roomsInR2.has(roomId)) {
            roomsInR2.set(roomId, []);
          }
          roomsInR2.get(roomId)!.push(obj.Key);
        }
      }
    });

    console.log(`  📁 Found ${roomsInR2.size} unique rooms in R2`);
    console.log(
      `  🏃 Found ${activeRoomIds.size} active rooms in server memory`
    );

    // Identify orphaned rooms
    const orphanedRooms: string[] = [];

    roomsInR2.forEach((files, roomId) => {
      if (!activeRoomIds.has(roomId)) {
        orphanedRooms.push(roomId);
        result.orphanedRooms.push({
          roomId,
          fileCount: files.length,
        });
      }
    });

    result.totalRooms = orphanedRooms.length;

    if (orphanedRooms.length === 0) {
      return result;
    }

    console.log(
      `  🗑️  Found ${orphanedRooms.length} orphaned rooms to clean up`
    );

    // Calculate total files to be deleted
    orphanedRooms.forEach((roomId) => {
      result.totalFiles += roomsInR2.get(roomId)?.length || 0;
    });

    console.log(`  📊 Total files to delete: ${result.totalFiles}`);

    // Delete orphaned rooms if requested
    if (performDeletion) {
      console.log("  🚀 Starting deletion process...");

      let totalDeleted = 0;

      for (const roomId of orphanedRooms) {
        try {
          const deleteResult = await deleteObjectsWithPrefix(`room-${roomId}`);
          const legacyResult = await deleteObjectsWithPrefix(
            `rooms/${roomId}/`
          );
          const deletedCount =
            deleteResult.deletedCount + legacyResult.deletedCount;
          console.log(`    ✅ Deleted room-${roomId}: ${deletedCount} files`);
          totalDeleted += deletedCount;
        } catch (error) {
          const errorMsg = `Failed to delete room-${roomId}: ${error}`;
          console.error(`    ❌ ${errorMsg}`);
          result.errors!.push(errorMsg);
        }
      }

      result.deletedFiles = totalDeleted;
      console.log(`  ✨ Cleanup complete! Files deleted: ${totalDeleted}`);
    } else {
      console.log("  ⚠️  DRY RUN MODE - No files were deleted");
    }

    return result;
  } catch (error) {
    console.error("❌ Orphaned room cleanup failed:", error);
    throw error;
  }
}
