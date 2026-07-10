import { globalManager } from "../managers";
import { errorResponse, jsonResponse } from "../utils/responses";

export const handleRoomExists = (req: Request) => {
  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId");
  if (!roomId) return errorResponse("roomId required", 400);
  return jsonResponse({ exists: globalManager.hasRoom(roomId) });
};
