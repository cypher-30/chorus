# Chorus

Real‑time group listening rooms with synchronized playback, room codes, optional spatial audio, and Spotify integration. Monorepo with a Next.js client, a Bun WebSocket/HTTP server, and shared types.

## Features
- Room join/create with 6‑digit codes and random usernames
- Precise sync via WebSockets and NTP‑style measurements (play/pause scheduling)
- Spatial audio controls (start/stop, move clients, set listening source)
- Spotify Web Playback SDK support and search/queue UI
- Audio uploads to S3/R2 using presigned URLs, then broadcast to the room
- Active rooms and stats endpoints for basic telemetry

## Architecture
- Client: Next.js (App Router), React, next-auth, TanStack Query, shadcn/ui
- Server: Bun HTTP + WebSocket, type‑safe dispatcher, S3/R2 SDK
- Shared: Zod type schemas and constants used across client/server

Key locations:
- Client entry: `apps/client/src/app/page.tsx`
- Join flow: `apps/client/src/components/Join.tsx`
- WebSocket manager: `apps/client/src/components/room/WebSocketManager.tsx`
- Spotify: `apps/client/src/components/SpotifyPlayer.tsx`, `apps/client/src/components/SpotifySearch.tsx`
- Server entry: `apps/server/src/index.ts`
- WS handlers: `apps/server/src/routes/websocketHandlers.ts`, `apps/server/src/websocket/*`
- R2/S3 utils: `apps/server/src/lib/r2.ts`
- Shared types: `packages/shared/types/*`

## Prerequisites
- Bun v1.2.x
- Node 18+ (for tooling compatibility)

## Environment Variables

Client (`apps/client`):
- `NEXT_PUBLIC_API_URL` — Base URL for server HTTP API (e.g. `http://localhost:8080`)
- `NEXT_PUBLIC_WS_URL` — WebSocket URL (e.g. `ws://localhost:8080/ws`)
- `NEXTAUTH_SECRET` — NextAuth secret
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — for Spotify login and Web Playback

Server (`apps/server`):
- `S3_BUCKET_NAME` — R2/S3 bucket
- `S3_PUBLIC_URL` — Public base URL for served audio
- `S3_ENDPOINT` — R2/S3 endpoint (e.g. `https://<account>.r2.cloudflarestorage.com`)
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`

## Install

From repo root:

```
bun install
```

## Run (Dev)

In separate terminals or with Turbo filters:

- Server (Bun, port 8080):
  ```
  bun run server
  ```

- Client (Next.js):
  ```
  bun run client
  ```

Alternatively run both via Turbo pipelines:

```
bun run dev
```

## Uploads and Audio
- Client requests a presigned URL from the server, uploads directly to R2/S3, then notifies the server to broadcast the new source.
- Public audio is fetched directly from `S3_PUBLIC_URL` to avoid server bandwidth.

## Notes
- Ensure `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` match the server host/port.
- Spotify playback requires a Premium account and valid credentials.
