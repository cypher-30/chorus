# Verification runs

`docs/3-device-verification.md`'s checklist has stayed entirely unchecked across
multiple passes — not because the work wasn't attempted, but because the doc
has ~20 boxes and nowhere to record an outcome. This directory is that place.

## How to use it

1. Copy `TEMPLATE.md` to `YYYY-MM-DD.md` (today's date; append `-2`, `-3`, ...
   if you run more than one pass in a day).
2. Run `bun run verify:3-device` and paste its full output verbatim,
   including the `Target: ...` line — that line is what proves whether the
   run actually exercised the LAN/Tailscale path or fell back to loopback
   (see `scripts/verify-3-device-preflight.mjs`).
3. Work through `docs/3-device-verification.md`'s checklist and mark every
   item `PASS`, `FAIL`, or `BLOCKED (reason)` — not left blank. A blocked
   item (e.g. no Spotify credentials) is a legible, honest outcome; a blank
   one is indistinguishable from "never attempted."
4. Fill in the device/network summary so a future reader knows what was
   actually exercised (which OS/browsers, LAN vs Tailscale, real vs
   synthetic Spotify entries, etc).
5. Commit the file. Do not overwrite a previous run's file — each run gets
   its own dated record, so drift over time (or a regression) is visible in
   the history.

## Index

| Date | Summary | Result |
|---|---|---|
| _(none yet — add a row here each time you record a run)_ | | |
