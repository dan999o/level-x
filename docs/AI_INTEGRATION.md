# LEVEL X — Optional AI Integration Guide (Mode E, experimental)

The voice assistant is **off by default and optional**. The offline core never
depends on it, and **no API key is ever placed in client code**.

## What ships in the app
- `src/ai/command-parser.ts` — a **local** intent parser (no network). Handles
  "switch to level mode", "set zero", "hold", "change to the dot reticle",
  "how far off level am I", "which mode should I use". Fully unit-tested.
- `src/ai/assistant.ts` — orchestrates explicit mic capture → STT → parse →
  execute, with a `recording` flag for a UI indicator. Every async step is
  guarded; failures are logged and swallowed.
- `src/ai/types.ts` — `SpeechToText` and `AiProvider` interfaces you implement.

## What you provide (server-side)
Because the glasses mic yields **raw PCM** (the SDK has no STT) and because keys
must stay secret, implement two small client shims that call **your** backend:

```ts
const stt: SpeechToText = {
  async transcribe(pcm) {
    const r = await fetch('/api/stt', { method: 'POST', body: pcm });
    return (await r.json()).text;
  },
};
const provider: AiProvider = {
  async ask(prompt, context) {
    const r = await fetch('/api/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, context }),
    });
    return (await r.json()).reply;
  },
};
const assistant = new VoiceAssistant(bridge, app, app.diag, { stt, provider });
```

Your backend holds the Claude key and calls the Anthropic API. Example server
route (Node), key in an env var, never shipped to the client:

```
POST /api/ask -> anthropic.messages.create({ model, max_tokens, messages:[...] })
```

## Wiring into the app
1. Enable AI in settings (`ai.enabled = true`, `ai.endpoint = "https://your.api"`).
2. Construct `VoiceAssistant` as above; bind a push-to-talk control to
   `startListening(AudioInputSource.Glasses)` then `stopAndProcess()`.
3. The panel can also call `assistant.handleText(text)` for typed testing with
   no microphone.

## Manifest changes for an AI build
The offline `app.json` declares `permissions: []`. For AI, add (and justify):

```json
"permissions": [
  { "name": "network", "desc": "Send voice to the app's assistant backend.", "whitelist": ["https://your.api"] },
  { "name": "g2-microphone", "desc": "Capture voice commands from the glasses." }
]
```

Keep `whitelist` tight. **Never** bundle secrets in the `.ehpk` — the docs warn
that released builds can be extracted.

## Failure policy (enforced in code)
- No STT configured → control still works via typed/parsed commands; voice Q&A
  returns "speech-to-text not configured".
- Provider throws / network down → "assistant unavailable"; leveling unaffected.
