# Plan: Louder, more sophisticated Solution Engineer voice + stop the "stakeholders" loop

Branch: `experimental/realtime-coaching`

## Problem

Two related complaints about the live coaching hot lane (`coaching-engine.js` `nudge()`):

1. **Solution Engineer feels quiet and shallow.** Even when SE is chosen, its advice
   is thin. Root causes:
   - The nudge call injects only each persona's one-line `lens` + move names
     (coaching-engine.js:239-241). The rich per-persona `systemPrompt` expert
     judgment in `coaching-personas.js` is **never sent to the model**.
   - MEDDPICC is framed as purely commercial/AE-owned, so the technical dimensions
     of Metrics / Decision Criteria / Identified Pain / Competition are invisible to
     the SE lens.
   - SE's move slice `[Dig, Reframe, DeRisk, HandleObjection, Sharpen]` is mostly
     reactive/defensive. SE has no assertive "prove the tech" or "quantify the tech
     win" move, while AE owns three deal-driving moves.

2. **It keeps re-nudging the same "stakeholders" theme.** Root causes:
   - MEDDPICC gaps (Economic Buyer, Champion, Decision Process) persist for most of a
     call, so every cadence check re-derives the same "identify the economic buyer /
     clarify decision roles" nudge.
   - Dedup is soft and **headline-only** (`_recentHeadlines()`), and the move type is
     recorded but never shown to the model, so rephrased repeats slip through.

## User decisions (confirmed)

1. Make MEDDPICC **multi-lens** with explicit SE technical ownership. ✔
2. Repetition handling: **soft** — show what's already covered + tell the coach to go
   deeper or switch; **no hard block**. ✔
3. Add two new SE moves: **Prove it** + **Quantify tech value**. ✔
4. Inject the full expert persona `systemPrompt`s into the nudge call + deepen SE. ✔

## Approach

### 0. Latency benchmark FIRST — gate the whole approach
Run BEFORE any code changes. Priority for this strategic path:
**accuracy / value-add > latency**, but we validate the latency cost of the bigger
prompt up front so we go in eyes-open.

- Add `server/scripts/coaching-latency-bench.js` (on-demand; makes real provider calls,
  needs a configured BYOK/managed key; NOT part of `npm test`):
  - Loads the active chat provider the same way `ws.js` does.
  - Builds ONE fixed, realistic nudge `user` payload (call state + brief + a technical
    conversation window) so only the SYSTEM prompt differs between arms.
  - Arm A = **lean** system prompt (today's one-line lens catalogue).
  - Arm B = **full** system prompt (persona `systemPrompt`s — which already exist in
    coaching-personas.js — plus a drafted MEDDPICC multi-lens mapping block).
  - Warm-up call first (discount cold start), then N runs each (e.g. 8), timing
    wall-clock round-trip per call.
  - Reports per arm: mean, p50, p90, min/max, the **B−A delta**, and system-prompt
    token/char sizes.
- **Gate:** review the delta before implementing. If the full prompt keeps the nudge
  comfortably within its ~2s feel, proceed with the full approach. If p90 regresses
  materially (past ~2.5s), trim the injected prompt (shorten the two quieter personas,
  keep SE rich) and re-measure before continuing.
- Record the measured numbers (report to the user; later capture in STATUS/commit).

### 1. coaching-personas.js — richer SE + two new moves
- Add to `MOVES`:
  - `ProveIt`: offer concrete technical proof (benchmark, reference architecture,
    security posture, POC) to convert interest/doubt into confidence.
  - `QuantifyTech`: put numbers on the technical win (latency, uptime, throughput,
    hours saved, risk removed), not adjectives.
- Add `ProveIt`, `QuantifyTech` to SE's `moves`.
- Deepen the SE `lens` and `systemPrompt`: add explicit MEDDPICC-technical ownership
  (M=technical KPIs, D1=technical eval/POC criteria, I=technical pain, C2=technical
  differentiation) and the proactive prove/quantify posture.

### 2. coaching-engine.js — feed the coach its real intelligence
- **Inject full persona judgment** into the nudge system prompt: replace the one-line
  lens catalogue with each persona's `label` + full `systemPrompt` + move list. Output
  stays lean (220 tokens) — only the system message grows.
- **MEDDPICC multi-lens mapping**: add a block that states each criterion has a
  technical dimension the SE lens owns, so a `M=missing` / `D1=missing` gap can be
  nudged the SE way, not only the AE way.
- **Soft repetition fix**:
  - Extend `_recentHeadlines()` → render `move (persona): headline` so repeats are
    visible to the model.
  - Add explicit instruction: if about to repeat a move/theme already covered, either
    go deeper with new specificity or switch to an under-served criterion/lens; never
    restate the same nudge.
  - Add "rotate across MEDDPICC criteria" guidance so it stops fixating on one gap.
- **Cadence focus hint (soft)**: on a routine cadence check (no key moment), compute
  which MEDDPICC criteria are unconfirmed AND not recently nudged, and pass a light
  "consider these under-served criteria" line. Directly reduces the stakeholder loop
  and gives SE-owned technical criteria airtime. No hard block.
- `MOVE_NAMES` derives from `Object.keys(MOVES)`, so the new moves validate
  automatically.

### 3. CoachingPanel.jsx — label the new moves
- Add `MOVE_LABELS`: `ProveIt: 'Prove it'`, `QuantifyTech: 'Quantify value'`.

### 4. Tests
- **server/tests/coaching-engine.test.js**:
  - Nudge system prompt now contains SE expert judgment (e.g. 'reference
    architecture') and the MEDDPICC-technical mapping.
  - New moves `ProveIt` / `QuantifyTech` are accepted and tagged through.
  - "Already covered" list includes move + persona; the go-deeper/switch instruction
    appears when `movesGiven` is non-empty.
  - Cadence focus hint lists under-served criteria from a supplied MEDDPICC.
- **web/tests/components/CoachingPanel.test.jsx**: renders the new move labels.
- **e2e/browser/coaching.spec.js**: emit an SE nudge with `move: 'QuantifyTech'` (or
  `ProveIt`) and assert the label renders.
- Rebuild web assets before browser E2E. Run server + web unit + browser E2E; all green.

### 5. Wrap up
- Update SQL todos + STATUS.md (include the latency numbers from step 0). Commit with
  the Co-authored-by trailer. Push only if the user asks.

## Notes / trade-offs
- Injecting full persona prompts increases the nudge system-prompt token count
  (~3 short expert blocks + the MEDDPICC mapping). The lean 220-token OUTPUT budget is
  unchanged. The exact latency cost is measured by the benchmark in step 5 rather than
  assumed — accuracy/value is the priority, but we record the delta and trim if p90
  regresses materially.
- Soft repetition means the model can still occasionally repeat; that was the explicit
  choice over hard suppression to avoid muzzling a genuinely still-relevant nudge.
