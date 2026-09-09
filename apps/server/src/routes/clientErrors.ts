import { z } from "zod";
import { errorResponse, jsonResponse } from "../utils/responses";

const MAX_LOGS = 300;
const MAX_MESSAGE_LEN = 1500;
const MAX_STACK_LEN = 4000;
const MAX_FIELD_LEN = 300;

const ClientErrorPayloadSchema = z.object({
  source: z.string().min(1).max(60),
  message: z.string().min(1).max(MAX_MESSAGE_LEN),
  stack: z.string().max(MAX_STACK_LEN).optional(),
  href: z.string().max(MAX_FIELD_LEN).optional(),
  userAgent: z.string().max(MAX_FIELD_LEN).optional(),
  file: z.string().max(MAX_FIELD_LEN).optional(),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
  deviceHint: z.string().max(MAX_FIELD_LEN).optional(),
});

type ClientErrorPayload = z.infer<typeof ClientErrorPayloadSchema>;

interface ClientErrorEntry extends ClientErrorPayload {
  id: number;
  receivedAt: number;
  ip?: string;
}

let nextErrorId = 1;
const clientErrorLogs: ClientErrorEntry[] = [];

const extractRequestIp = (req: Request): string | undefined => {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim();
  }

  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return undefined;
};

const trimLogs = () => {
  if (clientErrorLogs.length <= MAX_LOGS) return;
  clientErrorLogs.splice(0, clientErrorLogs.length - MAX_LOGS);
};

const summarize = (entry: ClientErrorEntry) => {
  const locationBits = [entry.file, entry.line, entry.column]
    .filter((v) => v !== undefined && v !== "")
    .join(":");
  const where = locationBits || entry.href || "unknown-location";
  return `${entry.source} @ ${where} - ${entry.message}`;
};

const handlePostClientError = async (req: Request) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const parsed = ClientErrorPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid client error payload", 400);
  }

  const entry: ClientErrorEntry = {
    id: nextErrorId++,
    receivedAt: Date.now(),
    ip: extractRequestIp(req),
    ...parsed.data,
  };

  clientErrorLogs.push(entry);
  trimLogs();

  console.error(`[client-error] ${summarize(entry)}`);
  if (entry.stack) {
    console.error(entry.stack);
  }

  return jsonResponse({ ok: true, id: entry.id });
};

const handleGetClientErrors = (req: Request) => {
  const url = new URL(req.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(200, Math.max(1, Math.floor(requestedLimit)))
    : 50;

  const logs = clientErrorLogs.slice(-limit).reverse();
  return jsonResponse({
    count: logs.length,
    total: clientErrorLogs.length,
    logs,
  });
};

const handleDeleteClientErrors = () => {
  clientErrorLogs.splice(0, clientErrorLogs.length);
  return jsonResponse({ ok: true, cleared: true });
};

export const handleClientErrors = async (req: Request) => {
  if (req.method === "POST") return handlePostClientError(req);
  if (req.method === "GET") return handleGetClientErrors(req);
  if (req.method === "DELETE") return handleDeleteClientErrors();
  return errorResponse("Method not allowed", 405);
};
