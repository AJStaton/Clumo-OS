// Tests for server/routes/api.js — REST endpoints (no real AI calls).

const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const request = require('supertest');

function freshDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clumo-api-test-'));
  process.env.CLUMO_TEST_DATA_DIR = dir;
  // Bust caches so all modules reinitialize against the new DATA_DIR
  for (const m of ['../../db.js', '../../storage.js', '../../ai-provider.js', '../../routes/api.js']) {
    try { delete require.cache[require.resolve(m)]; } catch {}
  }
  return dir;
}

function buildApp() {
  const apiRoutes = require('../../routes/api.js');
  apiRoutes.injectSessionMaps(() => new Map(), () => new Map());
  const app = express();
  app.use(express.json());
  app.use(apiRoutes);
  return app;
}

describe('GET /api/status', () => {
  let dir;
  let app;

  beforeEach(() => {
    dir = freshDataDir();
    app = buildApp();
  });

  afterEach(() => {
    try { require('../../db.js').close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns fresh state with all flags false', async () => {
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      setupComplete: false,
      onboardingComplete: false,
      hasKnowledgeBase: false,
      isProcessing: false
    });
  });

  it('reflects setup complete after provider configured', async () => {
    require('../../db.js').setConfig('ai_provider', 'openai');
    const res = await request(app).get('/api/status');
    expect(res.body.setupComplete).toBe(true);
  });
});

describe('GET /api/settings', () => {
  let dir;
  let app;
  let db;

  beforeEach(() => {
    dir = freshDataDir();
    app = buildApp();
    db = require('../../db.js');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns configured: false when nothing set', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.body).toMatchObject({ configured: false, providerMode: 'byok' });
    expect(Array.isArray(res.body.azureApiVersionSupport?.chatEmbeddings)).toBe(true);
  });

  it('returns Azure config without exposing the api key', async () => {
    require('../../ai-provider.js').saveProviderConfig('azure', {
      endpoint: 'https://x.openai.azure.com',
      apiKey: 'super-secret',
      chatDeployment: 'gpt4',
      realtimeDeployment: 'rt',
      embeddingDeployment: 'emb'
    });
    const res = await request(app).get('/api/settings');
    expect(res.body).toMatchObject({
      configured: true,
      provider: 'azure',
      endpoint: 'https://x.openai.azure.com',
      apiVersion: '2024-10-21',
      chatDeployment: 'gpt4',
      hasApiKey: true
    });
    expect(res.body.apiKey).toBeUndefined();
  });

  it('returns OpenAI config without exposing the api key', async () => {
    require('../../ai-provider.js').saveProviderConfig('openai', {
      apiKey: 'sk-test',
      chatModel: 'gpt-4o'
    });
    const res = await request(app).get('/api/settings');
    expect(res.body).toMatchObject({
      configured: true,
      provider: 'openai',
      chatModel: 'gpt-4o',
      hasApiKey: true
    });
    expect(res.body.apiKey).toBeUndefined();
  });
});

describe('POST /api/settings', () => {
  let dir;
  let app;

  beforeEach(() => {
    dir = freshDataDir();
    app = buildApp();
  });

  afterEach(() => {
    try { require('../../db.js').close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects unknown provider', async () => {
    const res = await request(app).post('/api/settings').send({ provider: 'gibberish' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid provider/);
  });

  it('rejects Azure without required fields', async () => {
    const res = await request(app).post('/api/settings').send({
      provider: 'azure',
      endpoint: 'https://x',
      apiKey: 'k'
      // missing deployments
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Azure requires/);
  });

  it('rejects OpenAI without api key when none on record', async () => {
    const res = await request(app).post('/api/settings').send({ provider: 'openai' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/OpenAI requires/);
  });

  it('saves Azure config', async () => {
    const res = await request(app).post('/api/settings').send({
      provider: 'azure',
      endpoint: 'https://x.openai.azure.com',
      apiKey: 'k',
      apiVersion: '2025-04-01-preview',
      chatDeployment: 'gpt4',
      realtimeDeployment: 'rt',
      embeddingDeployment: 'emb'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects malformed Azure apiVersion', async () => {
    const res = await request(app).post('/api/settings').send({
      provider: 'azure',
      endpoint: 'https://x.openai.azure.com',
      apiKey: 'k',
      apiVersion: 'vNext',
      chatDeployment: 'gpt4',
      embeddingDeployment: 'emb'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid Azure API version format/i);
  });
});

describe('GET /api/preferences', () => {
  let dir;
  let app;

  beforeEach(() => {
    dir = freshDataDir();
    app = buildApp();
  });

  afterEach(() => {
    try { require('../../db.js').close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns defaults when unset', async () => {
    const res = await request(app).get('/api/preferences');
    expect(res.body).toEqual({ methodology: 'meddpicc', theme: 'system' });
  });
});

describe('PATCH /api/preferences', () => {
  let dir;
  let app;

  beforeEach(() => {
    dir = freshDataDir();
    app = buildApp();
  });

  afterEach(() => {
    try { require('../../db.js').close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('accepts valid methodology + theme', async () => {
    const res = await request(app).patch('/api/preferences').send({
      methodology: 'bant',
      theme: 'dark'
    });
    expect(res.body).toEqual({ methodology: 'bant', theme: 'dark' });
  });

  it('ignores invalid theme value', async () => {
    const res = await request(app).patch('/api/preferences').send({ theme: 'rainbow' });
    expect(res.body.theme).toBe('system'); // default preserved
  });

  it('ignores invalid methodology value', async () => {
    const res = await request(app).patch('/api/preferences').send({ methodology: 'spin' });
    expect(res.body.methodology).toBe('meddpicc');
  });
});

describe('GET /api/onboarding/knowledge-base', () => {
  let dir;
  let app;

  beforeEach(() => {
    dir = freshDataDir();
    app = buildApp();
  });

  afterEach(() => {
    try { require('../../db.js').close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns 404 when no KB exists', async () => {
    const res = await request(app).get('/api/onboarding/knowledge-base');
    expect(res.status).toBe(404);
  });

  it('returns the KB once saved', async () => {
    const storage = require('../../storage.js');
    storage.saveKB({ items: [{ id: '1' }] });
    const res = await request(app).get('/api/onboarding/knowledge-base');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });
});

describe('Playbook endpoints', () => {
  let dir;
  let app;
  let storage;

  const KB = {
    profile: { role: 'Solution Engineer', focusProducts: ['Fabric'], personas: ['CISO'], competitors: ['Snowflake'] },
    companyProfile: {
      companyName: 'Contoso',
      productDescription: 'Data + AI platform.',
      painPointsSolved: ['slow pipelines'],
      differentiators: ['native governance'],
      keyStats: ['40% cost cut at Acme']
    }
  };

  beforeEach(() => {
    dir = freshDataDir();
    app = buildApp();
    storage = require('../../storage.js');
  });

  afterEach(() => {
    try { require('../../db.js').close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('GET returns 404 when no knowledge base exists', async () => {
    const res = await request(app).get('/api/playbook');
    expect(res.status).toBe(404);
  });

  it('GET returns an assembled draft from the KB when none is saved', async () => {
    storage.saveKB(KB);
    const res = await request(app).get('/api/playbook');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('draft');
    expect(res.body.role).toBe('Solution Engineer');
    expect(res.body.company).toEqual({ name: 'Contoso', description: 'Data + AI platform.' });
    expect(res.body.competitorTraps).toEqual([{ competitor: 'Snowflake', question: '' }]);
    // A draft is not persisted until saved.
    expect(storage.hasPlaybook()).toBe(false);
  });

  it('PUT normalises and persists an edited playbook', async () => {
    storage.saveKB(KB);
    const res = await request(app).put('/api/playbook').send({
      role: '  Solution Engineer  ',
      company: { name: 'Contoso', description: '' },
      products: ['Fabric', 'fabric'],
      competitors: ['Snowflake'],
      competitorTraps: [{ competitor: 'Snowflake', question: 'How do you govern models?' }]
    });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Solution Engineer');
    expect(res.body.products).toEqual(['Fabric']);
    expect(res.body.source).toBe('edited');
    // GET now returns the saved (edited) playbook, not a fresh draft.
    const get = await request(app).get('/api/playbook');
    expect(get.body.source).toBe('edited');
    expect(get.body.competitorTraps[0].question).toBe('How do you govern models?');
  });

  it('POST /regenerate rebuilds from the KB and discards edits', async () => {
    storage.saveKB(KB);
    await request(app).put('/api/playbook').send({ role: 'Edited role' });
    const res = await request(app).post('/api/playbook/regenerate');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('draft');
    expect(res.body.role).toBe('Solution Engineer');
  });

  it('deleting the knowledge base also clears the playbook', async () => {
    storage.saveKB(KB);
    await request(app).put('/api/playbook').send({ role: 'SE' });
    expect(storage.hasPlaybook()).toBe(true);
    const del = await request(app).delete('/api/onboarding/knowledge-base');
    expect(del.status).toBe(200);
    expect(storage.hasPlaybook()).toBe(false);
  });
});

describe('Coaching style + preview endpoints', () => {
  let dir;
  let app;

  beforeEach(() => {
    dir = freshDataDir();
    app = buildApp();
  });

  afterEach(() => {
    try { require('../../db.js').close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('GET returns the default style until one is saved', async () => {
    const { DEFAULT_STYLE } = require('../../coaching-style');
    const res = await request(app).get('/api/coaching-style');
    expect(res.status).toBe(200);
    expect(res.body.style).toBe(DEFAULT_STYLE);
    expect(res.body.rendered).toContain("REP'S COACHING PREFERENCES");
    expect(res.body.rendered).toContain('consultative and value lead');
  });

  it('GET honours an explicitly cleared (empty) style over the default', async () => {
    await request(app).put('/api/coaching-style').send({ style: '' });
    const res = await request(app).get('/api/coaching-style');
    expect(res.body.style).toBe('');
    expect(res.body.rendered).toBe('');
  });

  it('PUT persists a capped style and renders the injected block', async () => {
    const put = await request(app).put('/api/coaching-style').send({ style: '  Be direct.  ' });
    expect(put.status).toBe(200);
    expect(put.body.style).toBe('Be direct.');
    expect(put.body.rendered).toContain("REP'S COACHING PREFERENCES");
    expect(put.body.rendered).toContain('Be direct.');

    const get = await request(app).get('/api/coaching-style');
    expect(get.body.style).toBe('Be direct.');
  });

  it('PUT caps style length at the module limit', async () => {
    const long = 'x'.repeat(5000);
    const res = await request(app).put('/api/coaching-style').send({ style: long });
    expect(res.status).toBe(200);
    expect(res.body.style.length).toBe(1500);
  });

  it('POST /api/coach/preview composes playbook (both lanes) + style (slow lane only)', async () => {
    const res = await request(app).post('/api/coach/preview').send({
      playbook: { role: 'SE', company: { name: 'Contoso', description: 'Data + AI.' } },
      style: 'Never discount.'
    });
    expect(res.status).toBe(200);
    expect(res.body.playbookBlock).toContain('Contoso');
    expect(res.body.styleBlock).toContain('Never discount.');
    // Hot lane gets playbook but NOT the style block; slow lane gets both.
    expect(res.body.hotLane).toContain('Contoso');
    expect(res.body.hotLane).not.toContain('Never discount.');
    expect(res.body.slowLane).toContain('Contoso');
    expect(res.body.slowLane).toContain('Never discount.');
  });

  it('POST /api/coach/preview returns empty blocks for empty input', async () => {
    const res = await request(app).post('/api/coach/preview').send({ playbook: {}, style: '' });
    expect(res.status).toBe(200);
    expect(res.body.playbookBlock).toBe('');
    expect(res.body.styleBlock).toBe('');
  });
});

describe('Session endpoints', () => {
  let dir;
  let app;
  let db;
  let storage;

  beforeEach(() => {
    dir = freshDataDir();
    app = buildApp();
    db = require('../../db.js');
    storage = require('../../storage.js');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/sessions returns empty list initially', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.body).toEqual([]);
  });

  it('GET /api/sessions returns fallback names for unnamed completed sessions', async () => {
    db.createSession('s1');
    db.completeSession('s1', 0);
    storage.saveSession('s1', { startTime: new Date('2025-07-13T10:00:00Z').toISOString(), fullTranscript: [] });
    const res = await request(app).get('/api/sessions');
    const row = res.body.find(s => s.sessionId === 's1');
    expect(row.name).toMatch(/^Live sales call \d{2}\/\d{2}$/);
  });

  it('GET /api/session/:id returns 404 for missing', async () => {
    const res = await request(app).get('/api/session/missing');
    expect(res.status).toBe(404);
  });

  it('GET /api/session/:id includes fallback name when missing in DB', async () => {
    db.createSession('s2');
    db.completeSession('s2', 0);
    storage.saveSession('s2', { startTime: new Date('2025-07-13T10:00:00Z').toISOString(), fullTranscript: [] });
    const res = await request(app).get('/api/session/s2');
    expect(res.status).toBe(200);
    expect(res.body.name).toMatch(/^Live sales call \d{2}\/\d{2}$/);
  });

  it('GET /api/session/:id/export includes transcript (regression: F-13)', async () => {
    db.createSession('s1', 'Test');
    storage.saveSession('s1', {
      fullTranscript: [{ text: 'hello world', timestamp: new Date().toISOString() }],
      suggestions: [],
      analysis: null
    });
    const res = await request(app).get('/api/session/s1/export');
    expect(res.status).toBe(200);
    expect(res.body.transcript).toHaveLength(1);
    expect(res.body.transcript[0].text).toBe('hello world');
  });

  it('GET /api/session/:id/export sets Content-Disposition with sanitized name', async () => {
    db.createSession('s1', 'Bad\r\n"Name');
    storage.saveSession('s1', { fullTranscript: [], suggestions: [] });
    const res = await request(app).get('/api/session/s1/export');
    const cd = res.headers['content-disposition'];
    expect(cd).toMatch(/^attachment; filename=".*\.json"$/);
    // Inner filename (between the wrapping quotes) must not contain CR, LF, backslash, or inner quotes
    const inner = cd.replace(/^attachment; filename="(.+)\.json"$/, '$1');
    expect(inner).not.toContain('"');
    expect(inner).not.toContain('\r');
    expect(inner).not.toContain('\n');
    expect(inner).not.toContain('\\');
  });

  it('PATCH /api/session/:id/rename rejects empty name', async () => {
    db.createSession('s1');
    const res = await request(app).patch('/api/session/s1/rename').send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/session/:id/rename trims and persists', async () => {
    db.createSession('s1');
    const res = await request(app).patch('/api/session/s1/rename').send({ name: '  New name  ' });
    expect(res.status).toBe(200);
    expect(db.getSession('s1').name).toBe('New name');
  });

  it('DELETE /api/session/:id removes db + storage', async () => {
    db.createSession('s1');
    storage.saveSession('s1', { fullTranscript: [] });
    const res = await request(app).delete('/api/session/s1');
    expect(res.status).toBe(200);
    expect(db.getSession('s1')).toBeUndefined();
    expect(storage.loadSession('s1')).toBeNull();
  });
});
