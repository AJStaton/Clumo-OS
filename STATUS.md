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

## Phase 9: Guided Onboarding + Relevance-Ranked Knowledge Base
Fixes two defects: (1) onboarding azure.microsoft.com/en-gb returned all-SAP case studies; (2) the user was never prompted for profile/source specifics (inputs were hidden behind collapsed toggles).

### Backend — relevance + listing hygiene (fixes the SAP flood)
- [x] 9.1 server/discovery/classify.js — narrow/vertical listing detection (/solutions/<x>/customers), locale-dedupe (prefers user locale -> en-us -> first), fragment-URL stripping; narrow + fragment listings down-ranked
- [x] 9.2 server/discovery/url-discovery.js — diversifyCaseStudies(): per-listing contribution cap (narrow <=5, round-robin master-first) so one vertical listing cannot flood the bucket; userLocale-aware ranking
- [x] 9.3 server/onboarding/relevance.js (new) — weighted keyword/phrase scorer (priorities/focusProducts=3, industries=2, personas/companyKeywords=1); URL-slug bonus; returns null when no seller context (preserves discovery order)
- [x] 9.4 server/onboarding/source-collector.js — two-pass fetch->score->extract; demote case studies below RELEVANCE_FLOOR (0.12) to weak candidates only when the seller gave explicit focus; csDemoted telemetry + coverage warning

### Backend — wizard support
- [x] 9.5 server/onboarding/site-scanner.js (new) — scanSite(url): fast, discovery-only detection of products/solutions + case-study/docs/blog hubs (sitemap + homepage anchors + classifier; no per-page LLM, no headless)
- [x] 9.6 routes/api.js — POST /api/onboarding/scan; threaded priorities + richer profile through start/add-documents/SSE
- [x] 9.7 knowledge-generator.js — buildProfileContext extended with role, focusProducts, focusIndustries, companySize, personas, priorities

### Frontend — guided wizard
- [x] 9.8 Setup.jsx — stepped onboarding wizard: About you (5 structured fields) -> Website + upload -> Scan -> Priorities -> Confirm sources -> Run; replaces hidden collapsibles. Scan-race guard, dirty-field protection on source prefill, re-scan priority reconciliation, double-submit guard, EventSource cleanup

### Tests
- [x] 9.9 classify/diversity/relevance/collector/site-scanner unit tests (no live network); full suite 125 green
- [x] 9.10 Live-validated: azure.microsoft.com/en-gb scan resolves the master /en-gb/resources/customer-stories hub (not the SAP narrow listing) + 24 products/24 solutions; beamery.com scan resolves /customers/ + 5 products/4 solutions

## Phase 10: Maximize KB Volume + Soft Prioritisation (host-agnostic)
Reframe from filtering to volume + ordering. User inputs now PRIORITISE (never delete) across all four KB types; targets raised and grounded via multi-pass generation; case-study harvest hardened generically; the only host-specific code (Microsoft adapter) retired.

### Volume (quality-dependent — never padded/fabricated)
- [x] 10.1 knowledge-generator.js — config-driven targets (DQ 100, proof 50, product truths 100, case-study inference 30); GEN_MAX_TOKENS 8000; GEN_INPUT_CHARS 48000
- [x] 10.2 knowledge-generator.js — _generateItems() multi-pass continuation (chunk content, do-not-repeat avoid-list, dedupe by per-type identity, stop on target/exhaustion/no-new) for all four types
- [x] 10.3 knowledge-generator.js — parseJsonArray + _salvageObjects() recover complete objects from truncated arrays
- [x] 10.4 source-collector.js — BUNDLE_CHAR_CAP 45k->120k, MAX_PAGES_PER_BUNDLE 12->30; url-discovery perTypeBudget 20->30
- [x] 10.5 routes/api.js — reads max_discovery_questions/max_proof_points/max_product_truths/max_case_studies_inferred config; passes targets into generate()

### Soft prioritisation (order, never filter)
- [x] 10.6 source-collector.js — hard demotion gate REMOVED; every extracted case study kept; relevance used only to sort (trusted -> relevance -> confidence); telemetry caseStudyOnFocus/OffFocus/Trusted
- [x] 10.7 relevance.js — scoreCaseStudyDetailed rewritten for partial/proportional token matching + GENERIC_TERMS downweighting; matchedFocus is telemetry-only, not a gate
- [x] 10.8 knowledge-generator.js — profileCtx threaded into ALL four generators; DQ prompt actively tailors to role/persona/industry/segment; soft "lead with these, still include others" language everywhere

### Host-agnostic case-study harvest
- [x] 10.9 headless-fetcher.js — listing mode: bounded scroll/load-more loop (driveListing) accumulating anchors across rounds (handles list-replacing pagination); generic JSON-response sniffing (extractStoryUrlsFromJson) for SPA tiles; playwright injection seam for tests
- [x] 10.10 page-fetcher.js — forced listings prefer rendered result when it surfaces candidate STORY links (story-path heuristic, not nav chrome) even if text is thinner; threads jsonLinks
- [x] 10.11 url-discovery.js — expand() merges DOM links (primary) + jsonLinks (secondary) with host-check, dedupe, harvestMethod provenance; jsonHarvestedLinks/listingExpansionIncomplete telemetry
- [x] 10.12 RETIRED server/discovery/adapters/microsoft.js (the SAP-flood sitemap firehose); registry now empty []; generic SPA harvest replaces its value. No host-specific code ships.

### UI
- [x] 10.13 OnboardingWizard.jsx — "ranking/limiting" copy replaced with prioritisation language ("others still included")
- [x] 10.14 KB.jsx — per-type counts already shown; thin-grounding coverage warnings now surfaced at first-run parity with Setup.jsx (BackgroundProcessContext carries coverage)

### Tests
- [x] 10.15 headless-fetcher.test.js (new, fake-browser): JSON extraction, listing loop + accumulation, non-listing isolation, graceful degrade; page-fetcher listing link-preference + jsonLinks threading; full suite 146 green

## Phase 11: Realtime Suggestions — Speed + Relevance Overhaul
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

### Phase 11 addendum: single-model transcription
- [x] Realtime transcription session now connects via the transcription model itself (intent=transcription), so a separate realtime host deployment (gpt-realtime-mini) is no longer required. realtimeModel/realtimeDeployment kept only as a backward-compatible fallback.
- [x] gpt-4o-mini-transcribe is the single deployment for all transcription elements (managed default + provider default).
- [x] Azure: realtime deployment no longer required by loadProvider or the settings API; added a Transcription deployment field in Setup + AI Models settings (maps to transcription_model). Verified live against Azure AI Foundry (single gpt-4o-mini-transcribe deployment hosts + transcribes).

### Phase 12: suggestion trigger timestamps + source links
- [x] Each surfaced suggestion carries a triggeredAt timestamp = when the customer spoke the triggering statement (WS passes statementAt -> engine stamps ISO time; shown on the live SuggestionCard and in the session summary).
- [x] Case study, proof point and product truth suggestions render a clickable source link when present. Case studies/proof points already had link data; added an optional link field to product truths (empty for existing entries).
- [x] knowledge-base.js product truths gained an optional link field; knowledge-generator.js prompt + normalization capture a source URL/file for newly generated product truths; KB page shows the product-truth source link.
- [x] Server suite green (131 tests); web build clean.

### Phase 13: suggestion variety + "why" trigger line
- [x] Root cause measured: single-vector cosine favours discovery questions (they embed closest to customer statements), so the old relative-margin candidate set was ~57% discovery and the LLM could only pick DQs even on clear evidence moments. Not a missing-data problem (KB: dq=105 cs=59 pp=47 pt=159, all embedded).
- [x] V1 Per-type retrieval quotas in _selectCandidates (discovery 4 / case_study 3 / proof_point 2 / product_truth 3 = MAX_CANDIDATES) so the LLM always sees a fair multi-type shortlist. Under-fill tops up to MIN_CANDIDATES; nothing padded below the floor.
- [x] V2 Hybrid semantic+trigger scoring in _semanticCandidates: final = cosine + min(triggerHits,3)x0.04 using each item's curated triggers (lifts evidence when the customer literally says "AWS", "SLA", "Gartner", "data residency", etc). Bounded so keywords can't win alone. Shared _triggerHits helper reused by the no-embeddings fallback.
- [x] V3 Decision-LLM steering: DECISION_SYSTEM now prefers evidence on skepticism/proof/competitor/requirement/product questions (still free choice, no routing); buildDecisionPrompt adds a "RECENTLY SHOWN" line from recent suggestion types.
- [x] V4 Anti-monotony rotation: engine tracks recentTypes (last 3); selection applies a soft -0.03 de-emphasis to the most-recently-used type. Gentle, not a ban.
- [x] V5 "Why" trigger (verbatim-grounded): engine _groundTrigger accepts the LLM trigger only if it is a real substring of the recent transcript, else falls back to the verbatim pivotal utterance — every surfaced suggestion carries a genuine customer quote. SuggestionCard shows an always-visible muted, truncated trigger line ("why now") with the full quote in the title on hover; SessionSummary rows get the same tooltip. Card stays minimal.
- [x] V6 Tests + verify: 137 server tests green (added quota multi-type guarantee, hybrid ranking, anti-monotony, prompt steering + recent-types, verbatim grounding kept/fallback). Web bundle rebuilt clean.
- [x] Offline diagnostic re-run vs real KB: candidate composition shifted from ~57% discovery to dq=32 cs=21 pp=12 pt=19 across 8 utterances (evidence now the majority of seats); proof/skepticism utterance tops with proof_point, SLA utterance fast-paths a product_truth, security tops with product_truth.

## Phase 14: CRM note sync (Dynamics 365 / MSX) — Phase 0
Push a session's summary notes to the right Dynamics 365 (MSX) opportunity, picked via an Account → Opportunity cascade or by Opportunity ID. Built behind a CRM-agnostic provider abstraction (mirrors ai-provider.js) so Salesforce/HubSpot drop in later; the UI renders from a per-provider capability descriptor.

### Auth (delegated, Phase 0)
- [x] 14.1 server/crm/dynamics-auth.js — delegated Dataverse token via Azure CLI (pre-consented first-party public client, scope user_impersonation, ~1h auto-refresh). No app registration, no stored secret. getToken()/whoAmI() + AZ_NOT_FOUND/AZ_NOT_LOGGED_IN/AZ_ERROR classification. Phase 1 swaps this for in-app MSAL with no interface change.

### Provider abstraction
- [x] 14.2 server/crm-provider.js — DynamicsProvider implements generic verbs (getCapabilities/testConnection/listParents/listRecords/findByExternalId/appendNote) against the Dataverse Web API v9.2. MSX specifics (msp_* fields, msp_accountteam virtual entity) contained here. Registry + listProviderCatalog (dynamics=available, salesforce/hubspot=coming_soon) + loadCrmProvider + config helpers (no secret in Phase 0).
- [x] 14.3 server/crm/note-format.js — pure, testable note composition: composeNote(analysis) (call notes + next steps), appendComment() appends into msp_forecastcommentsjsonfield JSON cards ({UPPER-GUID}/modifiedOn/comment, chronological) + mirrors the legacy plain-text field. Non-mutating; recovers from malformed JSON.

### Verified facts (raw Dataverse Web API + delegated az token — no MCP)
- Write confirmed via reversible PATCH test on a real opportunity (backup in session files/msx-comments-backup.json). Comments cards = msp_forecastcommentsjsonfield; legacy mirror = msp_forecastcomments. Business "Opportunity Id" = msp_opportunitynumber; PK = opportunityid.
- L1 accounts: GET /msp_accountteams?$filter=_msp_systemuserid_value eq {me} (MSX virtual entity — needs filter, rejects $select). L2 opps: GET /opportunities?$filter=_parentaccountid_value eq {acc} and statecode eq 0. Search: msp_opportunitynumber eq '{id}'.

### API routes (CRM-generic :provider segment)
- [x] 14.4 routes/api.js — GET /api/integrations (catalog + descriptors + connection status); POST :provider/connect|disconnect; GET :provider/parents; GET :provider/parents/:parentId/records; GET :provider/records/search?number=; POST :provider/records/:recordId/notes. resolveProvider guard + crmErrorStatus (AZ_* → 400, else 502). Unknown providers 404.

### UI (descriptor-driven, per-CRM)
- [x] 14.5 web/src/pages/IntegrationsSettings.jsx — provider cards: Dynamics 365 Setup/Disconnect (shows signed-in user); Salesforce + HubSpot "Coming soon" (disabled). Auth initiated on Setup click, not app login. Routing enabled in App.jsx; Sidebar Integrations NavLink activated.
- [x] 14.6 web/src/components/crm/GenericSyncPanel.jsx — renders the cascade entirely from the provider capability descriptor (step labels/order, ID-search affordance), editable note preview, Sync → POST notes with result/error. No CRM hardcoding.
- [x] 14.7 web/src/components/crm/syncPanelRegistry.js — providerId → bespoke panel map, defaults to GenericSyncPanel (per-CRM UI override point).
- [x] 14.8 web/src/components/SyncToCrmPanel.jsx — wrapper: resolves the connected provider + descriptor, picks the registry panel, composes the default note from analysis. Mounted in SessionSummary.jsx near the CRM Update card; shows a "set up an integration" hint when nothing is connected.

### Tests + verification
- [x] 14.9 server/tests/crm/note-format.test.js (11) + crm-provider.test.js (9, _request stubbed — no live MSX): braceGuid/formatModifiedOn/composeNote/appendComment; cascade mapping, ID-search quote-escaping, append GET-then-PATCH ordering, registry catalog. Full server suite green (207 tests); web build clean (vite).

### Phasing
- Phase 0 (this): Dynamics only, az-CLI delegated auth, full sync + cascade, SF/HubSpot placeholders.
- Phase 1 (later): Clumo's own multi-tenant public client; in-app MSAL replaces the az shell; encrypt refresh token. No interface change.
- Phase 2 (later): SalesforceProvider / HubSpotProvider behind the same interface + descriptor.

