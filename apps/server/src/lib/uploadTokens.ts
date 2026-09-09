import { randomUUID } from "node:crypto";

/**
 * Short-lived, single-use tokens authorizing a direct PUT to the local
 * storage route (`routes/upload.ts:handleLocalStorageObject`). In S3/R2
 * mode, AWS's presigned URL itself carries this authorization (signature +
 * expiry); in local-filesystem mode there is no equivalent signing step, so
 * `handleGetPresignedURL` mints one of these tokens bound to the exact
 * roomId/clientId/key it just validated, and the PUT handler consumes it.
 * Without this, the "presigned" URL in local mode is just a public path —
 * anyone who can reach it can write (and fill the disk).
 */

interface UploadTokenData {
  roomId: string;
  clientId: string;
  key: string;
  expiresAt: number;
}

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes — generous for a slow upload, short enough to bound exposure
const tokens = new Map<string, UploadTokenData>();

const pruneExpired = (now: number): void => {
  tokens.forEach((data, token) => {
    if (data.expiresAt <= now) tokens.delete(token);
  });
};

export function mintUploadToken(data: {
  roomId: string;
  clientId: string;
  key: string;
}): string {
  const now = Date.now();
  pruneExpired(now);
  const token = randomUUID();
  tokens.set(token, { ...data, expiresAt: now + TOKEN_TTL_MS });
  return token;
}

/**
 * Consume a token: returns its data if valid and unexpired, null otherwise.
 * Always deletes the token so it can never be replayed, even if validation
 * fails downstream (e.g. the key doesn't match) — a captured or logged
 * token is worthless after one attempt.
 */
export function consumeUploadToken(token: string): UploadTokenData | null {
  const now = Date.now();
  const data = tokens.get(token);
  tokens.delete(token);
  if (!data || data.expiresAt <= now) return null;
  return data;
}

export function resetUploadTokensForTests(): void {
  tokens.clear();
}
