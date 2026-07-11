// REST API routes for Clumo
// Handles onboarding, sessions, knowledge base, and settings

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const db = require('../db');
const storage = require('../storage');
const playbook = require('../playbook');
const coachingStyle = require('../coaching-style');
const { loadProvider, loadEmbeddingProvider, saveProviderConfig } = require('../ai-provider');
const { getKnowledgeBase } = require('../knowledge-base');
const { collectSources } = require('../onboarding/source-collector');
const { scanSite } = require('../onboarding/site-scanner');
const DocumentParser = require('../document-parser');
const KnowledgeGenerator = require('../knowledge-generator');
const { generateAnalysis, formatSessionName } = require('../analysis');
const crm = require('../crm-provider');

const router = express.Router();

// File upload config
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Accept only when BOTH the extension and the declared MIME type are allowed.
    // Extension alone is trivially spoofable (rename evil.exe -> evil.pdf); requiring a
    // matching MIME raises the bar. Full magic-byte sniffing is out of scope for a
    // local single-user upload.
    const allowedExt = ['.pdf', '.pptx', '.md', '.txt', '.png', '.jpg', '.jpeg', '.docx'];
    const allowedMime = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/markdown',
      'text/x-markdown',
      'text/plain',
      'application/octet-stream', // some OSes send this for .md/.docx
      'image/png',
      'image/jpeg',
    ]);
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    cb(null, allowedExt.includes(ext) && allowedMime.has(mime));
  }
});

// SSE state for onboarding progress
const pendingJobs = new Map();
let activeStream = null; // single user, only one stream at a time

function createSseToken(jobConfig) {
  const token = crypto.randomBytes(32).toString('hex');
  pendingJobs.set(token, { config: jobConfig, createdAt: Date.now() });
  setTimeout(() => pendingJobs.delete(token), 30 * 1000);
  return token;
}

// ============================================
// SETUP & CONFIG
// ============================================

// App status (is setup complete? is KB ready?)
router.get('/api/status', (req, res) => {
  res.json({
    setupComplete: db.isSetupComplete(),
    onboardingComplete: db.isOnboardingComplete(),
    hasKnowledgeBase: storage.hasKB(),
    isProcessing: !!activeStream
  });
});

// Get current settings (provider type, non-secret config)
router.get('/api/settings', (req, res) => {
  const provider = db.getConfig('ai_provider');

  if (!provider) {
    return res.json({ configured: false, providerMode: 'byok' });
  }

  const settings = { configured: true, providerMode: 'byok', provider };

  if (provider === 'azure') {
    settings.endpoint = db.getConfig('azure_endpoint');
    settings.apiVersion = db.getConfig('azure_api_version');
    settings.chatDeployment = db.getConfig('azure_chat_deployment');
    settings.realtimeDeployment = db.getConfig('azure_realtime_deployment');
    settings.transcriptionDeployment = db.getConfig('transcription_model');
    settings.embeddingDeployment = db.getConfig('azure_embedding_deployment');
    settings.hasApiKey = !!db.getSecureConfig('azure_api_key');
  } else if (provider === 'openai') {
    settings.chatModel = db.getConfig('openai_chat_model');
    settings.realtimeModel = db.getConfig('openai_realtime_model');
    settings.hasApiKey = !!db.getSecureConfig('openai_api_key');
  }

  res.json(settings);
});

// Save settings (API keys + provider config)
router.post('/api/settings', async (req, res) => {
  const { provider, ...config } = req.body;

  // BYOK mode (the only mode)
  db.setConfig('provider_mode', 'byok');

  const existingAzureApiKey = db.getSecureConfig('azure_api_key');
  const existingOpenAiApiKey = db.getSecureConfig('openai_api_key');

  if (!provider || !['azure', 'openai'].includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider. Must be "azure" or "openai".' });
  }

  if (provider === 'azure') {
    if (!config.endpoint || !config.chatDeployment || !config.embeddingDeployment) {
      return res.status(400).json({ error: 'Azure requires: endpoint, apiKey, chatDeployment, embeddingDeployment' });
    }
    if (!config.apiKey && !existingAzureApiKey) {
      return res.status(400).json({ error: 'Azure requires: apiKey' });
    }
  } else if (provider === 'openai') {
    if (!config.apiKey && !existingOpenAiApiKey) {
      return res.status(400).json({ error: 'OpenAI requires: apiKey' });
    }
  }

  saveProviderConfig(provider, config);
  res.json({ success: true });
});

// Test API key connectivity
router.post('/api/settings/test', async (req, res) => {
  try {
    const provider = loadProvider();
    if (!provider) {
      return res.status(400).json({ valid: false, error: 'No AI provider configured' });
    }

    const result = await provider.validateConfig();
    res.json(result);
  } catch (e) {
    console.error('[Server] Test connection error:', e);
    res.status(500).json({ valid: false, error: e.message || 'Connection test failed' });
  }
});

// ============================================
// ONBOARDING (KB generation)
// ============================================

// Upload documents
router.post('/api/onboarding/upload', upload.array('documents', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const files = req.files.map(f => ({
    id: f.filename,
    originalName: f.originalname,
    path: f.path,
    size: f.size
  }));

  res.json({ files });
});

// Start onboarding pipeline
router.post('/api/onboarding/start', (req, res) => {
  const { websiteUrl, uploadedFiles, sourceUrls, profile, priorities } = req.body;

  if (!websiteUrl && (!uploadedFiles || uploadedFiles.length === 0)) {
    return res.status(400).json({ error: 'Please provide a website URL or upload documents' });
  }

  if (activeStream) {
    return res.status(409).json({ error: 'Onboarding is already in progress' });
  }

  const sseToken = createSseToken({ websiteUrl, uploadedFiles, sourceUrls, profile, priorities, merge: false });
  res.json({ sseToken });
});

// Preliminary scan: detect the products/solutions a site offers and where its case-study,
// docs, and blog hubs live, so the wizard can ask the user what to prioritise. Discovery-only
// (no per-page LLM), so it returns quickly.
router.post('/api/onboarding/scan', async (req, res) => {
  const websiteUrl = req.body && req.body.websiteUrl ? String(req.body.websiteUrl).trim() : null;
  if (!websiteUrl) {
    return res.status(400).json({ error: 'Please provide a website URL' });
  }
  try {
    const scan = await scanSite(websiteUrl);
    res.json(scan);
  } catch (err) {
    console.error('[API] Site scan failed:', err.message);
    res.status(200).json({ products: [], solutions: [], hubs: {}, error: 'scan_failed' });
  }
});

// Add documents (merge mode)
router.post('/api/onboarding/add-documents', (req, res, next) => {
  upload.array('documents', 20)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, (req, res) => {
  const websiteUrl = req.body && req.body.websiteUrl ? req.body.websiteUrl.trim() : null;
  const hasFiles = req.files && req.files.length > 0;

  if (!hasFiles && !websiteUrl) {
    return res.status(400).json({ error: 'No files or URL provided' });
  }

  if (activeStream) {
    return res.status(409).json({ error: 'Processing is already in progress' });
  }

  const uploadedFiles = hasFiles ? req.files.map(f => ({
    id: f.filename,
    originalName: f.originalname,
    path: f.path,
    size: f.size
  })) : [];

  // sourceUrls / profile / priorities may arrive as JSON strings in the multipart body.
  let sourceUrls = null;
  let profile = null;
  let priorities = null;
  try { if (req.body.sourceUrls) sourceUrls = JSON.parse(req.body.sourceUrls); } catch { /* ignore */ }
  try { if (req.body.profile) profile = JSON.parse(req.body.profile); } catch { /* ignore */ }
  try { if (req.body.priorities) priorities = JSON.parse(req.body.priorities); } catch { /* ignore */ }

  const sseToken = createSseToken({ websiteUrl, uploadedFiles, sourceUrls, profile, priorities, merge: true });
  res.json({ sseToken });
});

// SSE stream — runs the onboarding pipeline
router.get('/api/onboarding/stream', async (req, res) => {
  const token = req.query.token;
  if (!token || !pendingJobs.has(token)) {
    return res.status(401).json({ error: 'Invalid or expired stream token' });
  }

  const job = pendingJobs.get(token);
  pendingJobs.delete(token);
  const { websiteUrl, uploadedFiles, sourceUrls, profile, priorities, merge } = job.config;

  const embeddingProvider = loadEmbeddingProvider();

  const provider = loadProvider();
  if (!provider) {
    return res.status(400).json({ error: 'AI provider not configured. Complete setup first.' });
  }

  const openaiClient = provider.getClient();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  activeStream = res;

  function sendEvent(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const keepAlive = setInterval(() => res.write(':keepalive\n\n'), 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    activeStream = null;
  });

  try {
    const maxCaseStudies = parseInt(db.getConfig('max_case_studies') || '50', 10);
    // Quality-dependent volume ceilings for the LLM-generated knowledge types (config-tunable).
    const targets = {
      discoveryQuestions: parseInt(db.getConfig('max_discovery_questions') || '100', 10),
      proofPoints: parseInt(db.getConfig('max_proof_points') || '50', 10),
      productTruths: parseInt(db.getConfig('max_product_truths') || '100', 10),
      caseStudies: parseInt(db.getConfig('max_case_studies_inferred') || '30', 10)
    };
    // Wrap the client to always include model (required by Azure AI Model Inference API)
    const chatModel = provider.chatModel || provider.chatDeployment || 'gpt-4o-mini';
    const wrappedClient = {
      chat: {
        completions: {
          create: (params) => openaiClient.chat.completions.create({ model: chatModel, ...params })
        }
      }
    };
    const parser = new DocumentParser(wrappedClient);
    const generator = new KnowledgeGenerator(provider, embeddingProvider);

    let sources = null;
    let documentContents = [];

    // Step 1: Discover + fetch + route sources via the tiered pipeline
    if (websiteUrl) {
      sendEvent('progress', { stage: 'scraping', message: 'Scanning your website...' });
      const pastedSources = {
        caseStudies: (sourceUrls && sourceUrls.caseStudies) || [],
        blog: (sourceUrls && sourceUrls.blog) || [],
        docs: (sourceUrls && sourceUrls.docs) || []
      };
      const effectivePriorities = (Array.isArray(priorities) && priorities.length)
        ? priorities
        : ((profile && Array.isArray(profile.priorities)) ? profile.priorities : []);
      sources = await collectSources(websiteUrl, {
        openaiClient: wrappedClient,
        pastedSources,
        profile: profile || null,
        priorities: effectivePriorities,
        maxCaseStudies,
        onProgress: (p) => sendEvent('progress', { stage: p.stage || 'scraping', message: p.message })
      });
      const cs = sources.telemetry && sources.telemetry.buckets ? sources.telemetry.buckets.case_study : 0;
      console.log(`[API] Source collection complete: ${sources.extractedCaseStudies.length} case studies (${cs} candidate URLs)`);
    }

    // Step 2: Parse documents
    if (uploadedFiles && uploadedFiles.length > 0) {
      sendEvent('progress', { stage: 'parsing', message: 'Analyzing your documents...' });

      const filesToParse = uploadedFiles.map(f => ({
        path: merge ? f.path : path.join(uploadsDir, f.id),
        originalname: f.originalName
      }));

      const parseResult = await parser.parseFiles(filesToParse);
      documentContents = parseResult.results;

      // Clean up uploaded files
      for (const f of uploadedFiles) {
        const filePath = merge ? f.path : path.join(uploadsDir, f.id);
        try { fs.unlinkSync(filePath); } catch (e) { console.warn(`[API] Failed to clean up uploaded file ${filePath}:`, e.message); }
      }
    }

    // Step 3: Generate knowledge base (single-user, no user scoping needed)
    const result = await generator.generate(null, documentContents, (progress) => {
      sendEvent('progress', {
        stage: progress.stage,
        message: progress.message,
        counts: progress.counts || null
      });
    }, { merge, userId: 'local', sources, profile: profile || null, targets });

    db.setConfig('onboarding_complete', 'true');

    // Assemble a draft coaching playbook from what we just learned (seller profile
    // + company analysis), unless the rep already has one — a merge/add-content run
    // must not clobber their edits. A full re-onboarding clears the playbook first.
    try {
      if (!storage.hasPlaybook()) {
        const kb = storage.loadKB();
        if (kb) {
          storage.savePlaybook(playbook.assemblePlaybook(kb.profile || profile || {}, kb.companyProfile || {}));
        }
      }
    } catch (e) {
      console.warn('[API] Failed to assemble playbook:', e.message);
    }

    sendEvent('complete', {
      counts: result.counts,
      coverage: result.coverage || null,
      typePaths: result.typePaths || null
    });
  } catch (error) {
    console.error('Onboarding pipeline error:', error);
    sendEvent('error', { message: error.message || 'An error occurred during onboarding' });
  } finally {
    clearInterval(keepAlive);
    activeStream = null;
    res.end();
  }
});

// Get the knowledge base
router.get('/api/onboarding/knowledge-base', (req, res) => {
  const kb = storage.loadKB();
  if (kb) {
    res.json(kb);
  } else {
    res.status(404).json({ error: 'No knowledge base generated yet' });
  }
});

// Delete the knowledge base (reset for re-onboarding)
router.delete('/api/onboarding/knowledge-base', (req, res) => {
  try {
    storage.deleteKB();
    storage.deletePlaybook();
    db.setConfig('onboarding_complete', 'false');
    res.json({ success: true });
  } catch (e) {
    console.error('[API] Failed to delete KB:', e.message);
    res.status(500).json({ error: 'Failed to delete knowledge base' });
  }
});

// ============================================
// PLAYBOOK
// ============================================

// Get the coaching playbook. Returns the saved (possibly edited) playbook, or an
// on-the-fly DRAFT assembled from the knowledge base when none is saved yet, so
// the editor always has something to show once onboarding has run.
router.get('/api/playbook', (req, res) => {
  const saved = storage.loadPlaybook();
  if (saved) return res.json(saved);
  const kb = storage.loadKB();
  if (!kb) return res.status(404).json({ error: 'No knowledge base generated yet' });
  return res.json(playbook.assemblePlaybook(kb.profile || {}, kb.companyProfile || {}));
});

// Save an edited playbook. The body is validated + sanitised server-side; the
// client shape is never trusted.
router.put('/api/playbook', (req, res) => {
  try {
    const normalized = playbook.normalizePlaybook(req.body || {});
    storage.savePlaybook(normalized);
    res.json(normalized);
  } catch (e) {
    console.error('[API] Failed to save playbook:', e.message);
    res.status(500).json({ error: 'Failed to save playbook' });
  }
});

// Re-assemble the playbook from the current knowledge base, discarding edits.
router.post('/api/playbook/regenerate', (req, res) => {
  const kb = storage.loadKB();
  if (!kb) return res.status(404).json({ error: 'No knowledge base to regenerate from' });
  const draft = playbook.assemblePlaybook(kb.profile || {}, kb.companyProfile || {});
  storage.savePlaybook(draft);
  res.json(draft);
});

// ============================================
// COACHING STYLE (slow-lane "how to coach me" preferences)
// ============================================

// Get the rep's coaching-style text plus the exact block that will be injected
// into the slow (strategic) coaching lane, so the editor preview is server-truthful.
router.get('/api/coaching-style', (req, res) => {
  const style = coachingStyle.resolveStyle(db.getConfig('coaching_style'));
  res.json({ style, rendered: coachingStyle.renderCoachingStyle(style) });
});

// Save the coaching-style text. Validated + capped server-side; never trusts the
// client shape. Returns the normalised text and its rendered block.
router.put('/api/coaching-style', (req, res) => {
  try {
    const style = coachingStyle.normalizeStyle((req.body || {}).style);
    db.setConfig('coaching_style', style);
    res.json({ style, rendered: coachingStyle.renderCoachingStyle(style) });
  } catch (e) {
    console.error('[API] Failed to save coaching style:', e.message);
    res.status(500).json({ error: 'Failed to save coaching style' });
  }
});

// Live preview of the composed Coach context from the CURRENT (possibly unsaved)
// form state. Runs the same pure renderers used by the coaching engine so the
// preview matches exactly what gets injected, without persisting anything.
router.post('/api/coach/preview', (req, res) => {
  const body = req.body || {};
  const playbookBlock = playbook.renderPlaybook(playbook.normalizePlaybook(body.playbook || {}));
  const styleBlock = coachingStyle.renderCoachingStyle(body.style);
  res.json({
    playbookBlock,
    styleBlock,
    // Both lanes get the playbook; only the slow lane gets the style block.
    hotLane: [playbookBlock].filter(Boolean).join('\n\n'),
    slowLane: [playbookBlock, styleBlock].filter(Boolean).join('\n\n')
  });
});

// ============================================
// SESSIONS
// ============================================

// These need access to the active/completed session maps, which are managed
// by the WebSocket handler. We expose a way to inject them.
let getActiveSessions = () => new Map();
let getCompletedSessions = () => new Map();

router.injectSessionMaps = function(activeFn, completedFn) {
  getActiveSessions = activeFn;
  getCompletedSessions = completedFn;
};

// List all sessions
router.get('/api/sessions', (req, res) => {
  const sessions = [];

  // Active sessions (in-memory)
  getActiveSessions().forEach((engine, id) => {
    const history = engine.getSessionHistory();
    sessions.push({
      sessionId: id,
      status: 'active',
      startTime: history.startTime,
      totalSuggestions: history.totalSuggestions
    });
  });

  // DB sessions (completed)
  const dbSessions = db.listSessions();
  for (const s of dbSessions) {
    if (s.status === 'completed') {
      const sessionData = storage.loadSession(s.id);
      sessions.push({
        sessionId: s.id,
        status: 'completed',
        name: s.name,
        startTime: s.start_time,
        endTime: s.end_time,
        suggestionCount: s.suggestion_count,
        hasAnalysis: !!(sessionData && sessionData.analysis)
      });
    }
  }

  res.json(sessions);
});

// Get single session
router.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  // Check active sessions
  const active = getActiveSessions().get(sessionId);
  if (active) {
    return res.json({ status: 'active', ...active.getSessionHistory() });
  }

  // Check completed sessions (in-memory cache)
  const completed = getCompletedSessions().get(sessionId);
  if (completed) {
    return res.json({ status: 'completed', ...completed });
  }

  // Fall back to file storage
  const data = storage.loadSession(sessionId);
  if (data) {
    return res.json({ status: 'completed', ...data });
  }

  res.status(404).json({ error: 'Session not found' });
});

// Post-call analysis
router.post('/api/session/:sessionId/analyze', async (req, res) => {
  const { sessionId } = req.params;
  const force = req.query.force === 'true';

  if (getActiveSessions().has(sessionId)) {
    return res.status(400).json({ error: 'Session is still active' });
  }

  // Load session data
  let sessionData = getCompletedSessions().get(sessionId);
  if (!sessionData) {
    sessionData = storage.loadSession(sessionId);
  }
  if (!sessionData) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Return cached analysis (unless force regenerate)
  if (sessionData.analysis && !force) {
    return res.json(sessionData.analysis);
  }

  const provider = loadProvider();
  if (!provider) {
    return res.status(400).json({ error: 'AI provider not configured' });
  }

  const transcriptText = (sessionData.fullTranscript || []).map(t => t.text).join(' ').trim();
  if (!transcriptText) {
    return res.status(400).json({ error: 'No transcript data available' });
  }

  try {
    const analysis = await generateAnalysis(sessionId, sessionData, provider);
    if (!analysis) {
      return res.status(400).json({ error: 'No transcript data available' });
    }

    // Cache and persist
    sessionData.analysis = analysis;
    storage.saveSession(sessionId, sessionData);
    getCompletedSessions().set(sessionId, sessionData);

    // Auto-rename session if this is a fresh analysis
    try {
      const newName = formatSessionName(analysis, sessionData.startTime);
      if (newName) {
        db.updateSessionName(sessionId, newName);
      }
    } catch (renameErr) {
      console.error('[API] Session rename failed:', renameErr.message);
    }

    res.json(analysis);
  } catch (error) {
    console.error('Post-call analysis error:', error);
    res.status(500).json({ error: 'Failed to generate analysis' });
  }
});

// Delete a session
router.delete('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  db.deleteSession(sessionId);
  storage.deleteSessionData(sessionId);
  res.json({ success: true });
});

// Rename a session
router.patch('/api/session/:sessionId/rename', (req, res) => {
  const { sessionId } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  db.updateSessionName(sessionId, name.trim());
  res.json({ success: true });
});

// Export a session as JSON
router.get('/api/session/:sessionId/export', (req, res) => {
  const { sessionId } = req.params;
  const session = db.getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const sessionData = storage.loadSession(sessionId);
  const exportData = {
    ...session,
    transcript: sessionData?.fullTranscript || [],
    analysis: sessionData?.analysis || null,
    suggestions: sessionData?.suggestions || []
  };
  const safeName = (session.name || sessionId).replace(/["\\\r\n]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.json"`);
  res.json(exportData);
});

// ============================================
// PREFERENCES
// ============================================

router.get('/api/preferences', (req, res) => {
  const methodology = db.getConfig('methodology') || 'meddpicc';
  const theme = db.getConfig('theme') || 'system';
  res.json({ methodology, theme });
});

router.patch('/api/preferences', (req, res) => {
  const { methodology, theme } = req.body;
  if (methodology && ['meddpicc', 'bant'].includes(methodology)) {
    db.setConfig('methodology', methodology);
  }
  if (theme && ['light', 'dark', 'system'].includes(theme)) {
    db.setConfig('theme', theme);
  }
  const current = {
    methodology: db.getConfig('methodology') || 'meddpicc',
    theme: db.getConfig('theme') || 'system'
  };
  res.json(current);
});

// ============================================
// CRM INTEGRATIONS
// ============================================

// Resolve a connected provider instance, or send the appropriate error.
// Returns null (and ends the response) when unavailable / not connected.
function resolveProvider(req, res) {
  const id = req.params.provider;
  if (!crm.getProviderClass(id)) {
    res.status(404).json({ error: `Provider '${id}' is not available yet` });
    return null;
  }
  const cfg = crm.getCrmConfig();
  if (!cfg.connected || cfg.provider !== id) {
    res.status(400).json({ error: 'CRM is not connected' });
    return null;
  }
  return crm.loadCrmProvider(id);
}

function crmErrorStatus(e) {
  // Auth/precondition problems are the user's to fix -> 400; everything else 502.
  return e && typeof e.code === 'string' && e.code.startsWith('AZ_') ? 400 : 502;
}

// List providers, their capability descriptors, and connection status.
router.get('/api/integrations', (req, res) => {
  const cfg = crm.getCrmConfig();
  const providers = crm.listProviderCatalog().map(p => {
    const Cls = crm.getProviderClass(p.id);
    const descriptor = Cls ? new Cls().getCapabilities() : null;
    const connected = cfg.connected && cfg.provider === p.id;
    return {
      ...p,
      descriptor,
      connected,
      userName: connected ? cfg.userName : null
    };
  });
  res.json({ providers, active: cfg.connected ? cfg.provider : null });
});

// Connect: authenticate as the current user and persist the connection.
router.post('/api/integrations/:provider/connect', async (req, res) => {
  const id = req.params.provider;
  const Cls = crm.getProviderClass(id);
  if (!Cls) {
    return res.status(400).json({ connected: false, error: `Provider '${id}' is not available yet` });
  }
  try {
    const provider = new Cls({ orgUrl: db.getConfig('crm_org_url') || undefined });
    const result = await provider.testConnection();
    crm.saveCrmConnection(id, {
      userName: result.userName,
      userId: result.userId,
      orgUrl: provider.orgUrl
    });
    res.json({ connected: true, provider: id, userName: result.userName });
  } catch (e) {
    console.error('[CRM] Connect failed:', e.message);
    res.status(crmErrorStatus(e)).json({ connected: false, error: e.message, code: e.code });
  }
});

// Disconnect: forget the saved connection.
router.post('/api/integrations/:provider/disconnect', (req, res) => {
  crm.clearCrmConnection();
  res.json({ connected: false });
});

// Level 1: parents (accounts/companies) assigned to the current user.
router.get('/api/integrations/:provider/parents', async (req, res) => {
  const provider = resolveProvider(req, res);
  if (!provider) return;
  try {
    res.json({ items: await provider.listParents() });
  } catch (e) {
    console.error('[CRM] listParents failed:', e.message);
    res.status(crmErrorStatus(e)).json({ error: e.message, code: e.code });
  }
});

// Level 2: records (opportunities/deals) under a parent.
router.get('/api/integrations/:provider/parents/:parentId/records', async (req, res) => {
  const provider = resolveProvider(req, res);
  if (!provider) return;
  try {
    res.json({ items: await provider.listRecords(req.params.parentId) });
  } catch (e) {
    console.error('[CRM] listRecords failed:', e.message);
    res.status(crmErrorStatus(e)).json({ error: e.message, code: e.code });
  }
});

// Search a record by its external/business ID.
router.get('/api/integrations/:provider/records/search', async (req, res) => {
  const provider = resolveProvider(req, res);
  if (!provider) return;
  const number = req.query.number;
  if (!number || !String(number).trim()) {
    return res.status(400).json({ error: 'A record ID is required' });
  }
  try {
    const record = await provider.findByExternalId(number);
    if (!record) return res.status(404).json({ error: 'No matching record found' });
    res.json(record);
  } catch (e) {
    console.error('[CRM] findByExternalId failed:', e.message);
    res.status(crmErrorStatus(e)).json({ error: e.message, code: e.code });
  }
});

// Append a note to a record.
router.post('/api/integrations/:provider/records/:recordId/notes', async (req, res) => {
  const provider = resolveProvider(req, res);
  if (!provider) return;
  const { text } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Note text is required' });
  }
  try {
    const result = await provider.appendNote(req.params.recordId, String(text).trim());
    res.json(result);
  } catch (e) {
    console.error('[CRM] appendNote failed:', e.message);
    res.status(crmErrorStatus(e)).json({ error: e.message, code: e.code });
  }
});

module.exports = router;
