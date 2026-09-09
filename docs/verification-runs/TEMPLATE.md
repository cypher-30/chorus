# Verification run — YYYY-MM-DD

## Environment

- Server machine: <!-- OS, e.g. Windows 11 + WSL2 -->
- Network path: <!-- LAN | Tailscale | both -->
- Devices used:
  1. <!-- e.g. laptop — Chrome 1xx, Windows -->
  2. <!-- e.g. phone — Safari, iOS -->
  3. <!-- e.g. tablet — Chrome, Android -->
- Storage mode: <!-- local fallback | S3/R2 (bucket name if so) -->
- Spotify credentials available: <!-- yes | no -->
- `TELEGRAM_BOT_TOKEN` configured: <!-- yes | no -->

## Preflight

```
$ bun run verify:3-device
<paste full output verbatim here, including the "Target: ..." line>
```

## Checklist results

Copy every item ID from `docs/3-device-verification.md`. Mark each
`PASS`, `FAIL <what happened>`, or `BLOCKED (reason)` — never leave blank.

### A. Core room sync
- A1:
- A2:
- A3:
- A4:
- A5:
- A6:
- A7:

### B. Upload path
- B1:
- B2:
- B3:

### C. Telegram path
- C1:
- C2:
- C3:
- C4:
- C5:

### D. Spotify and metadata path
- D1:
- D2:
- D3:
- D4:

### E. Quality and observability
- E1:
- E2:
- E3:
- E4:

## Notes / follow-ups

<!-- Anything odd observed, or scope explicitly left out of this run
     (e.g. "D1-D3 blocked: no Spotify credentials in this environment"). -->
