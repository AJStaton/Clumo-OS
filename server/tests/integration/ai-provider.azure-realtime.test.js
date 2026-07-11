// Real-API integration test: Azure OpenAI Realtime WebSocket transcription.
//
// This test connects to the live Azure OpenAI Realtime API, streams a small
// pre-recorded WAV (16 kHz / mono / PCM16) of a spoken sentence, and asserts
// a transcript comes back. It catches breakage in:
//   - AzureOpenAIProvider.createRealtimeWebSocket() URL/auth shape
//   - transcription_session.update / input_audio_buffer.append / .commit framing
//   - the event names the live API uses for completed transcripts
//
// Excluded from the default `npm test` run. Run via:
//   AZURE_OPENAI_ENDPOINT=https://your.openai.azure.com \
//   AZURE_OPENAI_KEY=...                                  \
//   AZURE_OPENAI_REALTIME_DEPLOYMENT=gpt-4o-realtime-preview \
//   npm run test:realtime --workspace=server
//
// Skips (does not fail) when those env vars are missing so contributors
// without keys still get a green suite.

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { AzureOpenAIProvider } = require('../../ai-provider');

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const KEY = process.env.AZURE_OPENAI_KEY;
const REALTIME_DEPLOYMENT = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT;
const HAS_CREDS = Boolean(ENDPOINT && KEY && REALTIME_DEPLOYMENT);

const WAV_PATH = path.join(__dirname, 'fixtures', 'realtime-sample.wav');

// Strip a 44-byte RIFF/WAVE header and return the PCM16 payload as a Buffer.
// The committed fixture is 16 kHz / mono / PCM16, which is what the Realtime
// API expects (input_audio_format: 'pcm16').
function readPcm16FromWav(wavPath) {
  const buf = fs.readFileSync(wavPath);
  // Find the 'data' chunk; on canonical fixtures this lives at offset 36.
  let off = 12;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === 'data') return buf.subarray(off + 8, off + 8 + sz);
    off += 8 + sz;
  }
  throw new Error(`No data chunk found in ${wavPath}`);
}

describe('AzureOpenAIProvider — Realtime transcription (live API)', () => {
  const itOrSkip = HAS_CREDS ? it : it.skip;

  itOrSkip('transcribes a pre-recorded WAV over the Realtime WebSocket', async () => {
    const provider = new AzureOpenAIProvider({
      endpoint: ENDPOINT,
      apiKey: KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-10-01-preview',
      chatDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
      realtimeDeployment: REALTIME_DEPLOYMENT
    });

    const pcm = readPcm16FromWav(WAV_PATH);
    const ws = provider.createRealtimeWebSocket();

    const transcript = await new Promise((resolve, reject) => {
      const overallTimeout = setTimeout(() => {
        reject(new Error('Realtime transcription timed out after 25s'));
        try { ws.close(); } catch (_) { /* ignore */ }
      }, 25000);

      let openedAt = null;

      ws.on('open', () => {
        openedAt = Date.now();
        // Configure the session for transcription.
        ws.send(JSON.stringify({
          type: 'transcription_session.update',
          session: {
            input_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            }
          }
        }));

        // Stream the WAV in ~100ms chunks (1600 samples * 2 bytes @ 16 kHz).
        const CHUNK_BYTES = 3200;
        let cursor = 0;
        const pump = () => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (cursor >= pcm.length) {
            ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
            return;
          }
          const chunk = pcm.subarray(cursor, cursor + CHUNK_BYTES);
          cursor += CHUNK_BYTES;
          ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: chunk.toString('base64')
          }));
          setTimeout(pump, 50);
        };
        setTimeout(pump, 150); // small delay so the session.update lands first
      });

      ws.on('message', (data) => {
        let event;
        try { event = JSON.parse(data.toString()); } catch (_) { return; }

        // Both event names are used across API versions; ws.js handles both.
        if (
          event.type === 'conversation.item.input_audio_transcription.completed' ||
          event.type === 'transcription.text.done'
        ) {
          const text = event.transcript || event.text;
          if (text && text.trim()) {
            clearTimeout(overallTimeout);
            try { ws.close(); } catch (_) { /* ignore */ }
            resolve(text.trim());
          }
        } else if (event.type === 'error') {
          clearTimeout(overallTimeout);
          try { ws.close(); } catch (_) { /* ignore */ }
          reject(new Error(`Realtime API error: ${event.error?.message || JSON.stringify(event.error)}`));
        }
      });

      ws.on('error', (err) => {
        clearTimeout(overallTimeout);
        reject(new Error(`WebSocket error after ${openedAt ? Date.now() - openedAt : 0}ms: ${err.message}`));
      });
    });

    // Shape assertions
    expect(typeof transcript).toBe('string');
    expect(transcript.length).toBeGreaterThan(0);

    // Soft content match: the fixture says "The quick brown fox jumps over
    // the lazy dog." Whisper punctuation/capitalization drifts between
    // versions, so we accept any one of the distinctive keywords.
    expect(transcript.toLowerCase()).toMatch(/fox|quick|brown|lazy|dog/);
  }, 30000);

  if (!HAS_CREDS) {
    it('is skipped because Azure Realtime credentials are not set', () => {
      // Sentinel so the file is never reported as "0 tests" — keeps CI summaries honest.
      expect(HAS_CREDS).toBe(false);
    });
  }
});
