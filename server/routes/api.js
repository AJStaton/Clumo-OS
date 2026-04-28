// REST API routes for Clumo
// Handles onboarding, sessions, knowledge base, and settings

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const db = require('../db');
const storage = require('../storage');
const { loadProvider, loadEmbeddingProvider, saveProviderConfig, seedManagedCredentials } = require('../ai-provider');
const { getKnowledgeBase } = require('../knowledge-base');
const HybridWebsiteScraper = require('../hybrid-website-scraper');
const DocumentParser = require('../document-parser');
const KnowledgeGenerator = require('../knowledge-generator');

const router = express.Router();

// File upload config
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.pptx', '.md', '.txt', '.png', '.jpg', '.jpeg', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
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
  const providerMode = db.getConfig('provider_mode') || 'byok';
  const provider = db.getConfig('ai_provider');

  if (providerMode === 'managed') {
    return res.json({
      configured: true,
      providerMode: 'managed',
      provider: 'managed'
    });
  }

  if (!provider) {
    return res.json({ configured: false, providerMode });
  }

  const settings = { configured: true, providerMode, provider };

  if (provider === 'azure') {
    settings.endpoint = db.getConfig('azure_endpoint');
    settings.apiVersion = db.getConfig('azure_api_version');
    settings.chatDeployment = db.getConfig('azure_chat_deployment');
    settings.realtimeDeployment = db.getConfig('azure_realtime_deployment');
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
  const { provider, providerMode, managedEndpoint, managedApiKey, ...config } = req.body;

  // Handle managed mode
  if (providerMode === 'managed') {
    db.setConfig('provider_mode', 'managed');
    // Seed managed credentials if provided (admin/setup)
    if (managedEndpoint && managedApiKey) {
      seedManagedCredentials(managedEndpoint, managedApiKey);
    }
    // Mark setup as having a provider configured
    db.setConfig('ai_provider', 'managed');
    return res.json({ success: true });
  }

  // BYOK mode
  db.setConfig('provider_mode', 'byok');

  const existingAzureApiKey = db.getSecureConfig('azure_api_key');
  const existingOpenAiApiKey = db.getSecureConfig('openai_api_key');

  if (!provider || !['azure', 'openai'].includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider. Must be "azure" or "openai".' });
  }

  if (provider === 'azure') {
    if (!config.endpoint || !config.chatDeployment || !config.realtimeDeployment || !config.embeddingDeployment) {
      return res.status(400).json({ error: 'Azure requires: endpoint, apiKey, chatDeployment, realtimeDeployment, embeddingDeployment' });
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
  const { websiteUrl, uploadedFiles } = req.body;

  if (!websiteUrl && (!uploadedFiles || uploadedFiles.length === 0)) {
    return res.status(400).json({ error: 'Please provide a website URL or upload documents' });
  }

  if (activeStream) {
    return res.status(409).json({ error: 'Onboarding is already in progress' });
  }

  const sseToken = createSseToken({ websiteUrl, uploadedFiles, merge: false });
  res.json({ sseToken });
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

  const sseToken = createSseToken({ websiteUrl, uploadedFiles, merge: true });
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
  const { websiteUrl, uploadedFiles, merge } = job.config;

  const providerMode = db.getConfig('provider_mode') || 'byok';
  const embeddingProvider = loadEmbeddingProvider();

  // For managed mode, we only need the embedding provider (no chat/realtime provider required for onboarding)
  let provider;
  if (providerMode === 'managed') {
    provider = loadProvider();
    // In managed mode, if no BYOK provider is configured, the embedding provider handles embeddings
    // but we still need a chat provider for KB generation. For now, managed mode requires
    // managed credentials to include chat capability or fall back to embedding-only.
    if (!provider && !embeddingProvider) {
      return res.status(400).json({ error: 'AI provider not configured. Complete setup first.' });
    }
    // Use embedding provider's client for chat if no BYOK provider
    if (!provider) {
      provider = embeddingProvider;
    }
  } else {
    provider = loadProvider();
    if (!provider) {
      return res.status(400).json({ error: 'AI provider not configured. Complete setup first.' });
    }
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
    const maxCaseStudies = parseInt(db.getConfig('max_case_studies') || '10', 10);
    const scraper = new HybridWebsiteScraper(openaiClient, { maxCaseStudies });
    const parser = new DocumentParser(openaiClient);
    const generator = new KnowledgeGenerator(provider, embeddingProvider);

    let websiteContent = null;
    let documentContents = [];

    // Step 1: Scrape website
    if (websiteUrl) {
      sendEvent('progress', { stage: 'scraping', message: 'Scanning your website...' });
      websiteContent = await scraper.scrape(websiteUrl, (progress) => {
        sendEvent('progress', { stage: 'scraping', message: progress.message });
      });
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
    const result = await generator.generate(websiteContent, documentContents, (progress) => {
      sendEvent('progress', { stage: progress.stage, message: progress.message, counts: progress.counts || null });
    }, { merge, userId: 'local' });

    db.setConfig('onboarding_complete', 'true');
    sendEvent('complete', { counts: result.counts });
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
      sessions.push({
        sessionId: s.id,
        status: 'completed',
        name: s.name,
        startTime: s.start_time,
        endTime: s.end_time,
        suggestionCount: s.suggestion_count
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

  // Return cached analysis
  if (sessionData.analysis) {
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

  const suggestionsSummary = (sessionData.suggestions || []).map(s => {
    if (s.type === 'discovery') return `Discovery: ${s.suggestion.question}`;
    if (s.type === 'case_study') return `Case Study: ${s.suggestion.company} - ${s.suggestion.headline}`;
    if (s.type === 'proof_point') return `Proof Point: ${s.suggestion.stat}`;
    return '';
  }).filter(Boolean).join('\n');

  try {
    const response = await provider.chatCompletion([
      {
        role: 'system',
        content: `You are a sales call analyst. Given a sales call transcript and the suggestions that were surfaced during the call, generate a comprehensive post-call analysis.

Return ONLY valid JSON with these three fields:

{
  "callNotes": ["bullet point 1", "bullet point 2", ...],
  "crmUpdate": "A formatted note suitable for pasting into a CRM activity/notes field.",
  "followUpEmail": {
    "subject": "Email subject line",
    "body": "Full email body text."
  }
}

Guidelines:
- callNotes: 5-8 bullet points capturing the most important discussion points, objections, commitments, and next steps
- crmUpdate: Structured for quick scanning with line breaks between sections
- followUpEmail: Write as if from the salesperson to the prospect. Reference specific topics discussed.`
      },
      {
        role: 'user',
        content: `CALL TRANSCRIPT:\n"${transcriptText.slice(-5000)}"\n\n${suggestionsSummary ? `SUGGESTIONS SURFACED:\n${suggestionsSummary}\n\n` : ''}Generate the post-call analysis.`
      }
    ], { temperature: 0.3, max_tokens: 2000 });

    let content = response.choices[0].message.content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch (parseErr) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw parseErr;
      }
    }

    // Cache and persist
    sessionData.analysis = analysis;
    storage.saveSession(sessionId, sessionData);

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

module.exports = router;
