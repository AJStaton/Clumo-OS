# Integration recordings (Polly.js fixtures)

This directory holds **frozen HTTP recordings** of real OpenAI / Azure OpenAI responses. Tests in `server/tests/integration/` replay these recordings via Polly.js so the integration layer is exercised end-to-end without spending a cent or risking network flake.

## How to run

```bash
# Replay (default — no API keys required):
npm run test:integration

# Re-record against real APIs (requires real keys, costs ~$0.01 per run):
# OpenAI:
OPENAI_API_KEY=sk-... npm run test:integration:record
# Azure (in addition to or instead of OpenAI):
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com \
AZURE_OPENAI_KEY=...  \
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini \
npm run test:integration:record
```

After re-recording, **review the diff** in this folder before committing. Confirm:

- No `Authorization`, `api-key`, or other secret headers leaked through redaction.
- No `x-request-id` / timestamps changed in unexpected ways (those are normalized).
- The JSON body is plausibly what you'd expect from the real provider.

Then `git add fixtures/` and commit.

## Why no fixtures are committed yet

The first recording session **must** be done against real APIs by a human with valid keys — otherwise the fixtures would be hand-imagined and we'd lose the entire benefit of integration testing. Until that one-time session happens, the integration tests fail loudly in replay mode (which is correct — there's nothing to replay against).

CI is not blocked: `npm test` excludes this directory; only `npm run test:integration` opts in.

## When to re-record

- After changing any request shape (headers, body params).
- When OpenAI / Azure ship a new field you want to use.
- Monthly hygiene to make sure recordings still match reality.

## Coverage today

| Recording | What it exercises |
|---|---|
| `openai-chat-suggestion` | `OpenAIProvider.chatCompletion` happy path |
| `azure-chat-suggestion` | `AzureOpenAIProvider.chatCompletion` happy path |

## Coming next

- `*-transcribe-*` — Whisper transcription replays
- `*-rate-limited` — 429 error handling
- `*-content-filter-block` — Azure content-filter response shape
- Realtime WebSocket replay (separate harness — not Polly)
