import {
  ClientActionEnum,
  ExtractWSRequestFrom,
  WSRequestType,
} from "@chorus/shared";
import type { Server, ServerWebSocket } from "bun";
import { z } from "zod";
import { WSData } from "../utils/websocket";

// Base handler function type
export type HandlerFunction<T = WSRequestType> = (data: {
  ws: ServerWebSocket<WSData>;
  message: T;
  server: Server<WSData>;
}) => Promise<void>;

// Handler definition map type
export type WebsocketRegistry = {
  [ClientAction in z.infer<typeof ClientActionEnum>]: {
    handle: HandlerFunction<ExtractWSRequestFrom[ClientAction]>;
    description?: string;
  };
};
