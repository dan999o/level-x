# LEVEL X — Known Limitations

Honest status of every claim. Categories: **Implemented & tested**, **Implemented, hardware-pending**, **Experimental**, **Unsupported by current hardware/SDK**.

## Sensing & measurement
- **Gravity-only sensor.** The G2 IMU payload is `{x, y, z}` with **no gyroscope or magnetometer** (confirmed in `index.d.ts`). Consequences:
  - **No yaw/heading.** Absolute compass direction is *Unsupported* — a gravity vector cannot observe rotation about the vertical. LEVEL X never displays heading.
  - **No gyro fusion.** Smoothing is low-pass only; fast motion reads as "MOVING" rather than being fused out.
- **Axis orientation & units are UNCONFIRMED** (not documented). *Implemented, hardware-pending.* The engine uses direction + calibration (unit-agnostic) and a configurable axis mapping; the default (`+z` up) must be confirmed on a real G2. If wrong, calibration still zeroes the pose but pitch/roll sign/assignment may need the mapping flipped.
- **`ImuReportPace` is a pacing code, not a documented Hz.** *Hardware-pending.* The UI shows the **measured** arrival rate, not a number derived from the code.
- **Display resolution 0.1° ≠ measurement accuracy.** Real accuracy depends on sensor noise/mounting and is **unknown until measured on hardware**. The 0.1° is a formatting choice only.
- **Stability thresholds are in sensor units.** Defaults assume |gravity| ≈ 1; they are re-tuned once real sample scale/noise is known.

## Display
- **Full panel resolution UNCONFIRMED.** *Hardware-pending.* We render into a 288×144 logical canvas (the max image-container size); the real visible mapping and gray4 green-intensity levels are verified on device.
- **Image byte layout assumed `gray8` row-major.** *Hardware-pending.* Docs say only "grayscale bytes"; `toBytes('gray8')` is the default, `toBytes('gray4')` is available as a fallback to try.
- **Throughput/latency unknown.** *Hardware-pending.* The scheduler adapts to measured latency, but the achievable refresh rate on real BLE is not yet characterized.

## Modes
- **Smart Level, Angle, Reticle, Photography** — *Implemented & tested* in logic and against the mock; *hardware-pending* for real IMU feel and display legibility.
- **Reticles are visual references only** — **not** calibrated firearm sights and **not** world-anchored targeting. No object tracking is claimed or possible with this sensor set.
- **Photography guides need no camera.** Phone-camera capture via `pickImageFromAlbum`/`captureImageFromCamera` is an *unimplemented optional extension*, deliberately out of the offline core.
- **Angle mode measures gravity-relative angles** (roll/pitch deltas + scalar tilt from a set zero). It cannot measure rotation purely about the vertical axis (see yaw above).

## Input
- **Gesture set limited to what the SDK defines**: click, double-click, long-press(+release), scroll up/down, context menu. **No swipe-vector gesture exists**; "reposition by swipe" uses scroll. *Implemented & tested* via mock.
- **R1 vs glasses distinction** relies on `eventSource`, which only `sysEvent` carries. The simulator sends gestures as `sysEvent`, but real hardware sends them as `textEvent`/`listEvent` from the `isEventCapture` container, which has no source field. So on real glasses, ring taps likely work as input but **"R1 ring: detected" may never show**. *Hardware-pending.* Fallback: with no ring, the glasses touchpad covers every action.
- **Double-tap switches mode.** Community notes say a root page's double-tap should exit (`shutDownPageContainer(1)`) per Even's UX convention. LEVEL X keeps double-tap = next mode for now; revisit before store submission.

## AI assistant (Mode E)
- *Experimental.* The intent parser is local and tested; speech-to-text and the AI provider are **pluggable and not bundled**. Without them, voice Q&A is unavailable but all core features work. Any AI error is caught and never affects leveling.

## Packaging / deployment
- **`.ehpk` not produced in this environment.** The CLI binary was not executed here (and upload needs your login). `npm run pack` runs the real command; final on-device install is a user step. *Hardware/account-pending.*

## Not done (explicitly)
- No phone-camera integration, no cloud sync, no account/registration in the core, no background execution assumptions, no localization beyond `en`.
