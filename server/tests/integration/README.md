# Integration tests — Polly.js HTTP recordings

These tests exercise the real provider integration layer (`ai-provider.js`) against **frozen recordings** of real OpenAI / Azure API responses.

Read [`fixtures/README.md`](./fixtures/README.md) for the workflow.

**TL;DR**

```bash
npm run test:integration            # replay (default)
npm run test:integration:record     # hit real APIs, overwrite fixtures
```

## Why this exists

Unit tests with mocks verify your code calls a function. Integration tests with recordings verify your code correctly **parses, error-handles, and reacts to actual provider responses** — including the headers, fields, and edge cases you'd never invent.

A recording is just a JSON file on disk: one HTTP request and its real response, captured once and replayed forever. See `server/tests/support/polly.js` for the redaction/normalization rules applied to every saved recording.
