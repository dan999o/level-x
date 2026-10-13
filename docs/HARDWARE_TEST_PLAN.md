# LEVEL X — Hardware Test Plan (G2 + R1)

**No physical G2/R1 was available in the build environment.** Everything below is **PENDING** and must be run by a person with the glasses, the Even app (≥ the packed `min_app_version`), and dev mode enabled. Record results in the checkboxes.

## 0. Prerequisites
- [ ] Even app installed and signed in; G2 paired and connected; R1 paired (optional).
- [ ] Dev mode / sideload enabled in the Even app.
- [ ] `npm install` done; `npm run build` produced `dist/`.

## 1. Dev-mode load (simulator first, then device)
- [ ] `npm run dev` (Vite dev server, note the URL/port).
- [ ] **Simulator:** `npm run simulator` (or `evenhub-simulator http://localhost:<port>`). Confirm the page loads and the overlay renders. Drive Up/Down/Click/Double/Long/Release/Context-menu inputs.
- [ ] **Device sideload:** `npm run qr`, scan with the Even app, confirm the page opens on the phone and the overlay appears on the glasses.

## 2. IMU validation (resolves the biggest unknowns)
- [ ] With the app on, hold the glasses **level** and still. Note raw `x/y/z` (diagnostics/console). **Confirm which axis is dominant** → set `DEFAULT_AXIS_MAPPING` / persisted `axisMapping` accordingly.
- [ ] Tilt **nose-down** and **nose-up**; confirm pitch sign matches reality (flip `signForward` if inverted).
- [ ] **Roll left/right**; confirm roll sign (flip `signRight` if inverted).
- [ ] Measure the **actual sample rate** shown (Hz) for pace P100/P200/P500/P1000; record the real cadence each code yields.
- [ ] Record approximate **noise** at rest (stability `spread`); re-tune `stabilityTolerance` and calibration `maxSpreadMagnitude` to real units.
- [ ] Judge whether `x/y/z` looks like **raw accelerometer** (noisy, |v| varies with motion) or a **fused gravity vector** (steady |v|). Note it in SDK_RESEARCH §3.

## 3. Calibration
- [ ] On a known-level surface, long-press (or menu → Calibrate). Confirm pitch/roll read ≈ 0 afterward and `cal` shows in status.
- [ ] Deliberately move during capture; confirm it is **rejected** (`CAL FAILED: too-noisy`).
- [ ] Reload the app; confirm calibration **persists** (via host storage).

## 4. Display
- [ ] Confirm the overlay is legible (line weight, contrast) on the green monochrome panel; adjust `DIM/MID/BRIGHT`.
- [ ] Confirm the readout/status text containers render and update without flicker.
- [ ] If images fail (`imageSizeInvalid`/`imageToGray4Failed`), try `toBytes('gray4')` and/or shrink the canvas; record the **correct byte layout**.
- [ ] Observe real `updateImageRawData` latency (diagnostics); confirm the adaptive interval settles sensibly; tune `baseIntervalMs`/`maxIntervalMs`.
- [ ] Confirm the overall visible resolution and update `CANVAS_W/H` if the panel differs.

## 5. Input (glasses + R1)
- [ ] Single tap → hold/release toggles (Smart Level).
- [ ] Double tap → mode switches.
- [ ] Long press → calibration start; release → commit.
- [ ] Scroll up/down → tolerance / size / guide adjusts.
- [ ] Context menu → Calibrate / Hold / Mode / Exit work.
- [ ] **R1 connected:** confirm ring events arrive with `eventSource = RING (2)` and that "R1 ring: detected" appears.
- [ ] **R1 disconnected:** confirm all actions still work from the glasses touchpad.

## 6. Lifecycle
- [ ] Background the app (foreground-exit): IMU stops. Foreground again: IMU resumes.
- [ ] Exit via menu: `shutDownPageContainer` leaves cleanly.

## 7. Packaging & install
- [ ] `npm run pack:check` (package_id availability), then `npm run pack` → `level-x.ehpk`.
- [ ] `evenhub login`, upload `.ehpk` via the dev portal, open from the Even app, repeat §§2–6 on the installed build.

## Sign-off
Only after §§2–6 pass on a real G2 may any claim of "hardware tested" be made. Until then, status stays **simulator/mock-verified, hardware-pending**.
