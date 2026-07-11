// On-demand latency benchmark for the realtime coaching hot lane.
//
// Question it answers: what does injecting the full per-persona expert judgment
// (+ a MEDDPICC multi-lens mapping) into the nudge system prompt cost in latency,
// versus today's lean one-line lens catalogue? Accuracy/value-add is the priority
// for this strategic path, but we measure the latency delta up front so the design
// choice is eyes-open.
//
// It makes REAL provider calls (needs a configured BYOK key) and is NOT part
// of `npm test`. Only the SYSTEM prompt differs between the two arms; the user payload
// is identical, so the measured delta isolates the system-prompt size effect.
//
// Usage:
//   node scripts/coaching-latency-bench.js            # 8 runs per arm (default)
//   node scripts/coaching-latency-bench.js --runs 12  # custom run count
//   node scripts/coaching-latency-bench.js --json      # machine-readable summary

const { loadProvider } = require('../ai-provider');
const { PERSONAS } = require('../coaching-personas');

// ---- Nudge call knobs (must match coaching-engine.js nudge()) ----------------
const NUDGE_MAX_TOKENS = 220;
const CHAT_OPTIONS = { temperature: 0.3, max_tokens: NUDGE_MAX_TOKENS, response_format: { type: 'json_object' } };

// ---- Arm A: today's LEAN system prompt (one-line lens catalogue) -------------
function leanSystemPrompt() {
  const lensCatalogue = PERSONAS
    .map(p => `- ${p.label} (${p.id}): ${p.lens} Moves: ${p.moves.join(', ')}.`)
    .join('\n');

  return `You are an elite real-time sales coach sitting silently alongside the salesperson on a live call — the kind of coach who feels like a world-class solution engineer, account executive and negotiator rolled into one.

You carry three lenses. For each moment, adopt the SINGLE most valuable one and tag it:
${lensCatalogue}

How you coach:
- Be proactive and directional. Guide the conversation: the right question or the right steer at exactly the right time.
- Ground every move in the call state, the rep's goals, and MEDDPICC gaps. Go after what genuinely matters next, not generic advice.
- You speak rarely — 2-4 times in a 30-minute call. Silence beats noise. If there is no genuinely high-value move right now, set coach=false.
- Never repeat a nudge already given. Never sound scripted or manipulative.

Return ONLY valid JSON, nothing else:
{
  "nudge": {
    "coach": true|false,
    "confidence": 0.0-1.0,
    "persona": "se|ae|closer",
    "move": "<one move name>",
    "signal": "the customer sentiment or cue that triggered this, short phrase",
    "headline": "imperative, max 8 words",
    "why": "one short line",
    "say": "optional exact words the rep can use, else empty string",
    "urgency": "now|soon"
  }
}`;
}

// ---- Arm B: FULL system prompt (per-persona judgment + MEDDPICC multi-lens) ---
// Representative of the intended change: injects each persona's rich systemPrompt
// (which already exists in coaching-personas.js) plus the MEDDPICC-technical mapping.
function fullSystemPrompt() {
  const lensCatalogue = PERSONAS
    .map(p => `### ${p.label} (${p.id}) — moves: ${p.moves.join(', ')}\n${p.systemPrompt}`)
    .join('\n\n');

  const meddpiccLenses = `MEDDPICC is multi-lens, not purely commercial. Each criterion has a technical dimension the Solution Engineer owns as much as the Account Executive owns the commercial one:
- M (Metrics): technical KPIs — latency, uptime, throughput, error rate, time-to-value.
- E (Economic Buyer): commercial (AE).
- D1 (Decision Criteria): technical evaluation criteria, requirements, must-haves, POC success criteria.
- D2 (Decision Process): commercial/process (AE).
- P (Paper Process): commercial (AE).
- I (Identified Pain): technical pain — integration burden, tech debt, scaling limits, security exposure — as well as business pain.
- C1 (Champion): commercial (AE).
- C2 (Competition): technical differentiation vs the incumbent/alternative, not just commercial positioning.
When a technical criterion is the gap, coach it through the Solution Engineer lens.`;

  return `You are an elite real-time sales coach sitting silently alongside the salesperson on a live call — a world-class solution engineer, account executive and negotiator rolled into one.

You carry three lenses. For each moment, adopt the SINGLE most valuable one, apply that persona's full judgment, and tag it:

${lensCatalogue}

${meddpiccLenses}

How you coach:
- Be proactive and directional. Guide the conversation: the right question or the right steer at exactly the right time.
- Ground every move in the call state, the rep's goals, and the specific MEDDPICC gap — commercial OR technical — that matters next. Not generic advice.
- Do not fixate. If you have already pushed a theme, either go deeper with new specificity or switch to an under-served criterion or lens.
- You speak rarely — 2-4 times in a 30-minute call. Silence beats noise. If there is no genuinely high-value move right now, set coach=false.
- Never sound scripted or manipulative.

Return ONLY valid JSON, nothing else:
{
  "nudge": {
    "coach": true|false,
    "confidence": 0.0-1.0,
    "persona": "se|ae|closer",
    "move": "<one move name>",
    "signal": "the customer sentiment or cue that triggered this, short phrase",
    "headline": "imperative, max 8 words",
    "why": "one short line",
    "say": "optional exact words the rep can use, else empty string",
    "urgency": "now|soon"
  }
}`;
}

// ---- One fixed, realistic technical-call user payload (identical across arms) --
const USER_PROMPT = `A key moment was just detected (cue: "integration", type: integration). This looks like a Solution Engineer moment — strongly consider that lens, but use your own judgment. Pressure-test the approach and decide the best move — or stay silent if the rep is already handling it well.

CALL STATE:
Objective: Evaluate the platform for a data-ingestion modernisation
Stage: demo
Established: They run a legacy on-prem ETL stack; nightly batch is too slow
Open threads: Real-time streaming feasibility; SSO/SAML requirement
Risks: Security review not yet scheduled

CALL BRIEF:
Industry: Financial services
Pains: Nightly batch latency; brittle custom connectors
Goals: Move to near-real-time ingestion within two quarters
Requirements: SOC 2, SSO, sub-second query latency at scale
Competitors: Incumbent in-house pipeline
MEDDPICC: Metrics=missing, Economic Buyer=partial, Decision Criteria=missing, Identified Pain=confirmed, Competition=partial

RECENT CONVERSATION (last 5 min):
[-1:40] Customer: How would your platform integrate with our existing Kafka topics and our on-prem warehouse?
[-1:12] You: We have native connectors for Kafka and most warehouses.
[-0:48] Customer: What about throughput — we push about 200k events a second at peak, and latency really matters to us.
[-0:20] Customer: And honestly I'm not sure the API can handle our security requirements around data residency.

NUDGES ALREADY GIVEN (do not repeat):
(none yet)

MEDDPICC criteria definitions: M=Metrics, E=Economic Buyer, D1=Decision Criteria, D2=Decision Process, P=Paper Process, I=Identified Pain, C1=Champion, C2=Competition.`;

// ---- Timing helpers ----------------------------------------------------------
function approxTokens(str) {
  // Rough heuristic: ~4 chars/token. Good enough to show size<->latency relationship.
  return Math.round(str.length / 4);
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = samples.reduce((s, x) => s + x, 0) / n;
  const pct = (p) => sorted[Math.min(n - 1, Math.floor((p / 100) * n))];
  return { n, mean, p50: pct(50), p90: pct(90), min: sorted[0], max: sorted[n - 1] };
}

async function timeArm(provider, system, runs) {
  const samples = [];
  let lastOk = false;
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    try {
      const res = await provider.chatCompletion(
        [{ role: 'system', content: system }, { role: 'user', content: USER_PROMPT }],
        CHAT_OPTIONS
      );
      lastOk = !!(res && res.choices && res.choices[0]);
    } catch (e) {
      console.error(`  run ${i + 1} failed: ${e.message}`);
    }
    samples.push(Date.now() - t0);
  }
  return { samples, lastOk };
}

function fmt(ms) { return `${ms.toFixed(0)}ms`; }

async function main() {
  const args = process.argv.slice(2);
  const runsArg = args.indexOf('--runs');
  const runs = runsArg >= 0 ? parseInt(args[runsArg + 1], 10) || 8 : 8;
  const asJson = args.includes('--json');

  const provider = loadProvider();
  if (!provider || typeof provider.chatCompletion !== 'function') {
    console.error('No chat-capable provider configured. Set up a BYOK key first.');
    process.exit(1);
  }
  if (process.env.CLUMO_FAKE_PROVIDER === '1') {
    console.error('Refusing to benchmark the fake provider (CLUMO_FAKE_PROVIDER=1). Unset it for a real measurement.');
    process.exit(1);
  }

  const lean = leanSystemPrompt();
  const full = fullSystemPrompt();
  const model = (provider.getChatModel && provider.getChatModel()) || provider.chatModel || provider.chatDeployment || 'unknown';

  if (!asJson) {
    console.log(`\n[Coaching latency bench] provider=${provider.constructor.name} model=${model} runs=${runs}/arm`);
    console.log(`  lean system prompt: ${lean.length} chars (~${approxTokens(lean)} tokens)`);
    console.log(`  full system prompt: ${full.length} chars (~${approxTokens(full)} tokens)`);
    console.log(`  user payload:       ${USER_PROMPT.length} chars (~${approxTokens(USER_PROMPT)} tokens)\n`);
    console.log('  Warming up (1 call per arm, discarded)...');
  }

  // Warm-up to discount cold start / connection setup — discarded.
  await timeArm(provider, lean, 1);
  await timeArm(provider, full, 1);

  // Interleave arms (A,B,A,B,...) so server-warmup / time-of-day drift affects both
  // equally and the delta isn't biased by measurement order.
  if (!asJson) console.log('  Measuring (interleaved LEAN/FULL)...');
  const leanSamples = [];
  const fullSamples = [];
  for (let i = 0; i < runs; i++) {
    leanSamples.push((await timeArm(provider, lean, 1)).samples[0]);
    fullSamples.push((await timeArm(provider, full, 1)).samples[0]);
  }
  const leanRes = { samples: leanSamples };
  const fullRes = { samples: fullSamples };

  const a = stats(leanRes.samples);
  const b = stats(fullRes.samples);
  const delta = { mean: b.mean - a.mean, p50: b.p50 - a.p50, p90: b.p90 - a.p90 };

  if (asJson) {
    console.log(JSON.stringify({
      provider: provider.constructor.name, model, runs,
      sizes: {
        leanChars: lean.length, leanTokens: approxTokens(lean),
        fullChars: full.length, fullTokens: approxTokens(full),
        userChars: USER_PROMPT.length, userTokens: approxTokens(USER_PROMPT)
      },
      lean: a, full: b, delta,
      samples: { lean: leanRes.samples, full: fullRes.samples }
    }, null, 2));
    return;
  }

  const row = (label, s) => `  ${label.padEnd(6)} mean=${fmt(s.mean).padEnd(8)} p50=${fmt(s.p50).padEnd(8)} p90=${fmt(s.p90).padEnd(8)} min=${fmt(s.min).padEnd(8)} max=${fmt(s.max)}`;
  console.log('\n  Results (wall-clock round-trip):');
  console.log(row('LEAN', a));
  console.log(row('FULL', b));
  console.log(`\n  Delta (FULL - LEAN):  mean=${delta.mean >= 0 ? '+' : ''}${fmt(delta.mean)}  p50=${delta.p50 >= 0 ? '+' : ''}${fmt(delta.p50)}  p90=${delta.p90 >= 0 ? '+' : ''}${fmt(delta.p90)}`);
  // The question is whether the FULL prompt is materially SLOWER than LEAN — not an
  // absolute bound (baseline latency is provider/model driven, ~3s here even for LEAN).
  const regression = delta.p90;
  const verdict = regression <= 250
    ? `FULL adds no material latency vs LEAN (p90 delta ${regression >= 0 ? '+' : ''}${fmt(regression)}) — proceed with the full prompt.`
    : `FULL is ~${fmt(regression)} slower at p90 than LEAN — consider trimming the two quieter personas (keep SE rich) and re-measure.`;
  console.log(`  Verdict: ${verdict}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
