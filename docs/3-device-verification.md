# Chorus 3-Device Verification and Definition of Done

This is the strict acceptance checklist for calling Chorus "room-sync complete" in a local environment.

## Scope

This verifies the core goal: multiple physical devices in the same room sounding like one synchronized speaker.

## Required setup

- 3 physical devices (for example: laptop + phone + tablet)
- All devices connected to the same network path:
  - same LAN, or
  - same Tailscale tailnet
- Server machine running Chorus (`apps/server`) and client (`apps/client`)
- Windows Firewall configured to allow inbound Chorus traffic on port `8080`
  for the network profile/path you're testing (LAN/Tailscale)
- One storage mode configured:
  - remote object storage (`S3_*`), or
  - local fallback storage (no `S3_*`, server serves `/storage/...`)
- Optional for Telegram path: `TELEGRAM_BOT_TOKEN`
- Optional for Spotify path: valid Spotify credentials + account sign-in

## Preflight script

From repo root:

```bash
bun run verify:3-device
```

Pass criteria:

- Health endpoint responds with `status=ok`
- Active rooms endpoint responds with `{ totalListeners, rooms[] }`
- WebSocket handshake succeeds
- Telegram status endpoint responds (`enabled`, `tokenConfigured`, `reason` semantics)

If preflight fails, do not proceed to sync acceptance testing.

If joins fail with a reconnect loop on a second device, complete
`docs/startup-firewall-runbook.md` before continuing.

## Strict Definition of Done (must all pass)

### A. Core room sync

- [ ] A1: 3 devices join the same room and all show connected state.
- [ ] A2: Start System is tapped on each device (AudioContext unlocked).
- [ ] A3: A synced audio track is played and all 3 devices start together (no obvious stagger).
- [ ] A4: During 3+ minutes continuous playback, no device audibly drifts out of sync.
- [ ] A5: Pause and resume remain synchronized on all 3 devices.
- [ ] A6: One device reconnects (toggle network or refresh) and resyncs correctly.
- [ ] A7: Skip next / previous stays synchronized across all devices.

### B. Upload path (non-Telegram fallback)

- [ ] B1: Upload tab can add local audio files directly to queue.
- [ ] B2: Uploaded track appears for all devices via queue broadcast.
- [ ] B3: Uploaded track plays in sync room-wide.

### C. Telegram path (when enabled)

- [ ] C1: `/telegram/status` shows `enabled=true` (if `enabled=false`, inspect `tokenConfigured` + `reason` and fix before continuing).
- [ ] C2: `/room <code>` links Telegram chat to the active room.
- [ ] C3: `/tracks` lists pending tracks.
- [ ] C4: Sending a matching audio file flips one pending track to synced.
- [ ] C5: The synced track is playable in-room and no longer marked "Needs audio".

### D. Spotify and metadata path (optional sync input path)

- [ ] D1: Spotify Search/Add creates pending queue entries.
- [ ] D2: Link/Playlist/Top/Recent add flows show explicit result feedback.
- [ ] D3: Pending entries can be upgraded through Telegram or replaced by uploaded audio.
- [ ] D4: For at least one failed pending track, Queue Retry drives state transitions (`FAILED -> RETRYING -> FETCHING -> resolved|FAILED`).

### E. Quality and observability

- [ ] E1: `/health` reports healthy state while system is running.
- [ ] E2: `/active-rooms` payload shape is valid while listeners are connected.
- [ ] E3: Room cleanup behavior still works after clients disconnect (manual check).
- [ ] E4: `GET /ingest/status?roomId=<code>` returns room-scoped resolver state for pending tracks.

## Test procedure (3 physical devices)

1. Run multi-device mode on server machine:

```bash
bun run up
```

Or force a specific route:

```bash
bun run dev:lan
bun run dev:tailscale
```

2. On each device, open `http://<server-ip>:3000`.
3. Join the same room code.
4. Use Upload tab to add one local audio file.
5. Press play and listen for start alignment.
6. Keep playback running for 3 minutes and observe drift behavior.
7. Run pause/resume and next/previous from different devices.
8. Refresh one device and confirm auto-resync behavior.
9. If Telegram is enabled, test `/room`, `/tracks`, and file matching.
10. Force one pending track into `FAILED`, press Retry in Queue, and observe a full retry transition.

## Recording results

This checklist has stayed entirely unchecked across multiple verification
passes — there was nowhere to record an outcome once you'd run through it.
See `docs/verification-runs/` for a dated template: copy it, run
`bun run verify:3-device`, paste its output, and mark every item above
`PASS`/`FAIL`/`BLOCKED (reason)` in your copy rather than in this file.
This file stays the checklist definition; `docs/verification-runs/*.md`
holds the actual run history.

## Completion status notes to track

The following were previously open and must be explicitly verified during testing:

- Real-device sync acceptance test with 3 physical devices.
- Storage and Spotify credential verification in your own local environment.
- Active-rooms payload and quick-join quality checks.

Core roadmap phases are otherwise reported closed in PLAN.
