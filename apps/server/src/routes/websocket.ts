import type { Server } from "bun";
import { nanoid } from "nanoid";
import { RoomIdSchema } from "@chorus/shared";
import { errorResponse } from "../utils/responses";
import { WSData } from "../utils/websocket";

const MAX_USERNAME_LENGTH = 64;

export const handleWebSocketUpgrade = (
  req: Request,
  server: Server<WSData>
) => {
  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId");
  const username = url.searchParams.get("username");

  if (!roomId || !username) {
    // Check which parameters are missing and log them
    const missingParams = [];

    if (!roomId) missingParams.push("roomId");
    if (!username) missingParams.push("username");

    console.log(
      `WebSocket connection attempt missing parameters: ${missingParams.join(
        ", "
      )}`
    );

    return errorResponse("roomId and username are required");
  }

  // A room ID that isn't a valid 6-digit code would otherwise become a
  // literal storage/cleanup prefix (e.g. "1" matches every room starting
  // with 1) — reject before a RoomManager is ever created for it.
  if (!RoomIdSchema.safeParse(roomId).success) {
    return errorResponse("roomId must be a 6-digit room code");
  }

  if (username.length > MAX_USERNAME_LENGTH) {
    return errorResponse(`username must be ${MAX_USERNAME_LENGTH} characters or fewer`);
  }

  // Reuse a client-supplied stable ID so reconnects keep identity
  // (admin status, spatial gains); fall back to a fresh nanoid
  const requestedClientId = url.searchParams.get("clientId");
  const clientId =
    requestedClientId && /^[\w-]{8,64}$/.test(requestedClientId)
      ? requestedClientId
      : nanoid();

  const rawCountryCode =
    req.headers.get("x-vercel-ip-country") ??
    req.headers.get("cf-ipcountry") ??
    "";
  const countryCode = /^[A-Za-z]{2}$/.test(rawCountryCode)
    ? rawCountryCode.toUpperCase()
    : undefined;
  const city = req.headers.get("x-vercel-ip-city") ?? undefined;
  const region = req.headers.get("x-vercel-ip-country-region") ?? undefined;

  console.log(`User ${username} joined room ${roomId} with userId ${clientId}`);

  const data: WSData = {
    roomId,
    username,
    clientId,
    countryCode,
    city,
    region,
  };

  // Upgrade the connection with the WSData context
  const upgraded = server.upgrade(req, {
    data,
  });

  if (!upgraded) {
    return errorResponse("WebSocket upgrade failed");
  }

  return undefined;
};
