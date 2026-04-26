# Clumo OS

AI-powered live call coaching for sales teams. Electron desktop app with embedded Node.js server and React frontend.

## Running Clumo

### Dev mode (day to day)

```bash
cd clumo-electron
npm install        # first time only
npm run dev        # starts server (port 3000) + Vite (port 5173)
```

Open http://localhost:5173. React hot reload is automatic. Server restarts on file changes via `node --watch`.

### Dev mode with Electron

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd web && npm run dev

# Terminal 3
cd electron && npm start -- --dev
```

Only needed when testing desktopCapturer or app packaging.

### Building installers

```bash
cd web && npm run build          # builds React into server/public/
cd ../electron && npm run build  # produces installers in dist/
```

## Architectural Rules

### Bring your own key / managed key

All AI functionality must support two modes:

1. **BYOK (bring your own key):** User provides their own OpenAI or Azure OpenAI credentials. This is the current default.
2. **Managed key:** Clumo provides a managed API key (future).

The provider abstraction in `server/ai-provider.js` must accommodate both modes. Any new AI provider integration must implement the same interface as `AzureOpenAIProvider` and `OpenAIProvider`.

### Key encryption

API keys must be encrypted at all times on the user's machine using AES-256-CBC with a locally generated 256-bit key.

- Never store keys in plain text anywhere (no localStorage, no cookies, no .env in production)
- Never pre-fill keys back into UI fields. Once saved, keys can only be used, not read back
- Each encryption operation must use a unique random IV
- The encryption key file (`clumo.key`) must be gitignored

### Local-first data

All searchable data for the knowledge base and suggestion engine must remain on the user's machine. Non-negotiable for speed, privacy, and performance.

- Knowledge base items and embeddings: local JSON files
- Session transcripts and analysis: local JSON files
- SQLite database for config and metadata: local file
- No cloud sync, no remote storage, no telemetry
- The only external connection is to the configured AI provider for transcription and scoring

### Electron + Node.js boundary

- **Electron** handles desktop shell, window management, audio capture (desktopCapturer), and IPC
- **Node.js server** handles all business logic, AI providers, storage, and WebSocket connections
- **React frontend** is a pure UI layer served by the Node.js server
- Server listens only on localhost, never exposed to the network
- Electron/renderer communication uses the preload bridge (`window.clumo`), never `nodeIntegration`

## Coding Conventions

### JavaScript

- CommonJS (`require`/`module.exports`) in server and Electron
- ES modules (`import`/`export`) in web
- `async/await` for all async code, no raw `.then()` chains
- `const` by default, `let` when reassignment needed, never `var`
- Console logging with semantic prefixes: `[Server]`, `[WS]`, `[Electron]`, `[KB]`

### Naming

- camelCase for variables and functions
- PascalCase for classes and React components
- SCREAMING_SNAKE_CASE for constants
- kebab-case for server/utility file names (`suggestion-engine.js`)
- PascalCase for React component file names (`SuggestionCard.jsx`)
- snake_case for database table names and config keys

### React

- Functional components with hooks, no class components
- `export default function ComponentName()` pattern
- Tailwind CSS utility classes, no separate CSS files per component
- Props destructured in function parameters

### General

- Minimize new dependencies. Check if existing packages cover the need first
- No TypeScript. Plain JavaScript throughout
- Graceful shutdown handling (SIGINT/SIGTERM) in server and Electron
- Error handling at system boundaries (API responses, file I/O, WebSocket). Trust internal code

### Working on a plan.md file

After each major milestone:
- Update STATUS.md with what you completed and what's next
- Run npm run dev to verify it builds
- Commit with a descriptive message so rollback is possible
- If context gets compacted, re-read STATUS.md and PLAN.md
and keep going.

At the end of a successful plan execution session, always `git push` to sync the completed work to the remote.
