# Chorus 🔊

**Chorus turns multiple devices into one big speaker.** Everyone joins a room with a 6-digit code, and every phone and laptop in the same physical space plays the same audio at the same instant — tightly enough that the room sounds like a single synchronized sound system.

No accounts, no app installs: open the site, enter a code, tap **Start System**.

## How it works

Chorus keeps devices in sync the way NTP keeps clocks in sync:

1. **Clock sync** — each client continuously measures its clock offset against the server (rolling window of 40 measurements, best half by round-trip time averaged). This doubles as the connection heartbeat.
2. **Scheduled playback** — play/pause/seek actions aren't executed immediately. The server broadcasts *"execute at server time T"*, where `T = now + max(client RTTs) + margin` (250 ms – 1 s), and each client converts `T` to local time and starts its Web Audio source node at exactly that moment.
3. **Drift correction** — while playing, each client compares its actual position against the server-anchored expected position every 5 s. Small drift (15–75 ms) is corrected inaudibly with a ±0.3 % playback-rate nudge; large drift triggers a seamless restart at the corrected offset.
4. **Resilience** — clients keep a stable identity across reconnects (admin status survives), auto-resync on reconnect and tab-wake, and the heartbeat runs in a Web Worker so background tabs don't get dropped.

A **Sync measurement** panel in the room dashboard shows live drift, clock offset, and manual per-device nudge controls for verifying sync by eye and ear.

### Two audio paths (not equal citizens)

| Path | How it plays | Sync quality |
|---|---|---|
| **Uploaded files** | Each client downloads the file from R2 and plays it via the Web Audio API at a server-scheduled timestamp | **Tight** — this is the "one big speaker" path (~tens of ms across devices) |
| **Spotify** | Each signed-in user's own Spotify Premium account plays via the Web Playback SDK | **Best effort only** — Spotify gives no scheduled start or sample-level control, so devices land within a few hundred ms of each other |

Rooms also get a server-authoritative shared queue (one shuffle decision for the whole room, no duplicate auto-advance), admin roles with optional admin-only playback control, synced seeking, and an experimental spatial-audio mode that pans volume across devices by their position in the room.

## Monorepo layout

```
apps/client      Next.js (App Router) — UI, Web Audio engine, Spotify SDK
apps/server      Bun HTTP + WebSocket server (port 8080), R2/S3 storage
packages/shared  Zod schemas + constants shared by both (@chorus/shared)
```

Key places to read first:

- `apps/client/src/store/global.tsx` — the heart of the client: Web Audio engine, NTP state, scheduling, drift correction, queue, Spotify actions
- `apps/server/src/managers/RoomManager.ts` — per-room authority: clients, playback state, queue, advance/dedupe, RTT-aware scheduling
- `apps/server/src/websocket/` — type-safe message-type → handler registry
- `packages/shared/types/` — the WebSocket message taxonomy (every message validated with Zod on receipt)

`CLAUDE.md` has a deeper system map; `PLAN.md` tracks the bug audit and roadmap.

## Getting started

Prerequisites: **Bun v1.2.x**.

```bash
bun install
bun dev          # turbo: client (Next.js) + server (bun --hot on :8080)
```

Or individually: `bun run server` / `bun run client`.

### Environment variables

Client (`apps/client/.env.local`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Server HTTP base URL (e.g. `http://localhost:8080`) |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL (e.g. `ws://localhost:8080/ws`) |
| `NEXTAUTH_SECRET` | NextAuth secret |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify login + Web Playback (optional — only for the Spotify path) |

Server (`apps/server/.env`):

| Variable | Purpose |
|---|---|
| `S3_BUCKET_NAME` | R2/S3 bucket for uploaded audio + queue persistence |
| `S3_PUBLIC_URL` | Public base URL clients fetch audio from |
| `S3_ENDPOINT` | R2/S3 endpoint (e.g. `https://<account>.r2.cloudflarestorage.com`) |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | R2/S3 credentials |

Uploads go browser → R2 directly via presigned URLs; the server only brokers URLs and broadcasts the new queue. Room storage is cleaned up 60 s after the last participant leaves.

### Tests & checks

```bash
cd apps/server && bun test        # server suite (sync, queue, advance, permissions, RTT)
cd apps/server && bun run type-check
cd apps/client && bunx tsc --noEmit
bun run cleanup                   # dry-run orphaned R2 cleanup (:live to delete)
```

### Trying the sync

Open two or three browser tabs (or better, separate devices on the same network), join the same room, upload an audio file, and press play. Open the **Sync measurement** panel on each device — the color cycle should flip on all screens at the same instant, and drift should stay within a few tens of ms for a full track.

## Notes & limitations

- Browsers require a user gesture before audio can play — that's what the **Start System** button is for.
- Spotify requires each listener to have their own **Premium** account, and its sync is inherently best-effort (see table above). The synced-speaker experience is the uploaded-files path.
- The Spotify login scope includes `user-top-read` (for the Top Tracks panel); existing users must re-consent on next sign-in.
