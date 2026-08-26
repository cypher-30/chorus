import { globalManager } from "../managers";
import { jsonResponse } from "../utils/responses";

export const handleHealth = async (_req: Request) => {
  const activeUsers = await globalManager.getActiveUserCount();

  return jsonResponse({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    activeRooms: globalManager.getRoomCount(),
    activeListeners: activeUsers,
  });
};