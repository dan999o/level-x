# LEVEL X — Architecture

## Principles
- **Hardware-independent math is isolated** from SDK code (`src/core/math/**` has zero SDK imports and is 100% unit-tested).
- **One bridge contract** (`BridgePort`) with three implementations possible: the real `EvenBridgeAdapter`, the `MockBridge` (headless/offline), and — at runtime — the official simulator (which hosts the same page as the real app).
- **All glasses I/O is async message passing** (the SDK is a WebView↔native bridge), so every device interaction is event- or Promise-based with explicit cleanup.
- **No 60 FPS assumption**: a single scheduler serializes and paces all display writes.

## Layers

```
                       ┌──────────────────────────────┐
  phone WebView UI ──▶ │  ui/control-panel.ts          │  (Phase 7 companion panel + live preview)
                       └───────────────┬──────────────┘
                                       ▼
                       ┌──────────────────────────────┐
                       │  core/app-controller.ts       │  init · lifecycle · global input routing
                       │                               │  IMU→orientation · calibration · shutdown
                       └───┬───────┬────────┬──────┬───┘
         ┌─────────────────┘       │        │      └─────────────────┐
         ▼                         ▼        ▼                        ▼
  sensors/imu-service     input/input-controller   core/mode-manager        core/settings
  (decode, filter,        (gesture→action,         (active mode,            (load/save via
   stability, rate)        R1 vs glasses)           cycle)                   BridgePort + fallback)
         │                         │                │
         │                         │                ▼
         │                         │        modes/{smart-level,reticle,photo,angle}.ts
         │                         │                │  draw into ──▶ display/renderer/overlays.ts
         ▼                         ▼                ▼                       │
        ─────────────── core/math/** (vector, orientation, filters, calibration, angles) ───────────────
                                       │
                                       ▼
                       ┌──────────────────────────────┐
                       │  display/display-scheduler.ts │  serialize · coalesce · adapt cadence
                       │  display/framebuffer.ts (gray) │
                       └───────────────┬──────────────┘
                                       ▼
                       ┌──────────────────────────────┐
                       │  sdk/bridge-port.ts (contract) │
                       │  sdk/bridge-adapter.ts (real)  │  sdk/mock-bridge.ts (offline/tests)
                       │  @evenrealities/even_hub_sdk    │  sdk/sim-streams.ts (synthetic IMU)
                       └──────────────────────────────┘
```

## Module responsibilities (brief's Phase 2 list → files)
| Required module | Implementation |
|---|---|
| Core application controller | `core/app-controller.ts` |
| Even SDK bridge adapter | `sdk/bridge-adapter.ts` (+ `bridge-port.ts`) |
| IMU sensor service | `sensors/imu-service.ts` |
| Orientation estimation engine | `core/math/orientation.ts` |
| Calibration engine | `core/math/calibration.ts` |
| Reticle renderer | `display/renderer/overlays.ts` (`renderReticle`) |
| Display update scheduler | `display/display-scheduler.ts` |
| Gesture & ring input controller | `input/input-controller.ts` |
| Mode manager | `core/mode-manager.ts` |
| Settings & persistence | `core/settings.ts` |
| Optional speech command service | `ai/assistant.ts`, `ai/command-parser.ts` |
| Optional AI provider adapter | `ai/types.ts` (`AiProvider`) + backend proxy |
| Diagnostics & logging | `core/diagnostics.ts` |
| Simulator / mock-hardware adapter | `sdk/mock-bridge.ts`, `sdk/sim-streams.ts` |

## Data flow (one IMU sample)
1. Host pushes `onEvenHubEvent` → `ImuService` filters `IMU_DATA_REPORT`, validates, low-passes, runs stability, measures real Hz.
2. `AppController.handleImu` applies calibration (or canonical mapping) → `OrientationState {pitch, roll, tilt, stable, rateHz, calibrated, up}`.
3. Active `Mode.onOrientation` renders an overlay into the shared `Framebuffer` and sets readout/status text.
4. `DisplayScheduler` coalesces/pace-limits and pushes `updateImageRawData` + `textContainerUpgrade`, measuring latency to adapt cadence.

## Lifecycle & cleanup
`init()` waits for the bridge, loads settings, reads device info, creates the page, subscribes (lifecycle/input/IMU), activates the saved mode, starts IMU. Foreground-exit pauses IMU; foreground-enter resumes; system/abnormal-exit triggers full `shutdown()` which stops IMU + scheduler, unsubscribes every listener, and calls `shutDownPageContainer`.

## Error handling
- Bridge calls that return result enums are mapped and logged (`StartUpPageCreateResult`, `ImageRawDataUpdateResult`).
- Invalid/degenerate IMU samples are dropped, not propagated.
- Settings persistence degrades to `localStorage` then in-memory.
- AI failures are caught and never reach the core path.
