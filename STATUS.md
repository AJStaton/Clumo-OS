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
