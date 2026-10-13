# LEVEL X — SDK Research (Phase 1)

Status key: **[CONFIRMED]** verified from installed source / type definitions · **[DOCUMENTED]** stated in official README · **[UNCONFIRMED]** not established, needs hardware/source validation.

All findings below were taken from the **actually installed** packages, not from memory:

| Package | Version installed | Source of truth read |
|---|---|---|
| `@evenrealities/even_hub_sdk` | `0.0.16` | `node_modules/.../dist/index.d.ts` (1536 lines), `README.md` |
| `@evenrealities/evenhub-simulator` | `0.9.5` | package metadata (contents inspected in Phase 8) |
| `@evenrealities/evenhub-cli` | `0.1.14` | registry metadata (full inspection deferred to Phase 9) |

SDK author: Even Realities (`whiskee.chen@evenrealities.com`, `carson.zhu@evenrealities.com`). License MIT. SDK `engines`: Node `^20 || >=22`. Minimum supported Even App version per README changelog: **2.2.10**.

---

## 1. Execution model — what the SDK actually is [CONFIRMED]

The SDK is **not** a direct hardware driver. It is a **WebView ↔ native-app bridge**. The app is a web page (HTML/JS) that the Even companion phone app loads inside a WebView; the SDK marshals JSON messages to/from the native host over `flutter_inappwebview`'s `callHandler('evenAppMessage', …)`.

Consequence for architecture: **all glasses/ring I/O is asynchronous message passing**, mediated by the phone. There is no synchronous sensor read; IMU and input arrive as pushed events. This drives the adapter/event design in `ARCHITECTURE.md`.

Entry points [CONFIRMED]:
- `waitForEvenAppBridge(): Promise<EvenAppBridge>` — await before any use.
- `EvenAppBridge.getInstance()` — singleton; `.ready: boolean`.

---

## 2. Bridge API surface [CONFIRMED — from `index.d.ts`]

Commands (Web → host), all `Promise`-returning:

| Method | Returns | Notes |
|---|---|---|
| `getUserInfo()` | `UserInfo` | uid/name/avatar/country |
| `getDeviceInfo()` | `DeviceInfo \| null` | model ∈ {g1,g2,ring1}, sn, status |
| `setLocalStorage(key, value:string)` | `boolean` | host-backed persistence |
| `getLocalStorage(key)` | `string` | |
| `getAppLocation(opts?)` | `AppLocation \| null` | GPS via phone |
| `startAppLocationUpdates` / `stopAppLocationUpdates` | `boolean` | |
| `pickImageFromAlbum()` / `captureImageFromCamera()` | `AppImageAsset \| null` | phone camera/album, base64 |
| `createStartUpPageContainer(c)` | `StartUpPageCreateResult` | **must be called first** before other glasses UI |
| `rebuildPageContainer(c)` | `boolean` | omitting `menuObject` clears the custom menu |
| `updateImageRawData(d)` | `ImageRawDataUpdateResult` | push bitmap into an image container |
| `textContainerUpgrade(c)` | `boolean` | update text content/brightness |
| `audioControl(isOpen, source?)` | `boolean` | mic on/off; source ∈ {glasses, phone} |
| `imuControl(isOpen, reportFrq?)` | `boolean` | IMU reporting on/off + pace |
| `shutDownPageContainer(exitMode?)` | `boolean` | 0 = exit now, 1 = foreground prompt |

Event listeners (host → Web), each returns an **unsubscribe function** (critical for cleanup):
- `onDeviceStatusChanged(cb: (DeviceStatus)=>void)`
- `onEvenHubEvent(cb: (EvenHubEvent)=>void)` — the main input/IMU channel
- `onLaunchSource(cb: ('appMenu'|'glassesMenu')=>void)` — fired **once** per load
- `onAppLocationChanged(cb)`

---

## 3. IMU data format [CONFIRMED structure / UNCONFIRMED semantics]

- **Payload shape [CONFIRMED]:** `IMU_Report_Data = { x?: number; y?: number; z?: number }` — three `double`s on the wire. **Nothing else.** No gyroscope, no magnetometer, no quaternion, no timestamp in the payload.
- **Delivery [CONFIRMED]:** via `onEvenHubEvent`; `event.sysEvent` with `sysEvent.eventType === OsEventTypeList.IMU_DATA_REPORT (8)` and `sysEvent.imuData`.
- **Enable [CONFIRMED]:** `await bridge.imuControl(true, ImuReportPace.Pxxx)`; disable `imuControl(false)`.
- **Report pace [DOCUMENTED]:** `ImuReportPace` ∈ `{P100, P200, …, P1000}`. README states verbatim: *"`ImuReportPace` values are protocol pacing codes."* → **The unit (Hz vs ms vs device gear) is NOT documented. [UNCONFIRMED]** LEVEL X must not print a Hz figure derived from this value as if it were measured; the display scheduler treats pace as an opaque "faster/slower" knob and measures real arrival rate empirically.

### Axis semantics — the central unknown [UNCONFIRMED]
Neither `index.d.ts` nor README defines:
- whether `x/y/z` is **accelerometer** (specific force, includes gravity) or an already-fused **gravity vector**;
- the **units** (g, m/s², or raw LSB);
- **axis orientation** relative to the head (which axis is "down", sign conventions);
- sample jitter / noise characteristics.

**Design response (honest, not inferred):** the orientation engine operates on a *generic 3-vector assumed to be dominated by gravity when the head is still*. It derives tilt from the **direction** of that vector (ratios/`atan2`), which is unit-agnostic, and relies on **user calibration** to define "level" rather than assuming any axis is down. Absolute heading/yaw is **not derivable** from a single gravity-aligned vector and is explicitly **not** offered. These assumptions are tagged in code and listed in `HARDWARE_TEST_PLAN.md` as the first things to verify on a real G2.

---

## 4. Glasses & R1 interaction events [CONFIRMED]

`onEvenHubEvent` delivers an `EvenHubEvent` with one of: `listEvent`, `textEvent`, `sysEvent`, `audioEvent`, `menuItemClickEvent`.

Input/system events arrive as `sysEvent: Sys_ItemEvent`:
- `eventType: OsEventTypeList` —
  `CLICK_EVENT=0, SCROLL_TOP_EVENT=1, SCROLL_BOTTOM_EVENT=2, DOUBLE_CLICK_EVENT=3, FOREGROUND_ENTER_EVENT=4, FOREGROUND_EXIT_EVENT=5, ABNORMAL_EXIT_EVENT=6, SYSTEM_EXIT_EVENT=7, IMU_DATA_REPORT=8, LONG_PRESS_EVENT=9, LONG_PRESS_RELEASE_EVENT=10`.
- `eventSource: EventSourceType` —
  `TOUCH_EVENT_FORM_DUMMY_NULL=0, TOUCH_EVENT_FROM_GLASSES_R=1, TOUCH_EVENT_FROM_RING=2, TOUCH_EVENT_FROM_GLASSES_L=3`.

**This `eventSource` field is the only sanctioned way to tell the R1 ring (`=2`) apart from the right/left glasses touchpad (`=1`/`=3`).** The type doc explicitly warns: *"when parsing long-press events you must not keep only eventType"* — i.e. source must be read too.

Confirmed gesture vocabulary therefore: **single click, double click, long-press (down) + long-press-release, scroll up, scroll down**, each tagged by source. There is **no** documented swipe-vector, pinch, or multi-finger event. Menu-item selection comes via `menuItemClickEvent.itemID`. Lifecycle: foreground enter/exit, abnormal/system exit.

---

## 5. Display / rendering [CONFIRMED sizes / UNCONFIRMED full resolution]

Page is built from containers (`createStartUpPageContainer`, then `rebuildPageContainer`):
- Limits [CONFIRMED]: `containerTotalNum` 1–12; `textObject` ≤ 8; `imageObject` ≤ 4; `menuObject.menuItems` ≤ 10; menu label ≤ 32 UTF-8 bytes.
- `zOrderIndex` controls layering; must be unique per page when used (validator enforces).
- **Image container bitmap size [CONFIRMED]:** width **20–288**, height **20–144**.
- **Text brightness [CONFIRMED]:** `textColor` integer **0–4** (0 dim … 4 bright); omit on create → default 4; omit on upgrade → keep current.
- **Image encoding [DOCUMENTED]:** grayscale bytes ("gray4" — 4-bit / 16 levels implied by `imageToGray4Failed` result); the **SDK LZ4-compresses raw data internally** — the app supplies plain grayscale bytes, no manual compression.
- **Full display resolution [UNCONFIRMED]:** README examples place containers at `xPosition: 320`, `yPosition: 220`, which exceed a single image container's 288×144 max — so the overall addressable coordinate space is larger than one image tile, but its exact pixel dimensions and the monochrome-green mapping are **not stated in the SDK**. LEVEL X renders into a configurable logical canvas and treats concrete pixel bounds as a hardware-validation item.

Result/error enums [CONFIRMED]: `StartUpPageCreateResult {success=0, invalid, oversize, outOfMemory}`; `ImageRawDataUpdateResult {success, imageException, imageSizeInvalid, imageToGray4Failed, sendFailed}`. These are handled explicitly by the display scheduler.

---

## 6. Display update performance [UNCONFIRMED — measured at runtime]

No frame-rate or bytes/sec guarantee is documented. Transport is BLE via the phone; raw image data is LZ4-compressed to cut transfer size. **No browser-style 60 FPS assumption is made.** The display scheduler (a) serializes SDK calls (no overlapping `updateImageRawData`), (b) coalesces redraws, (c) measures actual round-trip latency and adapts the redraw cadence, (d) prefers `textContainerUpgrade` (tiny payload) over image pushes where a numeric readout suffices.

---

## 7. Voice / microphone [CONFIRMED]

- `audioControl(isOpen: boolean, source?: AudioInputSource)` — `AudioInputSource ∈ {Glasses, Phone}`.
- Audio arrives as `onEvenHubEvent` → `event.audioEvent: AudioEvent { audioPcm: Uint8Array, source, direction: number|null, speakerRole }`. **Raw PCM** — the SDK does **not** provide speech-to-text. Any STT is the app's responsibility (pluggable, see `AI_INTEGRATION.md`). `speakerRole` is an app-side classification, explicitly *"not a firmware identity assertion."*

---

## 8. Application lifecycle [CONFIRMED]

- `onLaunchSource` fires once (`appMenu` | `glassesMenu`) after load; a reload does **not** re-fire it.
- Foreground/background and exits are `sysEvent` types `FOREGROUND_ENTER/EXIT`, `ABNORMAL_EXIT`, `SYSTEM_EXIT` (+ `systemExitReasonCode`).
- App must call `createStartUpPageContainer` before other glasses UI, and `shutDownPageContainer(exitMode)` to leave. No background-execution guarantee is documented → treat foreground-exit as "stop IMU + stop rendering" and resume on foreground-enter.

---

## 9. Local testing / simulator / install [CONFIRMED]

**Simulator** `@evenrealities/evenhub-simulator@0.9.5` — a native per-OS binary (the Windows `sim-win32-x64` dependency is installed). `evenhub-simulator --version` ran here and printed `0.9.5`. Usage: `evenhub-simulator [OPTIONS] <targetUrl>` — it loads the app's **dev-server URL** (e.g. `evenhub-simulator http://localhost:5173`). Supported inputs (from its README) are exactly **Up, Down, Click, Double Click, Long Press, Long Press Release, Context Menu** — matching `OsEventTypeList`. `--automation-port <PORT>` exposes an HTTP automation server for scripted testing. The simulator renders a window, so running its GUI needs a desktop session; headless CI here uses the MockBridge instead.

**CLI** `@evenrealities/evenhub-cli@0.1.14` — bins `evenhub` / `eh`. Commands (from the official docs + published README, read-only — **the CLI binary was not executed in this environment**):
- `evenhub init` — generate a starter `app.json`.
- `evenhub qr` — QR for the dev-server URL (primary dev-mode command; sideload into the Even app).
- `evenhub login` — Even Realities account login (**user action; interactive**).
- `evenhub pack <app.json> <build-folder> [-o out.ehpk] [--check] [--sdk-ver <v>] [--enforce-manual-version] [--no-ignore]` — produce the **`.ehpk`** package. At pack time it stamps `min_app_version` from the SDK's npm metadata (higher of your value and the SDK floor).

**Package format `.ehpk`** cannot be opened/run directly; it is **uploaded through the EvenHub dev portal** (needs login) and opened from the Even phone app. So final install/test on hardware is a **user-performed, authenticated** step.

### app.json schema [CONFIRMED from docs]
`package_id` (reverse-domain, lowercase alnum, ≥2 segments, no hyphens), `edition` (`"202601"`), `name` (≤20 chars), `version` (semver), `min_sdk_version` (req), `min_app_version` (optional/derived), `entrypoint` (HTML in build folder), `permissions` (array of `{name,desc,whitelist?}` — names ∈ network/location/g2-microphone/phone-microphone/album/camera), `supported_languages` (⊆ en/de/fr/es/it/zh/ja/ko). **Never bundle secrets/keys in the `.ehpk`** (docs). LEVEL X's core manifest declares `permissions: []` (fully offline); AI adds `network`+microphone — see `AI_INTEGRATION.md`.

---

## 10. Permissions / security [CONFIRMED stance]

- Mic requires explicit `audioControl(true, …)`; LEVEL X gates it behind an explicit user action and an on-screen recording indicator.
- Location requires explicit start; unused by the core app.
- `setLocalStorage`/`getLocalStorage` is host-backed; the app also keeps a `localStorage` fallback so settings survive offline/mock runs.
- **No API keys in client code.** The optional Claude adapter calls a user-supplied backend endpoint; keys live server-side only.

---

## 11. Findings from the first on-device run (2026-10-13) [CONFIRMED on device / DOCUMENTED]

First sideload into the Even app failed with `createStartUpPageContainer failed: invalid`. Root causes, and rules learned (Even Hub docs "Display & UI System" + community notes `nickustinov/even-g2-notes`):
- **zOrderIndex is all-or-nothing and must be unique per page.** Two text containers shared `5`; the SDK rejects this locally and returns `invalid`. **(The observed failure.)**
- **Exactly one container must have `isEventCapture: 1`.** The page had none. The SDK does not check this; the host does.
- **Display is 576×288 per eye** (origin top-left, 16 green levels). Image containers are ≤288×144 and are placed within it.
- **`containerName` ≤ 16 chars, unique; `containerID` unique.** Text content ≤1000 chars on create/rebuild, ≤2000 on upgrade.
- **Real hardware delivers gestures as `textEvent`/`listEvent`** from the capture container; the simulator uses `sysEvent`. The SDK often normalizes `CLICK_EVENT (0)` to `undefined`.
- **Image data:** `number[]` of PNG bytes *or* raw greyscale, one byte per pixel (LEVEL X's `gray8`). Cannot be sent during create. Each `updateImageRawData` holds the image path ~104 ms; no concurrent sends.
- **Firmware font silently drops unsupported characters**, so glasses text is filtered to ASCII.

All of these are now enforced by `src/display/page-rules.ts` (used by the app before every create and by the MockBridge), with regression tests in `test/page-rules.test.ts`.

## Unresolved questions (carried to `HARDWARE_TEST_PLAN.md`)
1. IMU `x/y/z`: accelerometer vs fused gravity? units? axis orientation & signs vs head frame? → calibration + validation.
2. `ImuReportPace` real-world unit and the effective sample rate delivered to the WebView.
3. Full display pixel resolution and the green-channel intensity mapping of gray4 levels.
4. Practical `updateImageRawData` throughput / latency (drives adaptive cadence).
5. Does `eventSource` reliably distinguish R1 from glasses across firmware versions?
6. Whether long-press auto-repeats or only emits down/release.
