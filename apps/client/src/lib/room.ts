export const validatePartialRoomId = (roomId: string) => {
  return /^\d*$/.test(roomId);
};

export const validateFullRoomId = (roomId: string) => {
  return /^[0-9]{6}$/.test(roomId);
};

export const createUserId = () => {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  } else {
    // Fallback for insecure contexts
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }
};

/**
 * Stable per-tab client identity so reconnects keep the same clientId
 * (admin status, spatial gains). sessionStorage keeps two tabs distinct.
 */
export const getStableClientId = (roomId: string): string => {
  if (typeof window === "undefined") return "";
  const key = `chorus-client-id-${roomId}`;
  try {
    let id = window.sessionStorage.getItem(key);
    if (!id) {
      id = createUserId();
      window.sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return createUserId();
  }
};
