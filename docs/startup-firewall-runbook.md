# Chorus Startup + Firewall Runbook (Windows + WSL)

Last updated: 2026-08-27

This is the single source of truth for:
- what to run each time you start Chorus,
- what to do when a second device is stuck on "Reconnecting",
- what was fixed in code vs what remains manual.

## 1) Daily startup commands

From repo root (`Chorus`):

```bash
bun run up
```

If `bun` is not on your WSL `PATH` on this machine, use:

```bash
/mnt/c/Users/Alvin/.bun/bin/bun.exe run up
```

What this does:
- Starts server first (`:8080`) and waits for `/health`.
- Starts client (`:3000`) after server is healthy.
- Auto-selects reachable host mode (LAN preferred).

Optional explicit mode:

```bash
bun run dev:lan
bun run dev:tailscale
```

## 2) Quick preflight before multi-device testing

Run:

```bash
bun run verify:3-device
```

Then open these checks in a browser on the host:
- `http://<host-ip>:8080/health`
- `http://<host-ip>:8080/active-rooms`

If both are good, join from device 2 at `http://<host-ip>:3000`.

## 3) If device 2 is stuck on "Reconnecting"

Most likely cause in this incident: Windows Firewall blocked inbound traffic to port `8080` over Tailscale/private profile.

### Step-by-step (GUI, recommended)

1. Press `Win` and search `Windows Defender Firewall with Advanced Security`.
2. Open `Inbound Rules`.
3. Find rule: `Block-MediaAdmin-FromTailscale`.
4. Open the rule -> go to `Protocols and Ports`.
5. In `Local port`, remove `8080` from the blocked port list.
6. Save the rule.
7. Still in `Inbound Rules`, create a new allow rule:
   - Rule Type: `Program`
   - Program path: `C:\Users\Alvin\.bun\bin\bun.exe`
   - Action: `Allow the connection`
   - Profiles: check `Private` (and `Public` if you also use LAN on public profile)
   - Name: `Allow Chorus Bun 8080`
8. Edit that new rule -> `Protocols and Ports` -> set:
   - Protocol: `TCP`
   - Local port: `8080`
9. Apply and close.

### Step-by-step (PowerShell / netsh alternative)

Run in an elevated terminal (Run as Administrator):

```powershell
netsh advfirewall firewall add rule name="Allow Chorus Bun 8080 Private" dir=in action=allow program="C:\Users\Alvin\.bun\bin\bun.exe" protocol=TCP localport=8080 profile=private
```

If you want LAN + Tailscale in all profiles:

```powershell
netsh advfirewall firewall add rule name="Allow Chorus Bun 8080 AllProfiles" dir=in action=allow program="C:\Users\Alvin\.bun\bin\bun.exe" protocol=TCP localport=8080 profile=any
```

Note: removing `8080` from an existing block rule that also protects other apps is safer in GUI so you do not accidentally change unrelated blocked ports.

## 4) Verify firewall fix worked

1. Restart Chorus cleanly:

```bash
bun run up
```

2. On second device, open `http://<host-ip>:3000`.
3. Join a room and confirm reconnect loop is gone.
4. If still failing, test server reachability from another machine:
   - `http://<host-ip>:8080/health` should load.

## 5) Incident status (done vs pending)

### Done in code
- Typed WS error path added end-to-end (`ERROR` schema + server unicast + client toast handling).
- WS open/message failure paths now produce actionable client feedback instead of silent drops.
- `handleOpen` hardened so one failure does not strand room presence updates.
- Queue update wedge fixed: one bad audio decode no longer blocks future queue updates.
- Upload path now preserves track title in queue entries.
- Playback guards added to avoid poisoned state when pause/play race with unloaded buffers.
- Reconnect UX copy now hints at blocked host path / port 8080 scenarios.
- 2026-09-09: `bun run verify:3-device` now resolves the same LAN/Tailscale address `bun run up` would use (reusing its detection logic) and hard-fails if it can only find loopback, instead of always passing against `localhost` regardless of whether the firewall actually blocks anything. Step 2 below is now real evidence, not a no-op check. Record the run in `docs/verification-runs/`.

### Pending manual environment action
- Windows Firewall rules on your machine (remove accidental block on `8080`, allow `bun.exe` on private profile) — still not applied as of 2026-09-09. Once you do, re-run `bun run verify:3-device` (it will now tell you honestly whether the LAN/Tailscale path is open) and move this line to "Done in code" with the date.

### Known environment caveat
- Google Fonts fetch can timeout in some networks during dev compile; this is separate from WS reconnect/firewall issues.

## 6) If yt-dlp auto-fetch keeps failing

Symptoms:
- server logs repeatedly show `yt-dlp failed for "..."` while queue entries stay pending/failed.

Steps:
1. Update yt-dlp on the host machine:

```bash
yt-dlp -U
```

2. Confirm both binaries are available in the same shell used to run Chorus:

```bash
yt-dlp --version
ffmpeg -version
```

3. Restart Chorus:

```bash
bun run up
```

4. Retry one failed pending track from Queue (or via `POST /ingest/retry`).

Note: some tracks still fail due upstream source/region restrictions; that is expected. In those cases, use Upload/Telegram/manual-source fallback.

If logs mention YouTube captcha (`Video unavailable. YouTube is requiring a captcha challenge before playback`):
1. In `apps/server/.env`, set:

```bash
CHORUS_YTDLP_SEARCH_PREFIXES=ytsearch1,scsearch1
```

2. If challenge persists, also set:

```bash
CHORUS_YTDLP_COOKIES_FROM_BROWSER=chrome
```

3. Restart with `bun run up` and retry the track.
4. If still failing, treat it as upstream anti-bot blocking for your current IP/session and use Upload/Telegram/manual-source fallback for that track.

Tip: repeated joins no longer immediately re-trigger the same failed fetch. Auto-fetch now waits for
`CHORUS_YTDLP_AUTO_RETRY_COOLDOWN_MS` (default 5 minutes) unless you use explicit Retry.

If fetched tracks are only ~30 seconds long, they are usually preview clips from a fallback source.
Set `CHORUS_YTDLP_MIN_DURATION_SECONDS=75` in `apps/server/.env` to reject short snippets automatically.

## 8) If sync drifts after devices are connected

1. Open Sync panel in the room UI.
2. Wait for NTP to reach steady state (near-full measurement ring).
3. Click Recalibrate This Device on the device that sounds late/early.
4. If needed, apply tiny manual nudges (1-20 ms) afterward.

Notes:
- Recalibrate now sends a short NTP burst, then requests a server SYNC anchor.
- Automatic guarded re-sync checks every ~2s and triggers after sustained drift (>~95ms) with a cooldown.
- Recalibrate is not admin-only; any connected listener can run it for their own device.

## 7) "What do I run every time?" short answer

Use this every time from repo root:

```bash
bun run up
```

Only use `dev:lan` or `dev:tailscale` when you explicitly need to force the network path.
