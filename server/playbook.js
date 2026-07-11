// Sales Playbook for Clumo coaching.
//
// The playbook is the rep's "who I am and how I win" context: role, company,
// products, buyer personas, the outcomes they deliver, why customers choose them,
// a small proof arsenal, and per-competitor traps. It is ASSEMBLED from data the
// onboarding process already captured (the seller profile + the LLM company
// analysis), then VALIDATED and EDITED by the rep, and finally rendered into a
// compact block that grounds every coaching nudge in the rep's real world.
//
// Design notes:
//  - Assembly is pure and deterministic (no LLM) so it is fast and testable, and
//    so the rep always sees where each field came from and can correct it.
//  - Competitor "traps" are seeded empty (one per known competitor) rather than
//    invented — the coach only uses a trap the rep actually filled in, so it never
//    fabricates a weakness.
//  - renderPlaybook() emits ONLY the sections that have content, so an empty or
//    partial playbook costs nothing and never pads the prompt with blanks.

// Bounds so a hand-edited playbook can never bloat the coaching prompt.
const MAX_STR = 500;      // per free-text field / list item
const MAX_LIST = 12;      // items per list
const MAX_TRAPS = 12;     // competitor traps

function s(v) {
  return typeof v === 'string' ? v.trim().slice(0, MAX_STR) : '';
}

// Clean a string list: coerce, trim, drop empties, de-dupe (case-insensitive), cap.
function list(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const item of v) {
    const t = s(item);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_LIST) break;
  }
  return out;
}

// Merge several lists into one, de-duped and capped (used to build outcomes/proof).
function mergeLists(...lists) {
  return list(lists.flat());
}

function emptyPlaybook() {
  return {
    role: '',
    company: { name: '', description: '' },
    products: [],
    personas: [],
    outcomes: [],
    differentiators: [],
    competitors: [],
    proofPoints: [],
    competitorTraps: [],
    updatedAt: null,
    source: 'draft'
  };
}

// Assemble a draft playbook from the two things onboarding already produced:
//  - profile: the seller's onboarding answers (role, focusProducts, personas, competitors, ...)
//  - companyProfile: the LLM company analysis stored on the knowledge base.
// The result is a DRAFT the rep is expected to review and edit.
function assemblePlaybook(profile = {}, companyProfile = {}) {
  const p = profile || {};
  const cp = companyProfile || {};

  const competitors = mergeLists(p.competitors, cp.competitors);

  return {
    role: s(p.role),
    company: {
      name: s(cp.companyName),
      description: s(cp.productDescription)
    },
    products: list(p.focusProducts),
    personas: list(p.personas),
    // What we deliver for clients = the pains we solve + our value props.
    outcomes: mergeLists(cp.painPointsSolved, cp.valuePropositions),
    // Why customers choose us.
    differentiators: list(cp.differentiators),
    competitors,
    // Proof arsenal = concrete stats + named customer stories, to cite (never invent).
    proofPoints: mergeLists(cp.keyStats, cp.customerStories),
    // Seed one empty trap per known competitor for the rep to fill with a real
    // question that exposes that competitor's weakness. Empty ones are ignored.
    competitorTraps: competitors.slice(0, MAX_TRAPS).map(c => ({ competitor: c, question: '' })),
    updatedAt: null,
    source: 'draft'
  };
}

// Validate + sanitise an incoming (hand-edited) playbook before saving. Never
// trusts client shape: coerces every field, drops junk, and caps sizes.
function normalizePlaybook(input = {}, { source = 'edited' } = {}) {
  const i = input || {};
  const company = i.company && typeof i.company === 'object' ? i.company : {};
  const traps = Array.isArray(i.competitorTraps) ? i.competitorTraps : [];

  const competitorTraps = [];
  const seenTrap = new Set();
  for (const t of traps) {
    if (!t || typeof t !== 'object') continue;
    const competitor = s(t.competitor);
    if (!competitor) continue;
    const key = competitor.toLowerCase();
    if (seenTrap.has(key)) continue;
    seenTrap.add(key);
    competitorTraps.push({ competitor, question: s(t.question) });
    if (competitorTraps.length >= MAX_TRAPS) break;
  }

  return {
    role: s(i.role),
    company: { name: s(company.name), description: s(company.description) },
    products: list(i.products),
    personas: list(i.personas),
    outcomes: list(i.outcomes),
    differentiators: list(i.differentiators),
    competitors: list(i.competitors),
    proofPoints: list(i.proofPoints),
    competitorTraps,
    updatedAt: new Date().toISOString(),
    source: source === 'draft' ? 'draft' : 'edited'
  };
}

// True when the playbook carries no usable content (so the coach skips it entirely).
function isEmptyPlaybook(pb) {
  if (!pb || typeof pb !== 'object') return true;
  const c = pb.company || {};
  return !s(pb.role)
    && !s(c.name) && !s(c.description)
    && !list(pb.products).length
    && !list(pb.personas).length
    && !list(pb.outcomes).length
    && !list(pb.differentiators).length
    && !list(pb.competitors).length
    && !list(pb.proofPoints).length
    && !(Array.isArray(pb.competitorTraps) && pb.competitorTraps.some(t => t && s(t.competitor)));
}

// Render the playbook as a compact prompt block for the coach. Emits ONLY the
// sections that have content. Returns '' when there is nothing useful to add.
function renderPlaybook(pb) {
  if (isEmptyPlaybook(pb)) return '';
  const c = pb.company || {};
  const lines = [];

  if (s(pb.role)) lines.push(`- Rep's role: ${s(pb.role)}`);
  if (s(c.name) || s(c.description)) {
    const name = s(c.name);
    const desc = s(c.description);
    lines.push(`- Company: ${[name, desc].filter(Boolean).join(' — ')}`);
  }
  if (list(pb.products).length) lines.push(`- Products they sell: ${list(pb.products).join(', ')}`);
  if (list(pb.personas).length) lines.push(`- Buyer personas they engage: ${list(pb.personas).join(', ')}`);
  if (list(pb.outcomes).length) lines.push(`- Outcomes we deliver for clients: ${list(pb.outcomes).join('; ')}`);
  if (list(pb.differentiators).length) lines.push(`- Why customers choose us (differentiators): ${list(pb.differentiators).join('; ')}`);
  if (list(pb.proofPoints).length) lines.push(`- Proof to cite (ONLY if relevant — never invent proof not listed here): ${list(pb.proofPoints).join('; ')}`);

  const traps = (Array.isArray(pb.competitorTraps) ? pb.competitorTraps : [])
    .filter(t => t && s(t.competitor) && s(t.question))
    .map(t => `  * ${s(t.competitor)} — ${s(t.question)}`);
  if (traps.length) {
    lines.push('- Competitors & where they are weak (use the matching trap when that competitor comes up):');
    lines.push(...traps);
  } else if (list(pb.competitors).length) {
    lines.push(`- Competitors to differentiate against: ${list(pb.competitors).join(', ')}`);
  }

  return `PLAYBOOK — who this rep is and how they win. Make every nudge specific to THIS rep's product, market and competitors. Ground SE/AE steers in the differentiators and outcomes below, and cite proof only from this list:
${lines.join('\n')}`;
}

module.exports = {
  emptyPlaybook,
  assemblePlaybook,
  normalizePlaybook,
  isEmptyPlaybook,
  renderPlaybook
};
