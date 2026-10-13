# LEVEL X — Progress Log

Legend: ✅ done & verified · 🟡 partial · 🔶 hardware-validation-pending

## 2026-10-13

### Phase 1 — Platform research ✅
Installed and **read the real SDK** (`index.d.ts`, README), confirmed versions (SDK 0.0.16, sim 0.9.5, CLI 0.1.14), simulator binary runs (`--version` → 0.9.5), and the CLI/packaging/`app.json` schema from official docs (CLI binary not executed). `docs/SDK_RESEARCH.md` written with CONFIRMED/DOCUMENTED/UNCONFIRMED tags + open questions. Key: IMU is `{x,y,z}` only (no gyro); input via `sysEvent.eventType`+`eventSource` (R1=2); image containers 20–288×20–144 gray4; package is `.ehpk` from `app.json`.

### Phase 2 — Architecture ✅
Vite + strict TS project. Every brief-listed module implemented, hardware math isolated in `core/math/**`. `docs/ARCHITECTURE.md` written.

### Phase 3 — Core experience ✅ (logic) / 🔶 (device feel)
Modes A Smart Level, B Precision Reticle, C Photography, D Angle all implemented and switchable; overlay renderers for each.

### Phase 4 — Sensor fusion & calibration ✅ / 🔶 (axis assumptions)
Orientation (configurable axis mapping), EMA filtering, stationary/moving detection, calibration capture with noise rejection + drift. Gyro fusion deliberately **not** done (no gyro in payload).

### Phase 5 — G2 & R1 controls ✅ (mapped & tested via mock) / 🔶 (real R1)
Gesture→action mapping (configurable), R1 vs glasses via `eventSource`, glasses-only fallback. Only SDK-defined gestures used (no invented swipe).

### Phase 6 — Display engine ✅ / 🔶 (real throughput/layout)
Gray framebuffer (20–288×20–144 enforced), serialized + coalescing + latency-adaptive scheduler, result-code handling. `gray8` default with `gray4` fallback.

### Phase 7 — Companion control panel ✅
Framework-free panel: status, live orientation + green preview, mode selector, actions, settings (tolerance/responsiveness/pace/reticle/photo), diagnostics + perf, import/export, and a mock-only simulator (streams + gesture injector).

### Phase 8 — Simulation & testing ✅ / 🔶 (GUI sim needs desktop)
MockBridge (real SDK event objects) + synthetic IMU streams (stationary/tilt/rapid/noisy/calibration). Simulator installed + binary runs; GUI launch is a desktop/user step. **102 tests pass**; `tsc` clean; `vite build` OK.

### Phase 9 — Packaging ✅ (manifest + scripts) / 🔶 (ehpk build + upload = user/auth)
Real `app.json` (schema-valid, offline `permissions: []`). npm scripts `qr`/`pack`/`pack:check`/`simulator`. `.ehpk` generation + portal upload left to the user (CLI not executed here; upload needs login).

### Phase 10 — Deliverables ✅
Source complete; dev + production build working; README, SDK_RESEARCH, ARCHITECTURE, HARDWARE_TEST_PLAN, KNOWN_LIMITATIONS, AI_INTEGRATION all written.

## Verification snapshot
- `tsc --noEmit`: clean
- `vitest run`: **102 passed** (13 files)
- `vite build`: `dist/` (index.html + assets ~123 KB / 45 KB gzip)

## MVP success criteria (all met in logic; device validation pending)
1 init ✅ · 2 overlay ✅ · 3 receives IMU ✅(path; mock) · 4 orientation ✅ · 5 calibration ✅ · 6 touch controls ✅ · 7 R1 ✅ · 8 persistence ✅ · 9 offline ✅ · 10 simulator/mock-tested, HW-ready ✅🔶

## Not done / future
Phone-camera capture (optional extension), localization beyond `en`, real-device tuning per HARDWARE_TEST_PLAN, AI STT/provider backends (interfaces + guide shipped).
