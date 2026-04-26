// WebSocket handler for Clumo
// Manages audio relay to AI provider and real-time suggestion delivery

const WebSocket = require('ws');
const SuggestionEngine = require('../suggestion-engine');
const { loadProvider, loadEmbeddingProvider } = require('../ai-provider');
const storage = require('../storage');
const db = require('../db');

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
  const wss = new WebSocket.Server({ server: httpServer });

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

    // In managed mode, provider may be null but embeddingProvider is available for suggestions.
    // We still need a chat/realtime provider for transcription and suggestion scoring.
    const activeProvider = provider || embeddingProvider;

    let openaiWs = null;
    const openaiClient = activeProvider.getClient();
    const suggestionEngine = new SuggestionEngine(activeProvider, null, embeddingProvider);
    await suggestionEngine.init('local');

    let transcriptBuffer = '';
    let isAnalyzing = false;
    let isConnectedToOpenAI = false;
    let isConnecting = false;
    let connectionFailed = false;

    // Register session
    const sessionId = suggestionEngine.getSessionId();
    activeSessions.set(sessionId, suggestionEngine);
    db.createSession(sessionId);
    console.log(`[WS] Session started: ${sessionId}`);

    // Connect to Realtime API for transcription
    async function connectToRealtimeAPI() {
      return new Promise((resolve, reject) => {
        openaiWs = activeProvider.createRealtimeWebSocket();

        openaiWs.on('open', () => {
          console.log('[WS] Connected to Realtime API');

          setTimeout(() => {
            if (openaiWs.readyState === WebSocket.OPEN) {
              openaiWs.send(JSON.stringify({
                type: 'transcription_session.update',
                session: {
                  input_audio_format: 'pcm16',
                  input_audio_transcription: {
                    model: 'whisper-1'
                  },
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                  }
                }
              }));

              isConnectedToOpenAI = true;
              resolve();
            } else {
              reject(new Error('WebSocket not ready after open event'));
            }
          }, 100);
        });

        openaiWs.on('message', async (data) => {
          try {
            const event = JSON.parse(data.toString());
            await handleRealtimeEvent(event);
          } catch (e) {
            console.error('[WS] Failed to parse Realtime API message:', e);
          }
        });

        openaiWs.on('error', (error) => {
          console.error('[WS] Realtime API error:', error.message);
          reject(error);
        });

        openaiWs.on('close', () => {
          console.log('[WS] Disconnected from Realtime API');
          isConnectedToOpenAI = false;
        });

        setTimeout(() => {
          if (!isConnectedToOpenAI) {
            reject(new Error('Realtime API connection timeout'));
          }
        }, 10000);
      });
    }

    // Handle events from Realtime API
    async function handleRealtimeEvent(event) {
      switch (event.type) {
        case 'session.created':
        case 'transcription_session.created':
          console.log('[WS] Realtime session created');
          break;

        case 'session.updated':
        case 'transcription_session.updated':
          console.log('[WS] Realtime session configured');
          break;

        case 'conversation.item.input_audio_transcription.completed':
        case 'transcription.text.done': {
          const transcript = event.transcript || event.text;
          if (transcript && transcript.trim()) {
            console.log(`[WS] Transcript: "${transcript.substring(0, 80)}..."`);

            sendToClient({ type: 'transcript', text: transcript });

            suggestionEngine.addTranscript(transcript);
            transcriptBuffer += ' ' + transcript;

            // Check for MEDDPICC update
            const meddpicc = suggestionEngine.getMeddpicc();
            if (meddpicc) {
              sendToClient({ type: 'meddpicc_update', meddpicc });
            }

            // Check for suggestions
            if (!isAnalyzing && transcriptBuffer.split(/\s+/).length >= 50) {
              isAnalyzing = true;
              try {
                const suggestion = await suggestionEngine.getBestSuggestion(transcriptBuffer);
                if (suggestion) {
                  console.log(`[WS] Suggestion: ${suggestion.type}`);
                  sendToClient({ type: 'suggestion', suggestion });
                }
                const words = transcriptBuffer.split(/\s+/);
                transcriptBuffer = words.slice(-75).join(' ');
              } finally {
                isAnalyzing = false;
              }
            }
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
          if (!isConnectedToOpenAI) {
            if (connectionFailed || isConnecting) return;

            isConnecting = true;
            let lastError = null;

            for (let attempt = 1; attempt <= MAX_CONNECTION_ATTEMPTS; attempt++) {
              try {
                await connectToRealtimeAPI();
                lastError = null;
                break;
              } catch (e) {
                lastError = e;
                console.log(`[WS] Connection attempt ${attempt}/${MAX_CONNECTION_ATTEMPTS} failed`);
                if (attempt < MAX_CONNECTION_ATTEMPTS) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }
            }

            isConnecting = false;

            if (lastError) {
              connectionFailed = true;
              sendToClient({
                type: 'error',
                message: `Failed to connect to Realtime API after ${MAX_CONNECTION_ATTEMPTS} attempts`
              });
              return;
            }
          }

          if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
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
      if (openaiWs) openaiWs.close();

      const finalSessionData = suggestionEngine.reset();
      activeSessions.delete(sessionId);
      completedSessions.set(sessionId, finalSessionData);

      // Update DB metadata
      db.completeSession(sessionId, finalSessionData.totalSuggestions);

      // Persist full session data to file
      storage.saveSession(sessionId, finalSessionData);

      console.log(`[WS] Session completed: ${sessionId} (${finalSessionData.totalSuggestions} suggestions)`);
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
