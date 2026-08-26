import { ClientType, GRID } from "@chorus/shared";

/**
 * Positions clients in a circle around a center point.
 *
 * Clients with hasManualPosition (dragged into place via MOVE_CLIENT) are
 * left where they are — only the remaining auto-placed clients are spread
 * evenly around the circle, so a manual placement survives other clients
 * joining or leaving.
 * @param clients Map of clients to position
 */
export function positionClientsInCircle(
  clients: Map<string, ClientType>
): void {
  const autoClients = Array.from(clients.values()).filter(
    (client) => !client.hasManualPosition
  );
  const autoCount = autoClients.length;

  autoClients.forEach((client, index) => {
    // Calculate position on the circle. For a single remaining client this
    // reduces to angle = -π/2, i.e. straight up from center — the same
    // point the old single-client special case set explicitly.
    const angle = (index / autoCount) * 2 * Math.PI - Math.PI / 2;
    client.position = {
      x: GRID.ORIGIN_X + GRID.CLIENT_RADIUS * Math.cos(angle),
      y: GRID.ORIGIN_Y + GRID.CLIENT_RADIUS * Math.sin(angle),
    };
  });
}

/**
 * Debug function to print client positions
 * @param clients Map of clients to debug
 */
export function debugClientPositions(clients: Map<string, ClientType>): void {
  console.log("Client Positions:");
  clients.forEach((client, id) => {
    console.log(`Client ${id}: x=${client.position.x}, y=${client.position.y}`);
  });
}
