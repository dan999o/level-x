# LEVEL X

An Even G2 augmented-reality **precision alignment, reticle, composition, and
angle** application, with an optional voice assistant. Built on the official
`@evenrealities/even_hub_sdk`. Runs fully **offline** — no account, no cloud.

> Status: **MVP complete — simulator/mock-verified, physical-hardware validation
> pending.** No claim of on-G2/R1 testing is made; see
> [`docs/HARDWARE_TEST_PLAN.md`](docs/HARDWARE_TEST_PLAN.md).

## Modes
- **Smart Level** — horizontal/vertical/gravity-relative leveling, 0.1° readout, adjustable tolerance, stable/hold indicators, persistent calibration.
- **Precision Reticle** — crosshair / dot / circle / fine-line overlays, adjustable size/position, tilt + motion feedback. *Visual reference only, not a calibrated sight.*
- **Photography** — rule-of-thirds, horizon, center, symmetry, portrait guides. *No camera required.*
- **Angle** — relative angle from a user-set zero, reference hold, threshold alerts. *Gravity-relative; no yaw.*
- **AI assistant** — optional, experimental, offline-safe. See [`docs/AI_INTEGRATION.md`](docs/AI_INTEGRATION.md).

## What's verified here
- `npm run typecheck` → clean · `npm run test` → **102 passing** · `npm run build` → `dist/` produced.
- End-to-end MVP flow proven through a mock bridge + jsdom panel test: init, IMU→orientation, overlay render, touch/R1 input, calibration, persistence, offline, lifecycle, shutdown.

## Requirements
Node ≥ 20 (built on 26). Install: `npm install`.

## Develop
```bash
npm run dev            # Vite dev server (note the http://localhost:<port> URL)
npm run simulator      # official simulator against the dev server (needs a desktop session)
npm run qr             # QR to sideload into the Even phone app (dev mode)
```
Run in a plain browser with `?mock=1` to use the offline MockBridge — the panel
then shows a live overlay preview, an IMU **stream simulator**, and a **gesture
injector** (click/double/long/scroll/ring/menu). Append `?real=1` to force the
real bridge.

### Developer mode setup
1. Install the Even app, sign in, pair the G2 (and R1 if used).
2. Enable developer/sideload mode in the Even app.
3. `npm run dev`, then `npm run qr` and scan — or use the simulator.

## Test
```bash
npm run test           # 102 unit/integration tests (vitest)
npm run verify         # typecheck + test + build in one gate
```

## Build & package
```bash
npm run build          # -> dist/ (entrypoint dist/index.html)
npm run pack:check     # verify the package_id is available (runs the Even CLI)
npm run pack           # -> level-x.ehpk  (evenhub pack app.json dist -o level-x.ehpk)
```
The manifest is [`app.json`](app.json) (schema in `docs/SDK_RESEARCH.md §9`).
**`.ehpk` install is a user step:** `evenhub login`, upload via the EvenHub dev
portal, then open from the Even phone app (an `.ehpk` cannot run directly).

### Build artifact locations
- Web bundle: **`dist/`** (`dist/index.html` + `dist/assets/*`).
- Package (after `npm run pack`): **`level-x.ehpk`** in the project root.

## Physical G2/R1 checklist
Follow [`docs/HARDWARE_TEST_PLAN.md`](docs/HARDWARE_TEST_PLAN.md). The IMU axis
mapping, pace→Hz relationship, display byte layout, and panel resolution are the
first things to confirm on device.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Blank page / "failed to start" in a browser | Append `?mock=1` (no WebView host present). |
| `createPage failed: oversize/outOfMemory` | Reduce containers/canvas; check SDK limits (≤12/8/4/10). |
| Image not shown | Create the image container first (done in `buildPage`), then `updateImageRawData`; if `imageToGray4Failed`/`imageSizeInvalid`, try `toBytes('gray4')` / smaller canvas. |
| Pitch/roll signs inverted on device | Flip `signForward`/`signRight` in the axis mapping (see test plan §2). |
| Readout updates but overlay lags | Expected pacing; tune `baseIntervalMs`/`maxIntervalMs`. |
| `evenhub pack` fails "Entrypoint file not found" | Ensure `dist/index.html` exists (run `npm run build`). |
| Simulator won't open | It renders a GUI window; needs a desktop session (not headless). |

## Docs
- [`docs/SDK_RESEARCH.md`](docs/SDK_RESEARCH.md) — confirmed SDK facts, citations, open questions.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — module map and data flow.
- [`docs/HARDWARE_TEST_PLAN.md`](docs/HARDWARE_TEST_PLAN.md) — on-device checklist.
- [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) — honest status of every feature.
- [`docs/AI_INTEGRATION.md`](docs/AI_INTEGRATION.md) — optional assistant + secure backend.
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — running build log.

## License
MIT (matches the SDK). Reticles are visual references only — not firearm sights
or verified targeting systems.
