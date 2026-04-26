// WebSocket client for Clumo
// Connects to the server for real-time transcription and suggestions

export function createWsClient(onMessage) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const ws = new WebSocket(`${protocol}//${host}`);

  ws.onopen = () => {
    onMessage({ type: '_connected' });
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };

  ws.onclose = () => {
    onMessage({ type: '_disconnected' });
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    onMessage({ type: '_error', message: 'WebSocket connection error' });
  };

  return {
    sendAudio(base64Data) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'audio', data: base64Data }));
      }
    },

    sendSuggestionUsed(suggestionId) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'suggestion_used', suggestionId }));
      }
    },

    sendSuggestionDismissed(suggestionId) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'suggestion_dismissed', suggestionId }));
      }
    },

    close() {
      ws.close();
    },

    get readyState() {
      return ws.readyState;
    }
  };
}
