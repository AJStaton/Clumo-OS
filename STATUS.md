# Clumo OS Development Status

## Phase 1: Managed Embeddings + BYOK/Managed Key Architecture
- [x] 1.1 Add ManagedProvider class in server/ai-provider.js
- [x] 1.2 Add loadEmbeddingProvider() function
- [x] 1.3 Add provider_mode config key support
- [x] 1.4 Update KnowledgeGenerator to accept embeddingProvider
- [x] 1.5 Update SuggestionEngine to accept embeddingProvider
- [x] 1.6 Update routes (api.js + ws.js)
- [x] 1.7 UI: Setup.jsx managed/BYOK toggle
- [x] 1.8 UI: Settings.jsx managed/BYOK toggle

## Phase 2: Update Security Modal for Embeddings
- [x] 2.1 Add "How search works" section
- [x] 2.2 Update existing embedding bullet points
- [x] 2.3 Add managed mode note

## Phase 3: Simplified Audio Source Selection
- [x] 3.1 Add get-meeting-sources IPC handler in main.js
- [x] 3.2 Update preload.js
- [x] 3.3 Rewrite AudioSourcePicker.jsx
- [x] 3.4 Platform warnings

## Phase 4: UI Improvements
- [x] 4.1 Replace native file input with styled button in Setup.jsx
- [x] 4.2 Update Nav.jsx labels and paths
- [x] 4.3 Update App.jsx routes and redirects
- [x] 4.4 Update Sessions.jsx heading and text
- [x] 4.5 Update Session.jsx "Call Notes" → "Session Notes"
- [x] 4.6 Fix Settings NavLink active state for sub-routes
- [x] 4.7 Rewrite Settings.jsx as layout with sidebar
- [x] 4.8 Create AiModelsSettings.jsx (extract from Settings)
- [x] 4.9 Create IntegrationsSettings.jsx (MCP status cards)
- [x] 4.10 Create AutomationSettings.jsx (CRUD with localStorage)
- [x] 4.11 Update App.jsx with nested settings routes

## Phase 5: Post-Call Features & Enhancements
- [x] All features complete (see previous status)

## Phase 6: UI Sidebar Redesign

### Layout & Navigation
- [x] 6.1 Create AppContext (sessions, preferences, connectionStatus)
- [x] 6.2 Create Sidebar component (260px, Summaries + Settings sections)
- [x] 6.3 Restructure App.jsx (sidebar + main flex layout, remove Nav.jsx)
- [x] 6.4 Remove standalone /history route (Summaries in sidebar only)
- [x] 6.5 Move Knowledge Base into /settings/knowledge-base
- [x] 6.6 Delete Nav.jsx, IntegrationsSettings.jsx, AutomationSettings.jsx

### Sidebar Features
- [x] 6.7 Summaries list with search, AI names, analyzed badge
- [x] 6.8 Session "..." context menu (Rename, Export JSON, Delete with confirm)
- [x] 6.9 Empty-state onboarding card for first-run users
- [x] 6.10 Settings nav links (KB, Preferences, AI Models, greyed Integrations/Automations)
- [x] 6.11 Connection status indicator at bottom
- [x] 6.12 Sidebar auto-collapse to icon rail during active calls

### Call Page
- [x] 6.13 Hero heading with subtitle for idle/pre-call state
- [x] 6.14 Large red "Start listening" CTA with Ctrl+L hint
- [x] 6.15 Methodology letters (MEDDPICC/BANT) vertical with hover tooltips
- [x] 6.16 Ctrl+L keyboard shortcut (toggle listening)
- [x] 6.17 Sidebar collapse notified on listening state change

### Preferences & Methodology
- [x] 6.18 Preferences settings page (MEDDPICC vs BANT radio toggle)
- [x] 6.19 Server GET/PATCH /api/preferences endpoints
- [x] 6.20 Analysis module supports BANT prompt + scoring
- [x] 6.21 MeddpiccTracker component supports methodology prop
- [x] 6.22 Session detail page renders BANT or MEDDPICC analysis

### Server Endpoints
- [x] 6.23 PATCH /api/session/:id/rename
- [x] 6.24 GET /api/session/:id/export (JSON download)
- [x] 6.25 Settings page simplified (no own sidebar, uses main sidebar)

## Phase 7: Azure AI Foundry (Managed Provider) Fixes
- [x] 7.1 Rewrote ManagedProvider for Azure AI Model Inference API
- [x] 7.2 Fixed endpoint format (base URL + /models, no project path)
- [x] 7.3 Fixed api-version (2024-05-01-preview for Foundry)
- [x] 7.4 Added model field injection for all chat/embedding calls
- [x] 7.5 Switched embedding model to text-embedding-ada-002
- [x] 7.6 Separate embedding client with correct model header
- [x] 7.7 Wrapped OpenAI client in knowledge-generator + api.js for model injection
- [x] 7.8 Full KB generation pipeline verified end-to-end

## Phase 8: Robust Knowledge-Base Onboarding (tiered fetch + type-routed generation)

### Fetch layer (static -> headless)
- [x] 8.1 server/fetch/extract.js — pure HTML extraction + confidence scoring (JSON-LD, OG, __NEXT_DATA__/Nuxt detection)
- [x] 8.2 server/fetch/static-fetcher.js — axios fetch + parse
- [x] 8.3 server/fetch/headless-fetcher.js — Playwright lazy render, capability check, graceful degrade, render cap
- [x] 8.4 server/fetch/page-fetcher.js — tiered orchestrator, composite quality gate, per-run cache, per-source telemetry

### Discovery layer
- [x] 8.5 server/discovery/sitemap.js — robots.txt + sitemap.xml + index recursion
- [x] 8.6 server/discovery/classify.js — URL classifier + ranker + dedupe, per-type budgets
- [x] 8.7 server/discovery/adapters/ — registry + interface + Microsoft adapter (optional)
- [x] 8.8 server/discovery/url-discovery.js — orchestrator (pasted + sitemap + anchors + adapters), JS listing expansion

### Generation + orchestration
- [x] 8.9 server/onboarding/source-collector.js — type-routed bundles + case-study extraction + per-type coverage
- [x] 8.10 knowledge-generator.js — shared company-context packet, per-type bundle routing, primary/fallback path recording
- [x] 8.11 knowledge-generator.js — profile threading (personas / ICP / competitors) into analysis + generators
- [x] 8.12 routes/api.js — wired collectSources + pasted sources + profile + coverage in SSE complete

### UI
- [x] 8.13 Setup.jsx — guided multi-source form (per-type URLs) + "who do you sell to?" profile
- [x] 8.14 Setup.jsx — per-type results summary with warnings + "add a source & re-run"

### Packaging + tests
- [x] 8.15 server/package.json — playwright dependency + install:chromium script
- [x] 8.16 electron — prebuild installs Chromium (PLAYWRIGHT_BROWSERS_PATH=0); server-manager sets runtime browser path
- [x] 8.17 Unit tests: extract, classify, sitemap, page-fetcher escalation, source-collector (HTML fixtures, no live network)
- [x] 8.18 Live smoke validated: Legora discovery 15 CS / 20 blog / 20 product, headless renders working
- [ ] 8.19 Packaged-build smoke (Win + macOS) — deferred, requires installer build environment

### Empirical findings (drove the design)
- Blog/proof-point and product/docs pages are server-rendered everywhere (static works).
- Case studies fail two ways: discovery (Beamery: no sitemap + JS listing) and extraction (Legora individual pages are client-rendered shells — headless does not fully rescue; extract from rich SSR listing + structured data with low confidence + "paste a URL" warning).
- New pipeline recovers 12-15 case studies on Legora/Beamery/HappyRobot where the old scraper returned 0.

## Phase 9: Realtime Suggestions — Speed + Relevance Overhaul
Target: cut customer-statement -> suggestion latency from 3-5s to <=1.5s and sharpen relevance.

### G. Instrumentation (baseline)
- [x] 9.G Per-stage latency tracker in suggestion-engine (`statement->decision` with embed/match/llm splits); statement->emit timing in ws.js. `[Suggestion]`/`[WS]` prefixes.

### A. Streaming transcription
- [x] 9.A gpt-4o-mini-transcribe everywhere; whisper-1 removed (no fallback)
- [x] 9.A Handle input_audio_transcription.delta (partial utterance) + .completed (authoritative finalize)
- [x] 9.A VAD silence_duration_ms lowered to 300; prefix_padding_ms kept
- [x] 9.A Transcription model surfaced across Azure/OpenAI/Managed providers + managed default (gpt-4o-mini-transcribe)

### B. Warm-candidate / speculative pipeline
- [x] 9.B Removed 50-word buffer gate; analysis driven off utterance deltas (debounced ~400ms)
- [x] 9.B Continuous local semantic match on current utterance; warm candidate set + incremental embedding
- [x] 9.B Speculative decision-LLM pre-fire on strong local trigger; confirm/discard at pause
- [x] 9.B isAnalyzing hard-lock replaced with latest-wins (_evalSeq cancel-in-flight)

### D. Retrieval vs decision-context split
- [x] 9.D Retrieval embeds the pivotal recent utterance (last sentence/turn), not the full rolling buffer
- [x] 9.D Decision context layered: pivotal "what just happened" + recent turns + running call brief + candidate shortlist
- [x] 9.D Running call brief (industry/goals/requirements/competitors/pains) maintained in the meddpicc pass

### C. Candidate selection redesign
- [x] 9.C Fused multi-type candidate set, no intent/type routing
- [x] 9.C Dynamic relative threshold (top score - margin) instead of fixed 0.3
- [x] 9.C Fast path: dominant local match surfaces directly, skipping the decision LLM

### E. Decision LLM optimization
- [x] 9.E response_format json_object, trimmed system+candidate prompt, max_tokens 120
- [x] 9.E (Trade-off) chose json_object + low tokens + fast-path over token-streaming for robustness

### F. Frequency & speaker attribution
- [x] 9.F Permanent suggestedIds dedup replaced with re-surface cooldown
- [x] 9.F Fixed 60s rate-limit replaced with short cooldown (15s)
- [x] 9.F Lightweight customer-statement heuristic so the engine reacts to the customer
- [x] 9.F markSuggestionUsed/markSuggestionDismissed implemented (were called but missing)

### H. Tests & config
- [x] 9.H server/tests/suggestion-engine.test.js — pivotal embedding, fast path, decision LLM, cooldown, layered context, speculative warm reuse
- [x] 9.H ai-provider tests extended for transcription-model defaults/override
- [x] 9.H Managed defaults + Setup.jsx copy updated to gpt-4o-mini-transcribe
- [x] 9.H web partial-transcript wiring (CallSessionContext) for live in-flight utterance

### Verification
- [x] Server suite green (122 tests); web build clean (vite); server boots clean
- [ ] Live latency measurement pending real audio session
- [ ] RISK: Azure/managed deployments must expose a gpt-4o-mini-transcribe deployment (verify availability)

### Phase 9 addendum: single-model transcription
- [x] Realtime transcription session now connects via the transcription model itself (intent=transcription), so a separate realtime host deployment (gpt-realtime-mini) is no longer required. realtimeModel/realtimeDeployment kept only as a backward-compatible fallback.
- [x] gpt-4o-mini-transcribe is the single deployment for all transcription elements (managed default + provider default).
- [x] Azure: realtime deployment no longer required by loadProvider or the settings API; added a Transcription deployment field in Setup + AI Models settings (maps to transcription_model). Verified live against Azure AI Foundry (single gpt-4o-mini-transcribe deployment hosts + transcribes).
