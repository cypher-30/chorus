import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";

/**
 * Whether the current user may control room playback, honoring the room's
 * playbackControlsPermissions setting (ADMIN_ONLY restricts to admins).
 */
export const useCanControlPlayback = (): boolean => {
  const userId = useRoomStore((s) => s.userId);
  const connectedClients = useGlobalStore((s) => s.connectedClients);
  const permissions = useGlobalStore((s) => s.playbackControlsPermissions);

  if (permissions === "EVERYONE") return true;
  return (
    connectedClients.find((c) => c.clientId === userId)?.isAdmin ?? false
  );
};
