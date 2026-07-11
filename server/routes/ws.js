// WebSocket handler for Clumo
// Manages audio relay to AI provider and real-time suggestion delivery

const WebSocket = require('ws');
const SuggestionEngine = require('../suggestion-engine');
const CoachingEngine = require('../coaching-engine');
const { loadProvider, loadEmbeddingProvider } = require('../ai-provider');
const storage = require('../storage');
const db = require('../db');
const { generateAnalysis, formatSessionName } = require('../analysis');
const { isAllowedHost, isAllowedOrigin } = require('../net-guard');

// Active and completed sessions (in-memory)
const activeSessions = new Map();
const completedSessions = new Map();

const MAX_CONNECTION_ATTEMPTS = 3;

function getActiveSessions() {
  return activeSessions;
}

function getCompletedSessions() {
  return completedSessions;
}

function setupWebSocket(httpServer) {
  const wss = new WebSocket.Server({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    // Reject cross-origin / non-loopback upgrades (DNS-rebinding + drive-by web).
    if (!isAllowedHost(req.headers.host) || !isAllowedOrigin(req.headers.origin)) {
      socket.destroy();
      return;
    }
    if (req.url === '/ws' || req.url === '/') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (clientWs, req) => {
    console.log('[WS] Client connected');

    const provider = loadProvider();
    const embeddingProvider = loadEmbeddingProvider();

    if (!provider && !embeddingProvider) {
      clientWs.send(JSON.stringify({
        type: 'error',
        message: 'AI provider not configured. Please complete setup first.'
      }));
      clientWs.close();
      return;
    }

    const activeProvider = provider || embeddingProvider;

    const openaiClient = activeProvider.getClient();
    const suggestionEngine = new SuggestionEngine(activeProvider, null, embeddingProvider);
    await suggestionEngine.init('local');

    // Realtime coaching — a mainstream feature, always on when a chat-capable
    // provider is configured. Grounds every nudge in the rep's playbook.
    const coachingEnabled = !!provider;
    const coachingEngine = coachingEnabled ? new CoachingEngine(provider) : null;
    // Load the rep's editable playbook once per call — it is stable for the whole
    // session and grounds every coaching nudge in what THIS rep sells and how they win.
    const coachingPlaybook = coachingEnabled ? storage.loadPlaybook() : null;
    if (coachingEnabled) console.log(`[WS] Coaching engine enabled${coachingPlaybook ? ' (playbook loaded)' : ''}`);

    let transcriptBuffer = '';

    // Two speaker channels, each with its own Realtime connection, VAD and
    // in-flight utterance state:
    //   customer = system/screen audio (the other participant)
    //   you      = the rep's microphone
    // Attributing per channel is why we run two sessions rather than one mixed.
    function makeChannel(speaker) {
      return {
        speaker,
        ws: null,
        connected: false,
        connecting: false,
        failed: false,
        utterance: '',            // in-flight partial utterance
        utteranceStartedAt: 0,    // wall-clock of the first delta
        warmTimer: null           // debounce for warm speculative matching
      };
    }
    const channels = {
      customer: makeChannel('customer'),
      you: makeChannel('you')
    };
    const speakerLabel = (speaker) => (speaker === 'you' ? 'You' : 'Customer');

    // Register session
    const sessionId = suggestionEngine.getSessionId();
    activeSessions.set(sessionId, suggestionEngine);
    db.createSession(sessionId);
    console.log(`[WS] Session started: ${sessionId}`);

    // Connect one channel's Realtime API session for transcription.
    async function connectToRealtimeAPI(chan) {
      return new Promise((resolve, reject) => {
        const openaiWs = activeProvider.createRealtimeWebSocket();
        chan.ws = openaiWs;

        openaiWs.on('open', () => {
          console.log(`[WS] Connected to Realtime API (${chan.speaker})`);

          setTimeout(() => {
            if (openaiWs.readyState === WebSocket.OPEN) {
              // Streaming transcription via gpt-4o-mini-transcribe (delta + completed
              // events). whisper-1 has been removed entirely. The model is sourced
              // from the active provider's single transcription-model setting.
              const transcriptionModel = typeof activeProvider.getTranscriptionModel === 'function'
                ? activeProvider.getTranscriptionModel()
                : 'gpt-4o-mini-transcribe';

              openaiWs.send(JSON.stringify({
                type: 'transcription_session.update',
                session: {
                  input_audio_format: 'pcm16',
                  input_audio_transcription: {
                    model: transcriptionModel
                  },
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    // Tightened from 500ms so we react ~200ms sooner at each pause.
                    silence_duration_ms: 300
                  }
                }
              }));

              console.log(`[WS] Transcription model: ${transcriptionModel} (${chan.speaker})`);
              chan.connected = true;
              resolve();
            } else {
              reject(new Error('WebSocket not ready after open event'));
            }
          }, 100);
        });

        openaiWs.on('message', async (data) => {
          try {
            const event = JSON.parse(data.toString());
            await handleRealtimeEvent(event, chan);
          } catch (e) {
            console.error('[WS] Failed to parse Realtime API message:', e);
          }
        });

        openaiWs.on('error', (error) => {
          console.error(`[WS] Realtime API error (${chan.speaker}):`, error.message);
          reject(error);
        });

        openaiWs.on('close', () => {
          console.log(`[WS] Disconnected from Realtime API (${chan.speaker})`);
          chan.connected = false;
        });

        setTimeout(() => {
          if (!chan.connected) {
            reject(new Error('Realtime API connection timeout'));
          }
        }, 10000);
      });
    }

    // Handle events from a channel's Realtime API session.
    async function handleRealtimeEvent(event, chan) {
      switch (event.type) {
        case 'session.created':
        case 'transcription_session.created':
          console.log('[WS] Realtime session created');
          break;

        case 'session.updated':
        case 'transcription_session.updated':
          console.log('[WS] Realtime session configured');
          break;

        case 'conversation.item.input_audio_transcription.delta':
        case 'transcription.text.delta': {
          // Partial transcript — accumulate the in-flight utterance and warm the
          // local candidate set so a suggestion is ready the instant of the pause.
          const delta = event.delta || event.text || '';
          if (!delta) break;
          if (!chan.utterance) chan.utteranceStartedAt = Date.now();
          chan.utterance += delta;

          // Expose partials to the client for a live, low-latency transcript feel.
          sendToClient({ type: 'transcript_partial', text: chan.utterance, speaker: chan.speaker });

          // Debounced warm matching (~400ms of quiet within the utterance).
          if (chan.warmTimer) clearTimeout(chan.warmTimer);
          const snapshot = chan.utterance;
          chan.warmTimer = setTimeout(() => {
            suggestionEngine.warmUtterance(snapshot).catch(() => {});
          }, 400);
          break;
        }

        case 'conversation.item.input_audio_transcription.completed':
        case 'transcription.text.done': {
          const transcript = event.transcript || event.text;
          if (chan.warmTimer) { clearTimeout(chan.warmTimer); chan.warmTimer = null; }

          if (transcript && transcript.trim()) {
            const statementAt = chan.utteranceStartedAt || Date.now();
            console.log(`[WS] Transcript (${chan.speaker}): "${transcript.substring(0, 80)}..."`);

            sendToClient({ type: 'transcript', text: transcript, speaker: chan.speaker });

            suggestionEngine.addTranscript(transcript, chan.speaker);
            transcriptBuffer += `\n${speakerLabel(chan.speaker)}: ${transcript}`;

            // Check for MEDDPICC update
            const meddpicc = suggestionEngine.meddpicc;
            if (meddpicc) {
              sendToClient({ type: 'meddpicc_update', meddpicc });
            }

            // Evaluate this finalized utterance immediately. The engine handles
            // latest-wins cancellation, cooldowns, fast-path and the decision LLM,
            // so there is no buffer gate or hard analysis lock here anymore.
            suggestionEngine.getBestSuggestion(transcript, { utterance: transcript, triggeredAt: statementAt })
              .then(suggestion => {
                if (suggestion) {
                  const latency = Date.now() - statementAt;
                  console.log(`[WS] Suggestion: ${suggestion.type} (statement->emit ${latency}ms)`);
                  sendToClient({ type: 'suggestion', suggestion });
                }
              })
              .catch(err => console.error('[WS] Suggestion error:', err.message));

            // Realtime coaching (on by default) — strategic-only, two lanes. The
            // fast/reactive lane is owned by Knowledge (getBestSuggestion above).
            if (coachingEngine) {
              const coachCtx = {
                callBrief: suggestionEngine.callBrief,
                meddpicc: suggestionEngine.meddpicc,
                playbook: coachingPlaybook
              };

              // HOT lane: lean nudge (~2s). Fires on a word cadence, or EARLY on a
              // rare key moment, bounded by a cooldown. The single best steer or
              // silence.
              const trigger = coachingEngine.maybeNudge(transcript, chan.speaker);
              if (trigger) {
                coachingEngine.nudge(coachCtx, trigger)
                  .then(nudge => {
                    if (!nudge) return;
                    console.log(`[WS] Coaching (${trigger.reason}${trigger.cue ? `:${trigger.cue}` : ''}): ${nudge.persona}/${nudge.type} "${nudge.headline}"`);
                    sendToClient({ type: 'coaching', coaching: nudge });
                  })
                  .catch(err => console.error('[WS] Coaching nudge error:', err.message));
              }

              // SLOW lane: call state + MEDDPICC tooltip questions (~8s), every
              // ~3 min, kept off the hot path. Key moments never trigger this.
              if (coachingEngine.maybeRefresh()) {
                coachingEngine.refresh(coachCtx)
                  .then(questions => {
                    if (questions) sendToClient({ type: 'meddpicc_questions', questions });
                  })
                  .catch(err => console.error('[WS] Coaching refresh error:', err.message));
              }
            }

            // Reset in-flight utterance state for the next turn.
            chan.utterance = '';
            chan.utteranceStartedAt = 0;
          }
          break;
        }

        case 'input_audio_buffer.speech_started':
          sendToClient({ type: 'speech_started' });
          break;

        case 'input_audio_buffer.speech_stopped':
          sendToClient({ type: 'speech_stopped' });
          break;

        case 'error':
          console.error('[WS] Realtime API error:', event.error);
          sendToClient({ type: 'error', message: event.error?.message || 'Realtime API error' });
          break;
      }
    }

    function sendToClient(message) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(message));
      }
    }

    // Send session info immediately
    sendToClient({
      type: 'session_started',
      sessionId
    });

    // Handle messages from client
    clientWs.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'audio') {
          // Route to the right speaker channel (default customer for older clients).
          const chan = channels[message.channel] || channels.customer;

          if (!chan.connected) {
            if (chan.failed || chan.connecting) return;

            chan.connecting = true;
            let lastError = null;

            for (let attempt = 1; attempt <= MAX_CONNECTION_ATTEMPTS; attempt++) {
              try {
                await connectToRealtimeAPI(chan);
                lastError = null;
                break;
              } catch (e) {
                lastError = e;
                console.log(`[WS] Connection attempt ${attempt}/${MAX_CONNECTION_ATTEMPTS} failed (${chan.speaker})`);
                if (attempt < MAX_CONNECTION_ATTEMPTS) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }
            }

            chan.connecting = false;

            if (lastError) {
              chan.failed = true;
              sendToClient({
                type: 'error',
                message: `Failed to connect to Realtime API after ${MAX_CONNECTION_ATTEMPTS} attempts`
              });
              return;
            }
          }

          if (chan.ws && chan.ws.readyState === WebSocket.OPEN) {
            chan.ws.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: message.data
            }));
          }
        }

        if (message.type === 'suggestion_used') {
          suggestionEngine.markSuggestionUsed(message.suggestionId);
        }

        if (message.type === 'suggestion_dismissed') {
          suggestionEngine.markSuggestionDismissed(message.suggestionId);
        }
      } catch (e) {
        console.error('[WS] Failed to process client message:', e);
      }
    });

    // Handle client disconnect
    clientWs.on('close', () => {
      console.log('[WS] Client disconnected');
      Object.values(channels).forEach(chan => {
        if (chan.warmTimer) { clearTimeout(chan.warmTimer); chan.warmTimer = null; }
        if (chan.ws) { try { chan.ws.close(); } catch {} }
      });

      const finalSessionData = suggestionEngine.reset();
      if (coachingEngine) {
        finalSessionData.coaching = coachingEngine.getSessionData();
      }
      activeSessions.delete(sessionId);
      completedSessions.set(sessionId, finalSessionData);

      // Update DB metadata
      db.completeSession(sessionId, finalSessionData.totalSuggestions);

      // Persist full session data to file
      storage.saveSession(sessionId, finalSessionData);

      console.log(`[WS] Session completed: ${sessionId} (${finalSessionData.totalSuggestions} suggestions)`);

      // Auto-generate analysis (fire-and-forget)
      const analysisProvider = loadProvider();
      if (analysisProvider) {
        generateAnalysis(sessionId, finalSessionData, analysisProvider)
          .then(analysis => {
            if (analysis) {
              finalSessionData.analysis = analysis;
              storage.saveSession(sessionId, finalSessionData);
              completedSessions.set(sessionId, finalSessionData);
              console.log(`[WS] Auto-analysis complete for session: ${sessionId}`);

              // Auto-rename session
              try {
                const newName = formatSessionName(analysis, finalSessionData.startTime);
                if (newName) {
                  db.updateSessionName(sessionId, newName);
                  console.log(`[WS] Session renamed: ${newName}`);
                }
              } catch (renameErr) {
                console.error(`[WS] Session rename failed:`, renameErr.message);
              }
            }
          })
          .catch(err => {
            console.error(`[WS] Auto-analysis failed for session ${sessionId}:`, err.message);
          });
      }
    });

    clientWs.on('error', (error) => {
      console.error('[WS] Client error:', error);
    });
  });

  // Clean up old completed sessions from memory (keep 24h)
  setInterval(() => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;
    completedSessions.forEach((data, id) => {
      if (now - new Date(data.endTime).getTime() > maxAge) {
        completedSessions.delete(id);
      }
    });
  }, 60 * 60 * 1000);

  return wss;
}

module.exports = {
  setupWebSocket,
  getActiveSessions,
  getCompletedSessions
};
