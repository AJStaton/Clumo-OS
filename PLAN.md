# Clumo OS Development Plan

## Completed Features

### Phase 1: Managed Embeddings + BYOK/Managed Key Architecture ✓
Fully implemented. ManagedProvider class in server/ai-provider.js, loadEmbeddingProvider function, provider_mode config, embeddingProvider parameter threaded through KnowledgeGenerator and SuggestionEngine, and managed/BYOK toggle UI in both Setup.jsx and Settings.jsx.

### Phase 2: Security Modal for Embeddings ✓
Fully implemented. "How search works" section added to SecurityModal with embedding explanation, one-way conversion note, local processing assurance, and managed mode TLS note.

### Phase 3: Simplified Audio Source Selection ✓
Backend fully implemented: get-meeting-sources IPC handler with meeting pattern matching (Zoom, Teams, Webex, Google Meet), getMeetingSources exposed in preload.js, returns { meetings, screens, allSources }. Note: The AudioSourcePicker component currently auto-selects and returns null (hidden). The card-based visual UI from the original plan is not rendered, though all data infrastructure supports it.

---

## Phase 5: Post-Call Features & Enhancements ✓

### Feature 1: Grey out Integrations & Automation in Settings ✓
Integrations and Automation sidebar links are disabled with "Coming soon" labels. Routes redirect to /settings/ai-models.

### Feature 2: Auto-generate post-call analysis ✓
- `server/analysis.js`: Generates structured MEDDPICC scoring, follow-up email, and next meeting prep via GPT
- Auto-triggers on session close (ws.js), manual trigger via POST /api/session/:id/analyze
- Session.jsx renders structured CRM Update (MEDDPICC table + next steps), Next Meeting (gaps + topics), Follow-up Email

### Feature 3: Product Truth knowledge base type ✓
- Added `productTruths` array to default KB (6 default facts across Security, Platform, Infrastructure, Data, Reliability)
- KnowledgeGenerator produces product truths from scraped content
- SuggestionEngine matches product truths via triggers and semantic search
- KB.jsx shows Product Truths tab; SuggestionCard renders product_truth type in amber

### Feature 4: Sessions list enhancements ✓
- GET /api/sessions includes `hasAnalysis` field
- Sessions.jsx: search filter, "Analyzed" badge, delete with two-click confirmation

---

## Archived: Phase 4 UI Improvements ✓

## Next Features (Phase 4: UI Improvements)

### Feature 1: Prominent File Upload Button (Setup Step 2)

**File:** `web/src/pages/Setup.jsx` (lines 513-527)

Replace native file input with a hidden input + styled button triggered via `useRef`.

- Add `useRef` to React imports
- Create `fileInputRef = useRef(null)` in component body
- Hide the `<input type="file">` with `className="hidden"`, add `ref={fileInputRef}`
- Add visible button: `w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-900 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2`
- Include upload SVG icon (arrow-up-tray, 5x5) + "Choose Files" label
- Keep existing onChange handler and file count display

---

### Feature 2: Rename Navigation Labels and Routes

| File | Change |
|------|--------|
| `web/src/components/Nav.jsx` | "/call" → "/session" (label "Session"), "/sessions" → "/history" (label "History"). Fix Settings NavLink to stay active on /settings/* sub-routes. |
| `web/src/App.jsx` | Route paths: /call → /session, /sessions → /history. Default redirect → /session. Add redirect routes for old URLs: /call → /session, /sessions → /history. |
| `web/src/pages/Sessions.jsx` | Heading "Sessions" → "History". Update empty state text. |
| `web/src/pages/Session.jsx` | "Call Notes" → "Session Notes" |

Component file names and internal function names stay unchanged.

---

### Feature 3: Settings Sidebar with Nested Routes

**3a. Rewrite `web/src/pages/Settings.jsx` as layout**
- Left sidebar (w-56, border-r) with vertical NavLink list: AI Models, Integrations, Automation
- Right content area renders `<Outlet />`
- `/settings` redirects to `/settings/ai-models`
- Sidebar active styling: `bg-gray-900 text-white` (same pattern as Nav.jsx)

**3b. Create `web/src/pages/AiModelsSettings.jsx`**
- Extract current Settings.jsx content (Managed/BYOK toggle, provider selection, API key inputs, test/save, KB links)
- Wrap in `<div className="max-w-lg">`

**3c. Create `web/src/pages/IntegrationsSettings.jsx`**
- Grid (2 columns) of cards for 6 CRMs
- Each card has an "MCP" button indicating integration readiness:
  - **Active:** Salesforce, HubSpot, Dynamics 365, Monday, Zoho (these have official MCP servers as of 2026)
  - **Greyed out:** Pipedrive (tooltip: "MCP for this CRM is not yet published by the provider")
- MCP buttons are visual indicators only for now (no connection logic yet)

**3d. Create `web/src/pages/AutomationSettings.jsx`**
- Header with "Automation Rules" title + "Add Rule" button
- List of rules with Edit/Delete actions
- Add/Edit form with mock dropdown fields:
  - Type: select (CRM, Customer, Stakeholders)
  - System: select (Salesforce, HubSpot, Dynamics 365, Monday, Zoho, Pipedrive)
  - Fields to update: select (Deal Stage, Last Activity, Contact Notes, Meeting Summary, Next Steps, MEDDPICC Score)
  - Data to use: select (Full Transcript, Session Notes, MEDDPICC Scores, Key Topics, Action Items)
- Empty state: "No automation rules configured yet."
- **localStorage persistence:** rules saved to `localStorage('clumo-automation-rules')` so they survive page refresh

**3e. Update `web/src/App.jsx` routing**
```jsx
<Route path="/settings" element={needsSetup ? <Navigate to="/" /> : <Settings />}>
  <Route path="ai-models" element={<AiModelsSettings />} />
  <Route path="integrations" element={<IntegrationsSettings />} />
  <Route path="automation" element={<AutomationSettings />} />
</Route>
```

---

### Implementation Order

1. Feature 2 (rename) — touches routing, do first
2. Feature 1 (upload button) — isolated to Setup.jsx
3. Feature 3 (settings sidebar) — largest change, new files + routing

---

### Verification

1. Nav shows "Session", "History", "Knowledge Base", "Settings"
2. "Settings" stays highlighted on all /settings/* sub-pages
3. Old URLs /call and /sessions redirect to new paths
4. Setup Step 2: prominent "Choose Files" button opens file picker
5. /settings redirects to /settings/ai-models with sidebar
6. Integrations: 5 active MCP buttons, Pipedrive greyed out with tooltip
7. Automation: add/edit/delete rules with dropdowns, rules persist on refresh

---

---

## Archive: Original Plan Details

## Phase 1: Managed Embeddings + BYOK/Managed Key Architecture

### Goal
When a user selects "Managed Models," Clumo uses a Clumo-owned Azure OpenAI endpoint for embeddings (and later for chat/realtime). When a user selects BYOK, they provide their own keys as today. The choice is integrated into the existing provider selection step.

### Files to modify
- `server/ai-provider.js` — new provider class + loader
- `server/db.js` — new config key
- `server/knowledge-generator.js` — accept embedding provider
- `server/suggestion-engine.js` — accept embedding provider
- `server/routes/api.js` — save/load provider mode, pass embedding provider
- `server/routes/ws.js` — pass embedding provider to SuggestionEngine
- `web/src/pages/Setup.jsx` — add managed/BYOK toggle in Step 1
- `web/src/pages/Settings.jsx` — add managed/BYOK option

### Implementation

**1. Add `ManagedProvider` class in `server/ai-provider.js`**

A new class that uses the Clumo-owned Azure OpenAI resource. The endpoint and key must NOT be stored in source code. Store them encrypted in the SQLite config table (same pattern as user API keys in `db.js`), seeded on first run or via a setup script.

For now, the managed provider only needs `generateEmbedding()`. As managed models expand, add `chat()` and `createRealtimeConnection()`.

```
class ManagedProvider {
  constructor(endpoint, apiKey) { ... }
  async generateEmbedding(text) {
    // Uses Azure OpenAI embeddings API
    // Model: text-embedding-3-small
    // Deployment name to be configured
  }
}
```

**2. Add `loadEmbeddingProvider()` function in `server/ai-provider.js`**

```
function loadEmbeddingProvider() {
  const mode = db.getConfig('provider_mode'); // 'managed' or 'byok'
  if (mode === 'managed') {
    return new ManagedProvider(managedEndpoint, managedKey);
  }
  return loadProvider(); // existing BYOK provider
}
```

**3. New config key: `provider_mode`**

Values: `"managed"` or `"byok"`. Stored in SQLite config table via `db.js`. Default: `"byok"` (preserves current behavior).

**4. Update `KnowledgeGenerator` constructor (`server/knowledge-generator.js`)**

Accept optional `embeddingProvider` parameter. Use it for `generateEmbeddings()` calls instead of `this.provider`. Fall back to `this.provider` if not provided.

**5. Update `SuggestionEngine` (`server/suggestion-engine.js`)**

Accept optional `embeddingProvider` parameter. Use it in `findSemanticMatches()` for the `generateEmbedding(text)` call.

**6. Update routes**

- `server/routes/api.js`: Save `provider_mode` in POST `/api/settings`. Load and pass `embeddingProvider` when creating `KnowledgeGenerator`.
- `server/routes/ws.js`: Pass `embeddingProvider` when creating `SuggestionEngine`.

**7. UI: Setup.jsx Step 1**

Before the Azure/OpenAI provider selection, add a top-level choice:

- **Managed Models (recommended)** — "Clumo provides the AI. No API keys needed. Just start coaching."
- **Bring Your Own Key** — "Use your own OpenAI or Azure OpenAI account."

When "Managed" is selected, skip the API key form entirely and go straight to Step 2 (KB onboarding). When "BYOK" is selected, show the existing Azure/OpenAI forms.

**8. UI: Settings.jsx**

Add the same managed/BYOK toggle at the top of the settings page so users can switch modes later.

### Managed key storage

The Clumo-owned Azure endpoint and key need to be bundled with the app but not visible in source code. Options:
- Encrypt them with a hardcoded app-level key and store in the SQLite DB, seeded on first install
- Use environment variables during build and embed in the compiled Electron app
- Store in a separate config file bundled as an Electron extra resource

Recommended: Seed the encrypted values into the SQLite DB on first run via `db.js` initialization. The encryption key is already generated locally (`clumo.key`), so the managed credentials get the same AES-256-CBC protection as user keys.

---

## Phase 2: Update Security Modal for Embeddings

### Goal
Explain WHY embeddings are used and HOW they protect user data. Currently the modal mentions embeddings briefly but doesn't educate.

### File to modify
- `web/src/pages/Setup.jsx` — `SecurityModal` component (lines 3-95)

### Implementation

**1. Add a new "How search works" section** after the "Data sent to AI provider" section. Two paragraphs:

- **Why embeddings:** Explain that embeddings let Clumo match by meaning, not keywords. When a prospect says "we are struggling with employee churn," Clumo recognizes it relates to a case study about reducing attrition by 40%, even though no words match. This makes suggestions accurate and timely.

- **How embeddings are secure:** An embedding is a list of numbers (a vector) that captures meaning. The conversion is one-way. There is no known method to reconstruct the original text from its vector. Your knowledge base text never leaves your machine after the initial one-time conversion. During calls, transcript chunks are converted to vectors and compared locally against stored KB vectors.

**2. Update the existing embedding bullet points** under "Data sent to AI provider" to be shorter and reference the new section.

**3. Add a note for managed mode users:** "When using managed models, embedding requests are sent to Clumo's AI service over a TLS encrypted connection. The text is processed and discarded. Clumo does not store your text or vectors on any server."

---

## Phase 3: Simplified Audio Source Selection

### Goal
Replace the raw window dropdown with smart categories: detected meeting apps, Entire Screen (always prominent), Microphone Only, and an Advanced manual picker as fallback.

### Files to modify
- `electron/main.js` — new IPC handler with pattern matching
- `electron/preload.js` — expose new IPC channel
- `web/src/components/AudioSourcePicker.jsx` — full rewrite
- `web/src/pages/Call.jsx` — minor updates if needed

### Implementation

**1. Add `get-meeting-sources` IPC handler in `electron/main.js`**

Wraps `desktopCapturer.getSources()` with pattern matching against known meeting apps:

```
Meeting patterns:
- /Zoom Meeting|^Zoom$/i → "Zoom"
- /Microsoft Teams/i → "Microsoft Teams"
- /Webex/i → "Webex"
- /Meet\s*[-–]\s*.+/i → "Google Meet" (browser)
- /teams\.microsoft\.com/i → "Teams (browser)"
- /zoom\.us/i → "Zoom (browser)"
```

Returns `{ meetings: [...], screens: [...], allSources: [...] }`.

**2. Update `electron/preload.js`**

Expose `getMeetingSources` via the `window.clumo` bridge. Keep existing `getAudioSources` for backward compatibility.

**3. Rewrite `AudioSourcePicker.jsx`**

Card-based UI instead of a dropdown. Layout:

```
┌──────────────────────────────────────────────┐
│ Detected meetings (only shown when found):   │
│ [Teams icon] Microsoft Teams  [Zoom] Zoom    │
│                                              │
│ Always visible:                              │
│ [Screen] Entire Screen (captures all audio)  │
│ [Mic] Microphone Only                        │
│                                              │
│ ▸ Advanced: select a specific window         │
└──────────────────────────────────────────────┘
```

- Follow existing card styling from Setup.jsx (border-2, active state border-gray-900 bg-gray-50)
- Auto-refresh sources every 5 seconds while idle (before call starts)
- If no meetings detected, show: "No active meetings detected. Use Entire Screen to capture all audio."
- "Entire Screen" is always visible and prominent as the recommended fallback

**4. Platform warnings**

Detect platform via `navigator.platform`:
- macOS: Show note under screen/window options: "macOS requires a virtual audio driver (like BlackHole) for system audio capture. Without one, only your microphone will be captured."
- Linux: Similar note about PulseAudio/PipeWire configuration.

**5. No changes needed to `Call.jsx` capture logic**

The three capture paths (Electron desktop source, screen share, microphone) remain the same. The `audioSourceId` passed from the new picker is still a desktopCapturer source ID, so the existing logic at lines 66-86 works unchanged.

---

## Verification

### Feature 1 (Managed/BYOK)
1. `npm run dev` and open http://localhost:5173
2. Setup wizard shows Managed/BYOK choice before provider selection
3. Selecting "Managed" skips API key entry and proceeds to KB onboarding
4. KB generation succeeds using managed embeddings endpoint
5. Live call suggestion engine uses managed embeddings for semantic matching
6. Selecting "BYOK" shows existing provider forms and works as before
7. Settings page allows switching between managed and BYOK

### Feature 2 (Security modal)
1. Open Setup page, click "Security stuff for techies"
2. New "How search works" section visible with embedding explanation
3. Managed vs BYOK note displays correctly based on selected mode

### Feature 3 (Audio picker)
1. Open Clumo in Electron (`cd electron && npm start -- --dev`)
2. Open a Zoom/Teams/Meet meeting
3. AudioSourcePicker shows detected meeting app as a card
4. "Entire Screen" always visible
5. Advanced section expands to show full source list
6. Selecting a detected app and starting a call captures audio correctly
7. With no meeting apps open, picker shows "no meetings detected" with Entire Screen as the primary option
