import { epochNow, ExtractWSRequestFrom } from "@chorus/shared";
import { sendUnicast } from "../../utils/responses";
import { requireRoom } from "../middlewares";
import { HandlerFunction } from "../types";

export const handleNTPRequest: HandlerFunction<
  ExtractWSRequestFrom["NTP_REQUEST"]
> = async ({ ws, message }) => {
  if (!message.t1) {
    console.error("NTP request received without t1 timestamp");
    return;
  }

  // Update heartbeat for client
  const { room } = requireRoom(ws);
  room.processNTPRequestFrom(ws.data.clientId);

  // Track the client's RTT estimate for RTT-aware action scheduling
  if (message.rtt !== undefined) {
    room.setClientRTT(ws.data.clientId, message.rtt);
  }

  sendUnicast({
    ws,
    message: {
      type: "NTP_RESPONSE",
      t0: message.t0, // Echo back the client's t0
      t1: message.t1, // Server receive time
      t2: epochNow(), // Server send time
    },
  });
};
