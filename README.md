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
| **Spotify** | Discovery metadata + optional per-user playback control integrations (search, resolve, playlists, recommendations, play/pause/tracks) | **Not the core sync path** — room-wide scheduled sync is built around uploaded files |

Rooms also get a server-authoritative shared queue (one shuffle decision for the whole room, no duplicate auto-advance), admin roles with optional admin-only playback control, synced seeking, and an experimental spatial-audio mode that pans volume across devices by their position in the room.

## Recent updates (why these were added)

- **Room UI redesign (landing + in-room shell)**: the room experience now uses a card-based `RoomShell` layout with responsive sheet panels for queue/devices/sync controls, replacing the previous dashboard split.
   Why: this reduces visual clutter while keeping every control path available on desktop and mobile.
- **Manual device positioning for spatial audio**: users can now drag their own device in the room map, and that placement persists across normal joins/leaves until "Reset layout" is used.
   Why: this makes spatial panning intentionally placeable instead of purely auto-arranged.
- **Live "Playing Now" landing cards**: the join page now shows active rooms with track title, listener count, queue length, quick-join action, and coarse presence hints (country flags when available).
   Why: this gives newcomers immediate proof the system is alive and reduces friction to joining active sessions.
- **Richer `/active-rooms` payload**: server now returns `{ totalListeners, rooms[] }` instead of a single number, so the homepage can render meaningful room previews.
   Why: the old count-only endpoint could not power discovery or quick room hopping.
- **Optional coarse location metadata from edge headers** (`x-vercel-ip-country` / `cf-ipcountry`): used only for aggregated room presence badges.
   Why: this mirrors BeatSync's global-presence feel without depending on third-party geolocation APIs.
- **`/health` endpoint**: returns basic service health (`status`, uptime, active rooms/listeners).
   Why: simplifies deployment checks, uptime monitors, and quick debugging.

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
| `TELEGRAM_BOT_TOKEN` | Telegram upload bot (optional — see below); if unset the bot is disabled |

Uploads go browser → R2 directly via presigned URLs; the server only brokers URLs and broadcasts the new queue. Room storage is cleaned up 60 s after the last participant leaves.

### Add music via Spotify links + Telegram

Spotify is only for discovery — its audio can't be synced. To get a song *playing in sync*, its audio
file has to land in the room's queue. The flow:

1. **Paste a Spotify link** (track, album, or playlist) into the room's "Add by link" box. Its tracks
   fill the queue with album art and titles as greyed **"Needs audio"** placeholders — they're skipped
   during playback until real audio arrives.
2. **Set up the bot once:** create a bot with [@BotFather](https://t.me/BotFather) and put its token in
   `apps/server/.env` as `TELEGRAM_BOT_TOKEN`, then start the server. It long-polls Telegram (no public
   URL needed). In your bot chat, send `/room 123456` (your 6-digit room code) to link the chat.
3. **Supply the audio:** send `/tracks` to get a numbered list of tracks waiting for audio, then send the
   bot an audio file (e.g. one you got from another Telegram music bot) with a caption that identifies
   the pending track. Supported caption forms:
   - track number (`1`, `#1`, `1.`)
   - Spotify track link/URI for that pending entry
   - unique title/artist text match
   The bot uploads it to the room's R2 storage and flips that queue entry to **"Synced ✓"** — playable
   in tight sync, with its Spotify metadata kept.
4. An audio file sent **without** a caption is simply appended to the queue as a new synced track.

Files are capped at ~20 MB by Telegram's bot download limit, which covers normal-length songs.

### Tests & checks

```bash
cd apps/server && bun test        # server suite (sync, queue, advance, permissions, RTT)
cd apps/server && bun run type-check
cd apps/client && bunx tsc --noEmit
```

Health check:

```bash
curl http://localhost:8080/health
```

### Trying the sync

Open two or three browser tabs (or better, separate devices on the same network), join the same room, upload an audio file, and press play. Open the **Sync measurement** panel on each device — the color cycle should flip on all screens at the same instant, and drift should stay within a few tens of ms for a full track.

## Notes & limitations

- Browsers require a user gesture before audio can play — that's what the **Start System** button is for.
- Spotify requires each listener to have their own **Premium** account, and its sync is inherently best-effort (see table above). The synced-speaker experience is the uploaded-files path.
- The Spotify login scope includes `user-top-read` (for the Top Tracks panel); existing users must re-consent on next sign-in.
