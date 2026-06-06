import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWsClient } from '../../src/lib/ws-client.js';

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.sent = [];
    MockWebSocket.instances.push(this);
  }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  // helpers
  _open() { this.readyState = 1; this.onopen?.(); }
  _message(data) { this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) }); }
  _error() { this.onerror?.({ message: 'boom' }); }
}
MockWebSocket.instances = [];
MockWebSocket.OPEN = 1;

describe('ws-client.createWsClient', () => {
  let originalWS;

  beforeEach(() => {
    originalWS = global.WebSocket;
    MockWebSocket.instances = [];
    global.WebSocket = MockWebSocket;
    // Force protocol + host
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'http:', host: 'localhost:3000' }
    });
  });

  afterEach(() => {
    global.WebSocket = originalWS;
  });

  it('uses ws:// for http and dispatches _connected on open', () => {
    const onMessage = vi.fn();
    const client = createWsClient(onMessage);
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe('ws://localhost:3000/ws');
    ws._open();
    expect(onMessage).toHaveBeenCalledWith({ type: '_connected' });
    expect(client.readyState).toBe(MockWebSocket.OPEN);
  });

  it('uses wss:// when page is https', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'https:', host: 'app.clumo.io' }
    });
    createWsClient(() => {});
    expect(MockWebSocket.instances[0].url).toBe('wss://app.clumo.io/ws');
  });

  it('parses JSON messages and forwards to handler', () => {
    const onMessage = vi.fn();
    createWsClient(onMessage);
    const ws = MockWebSocket.instances[0];
    ws._open();
    ws._message({ type: 'transcript', text: 'hi' });
    expect(onMessage).toHaveBeenCalledWith({ type: 'transcript', text: 'hi' });
  });

  it('swallows JSON parse errors gracefully', () => {
    const onMessage = vi.fn();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createWsClient(onMessage);
    const ws = MockWebSocket.instances[0];
    ws._open();
    ws._message('not-json');
    // _connected was dispatched but not the bad payload
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('dispatches _disconnected on close', () => {
    const onMessage = vi.fn();
    const client = createWsClient(onMessage);
    const ws = MockWebSocket.instances[0];
    ws._open();
    onMessage.mockClear();
    client.close();
    expect(onMessage).toHaveBeenCalledWith({ type: '_disconnected' });
  });

  it('dispatches _error on error event', () => {
    const onMessage = vi.fn();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createWsClient(onMessage);
    const ws = MockWebSocket.instances[0];
    ws._error();
    expect(onMessage).toHaveBeenCalledWith({ type: '_error', message: 'WebSocket connection error' });
    errSpy.mockRestore();
  });

  it('sendAudio sends JSON payload when open', () => {
    const client = createWsClient(() => {});
    const ws = MockWebSocket.instances[0];
    ws._open();
    client.sendAudio('base64audio');
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'audio', data: 'base64audio' });
  });

  it('sendAudio is a no-op when socket not open', () => {
    const client = createWsClient(() => {});
    const ws = MockWebSocket.instances[0];
    // never opened
    client.sendAudio('x');
    expect(ws.sent).toEqual([]);
  });

  it('sendSuggestionUsed and sendSuggestionDismissed send typed messages', () => {
    const client = createWsClient(() => {});
    const ws = MockWebSocket.instances[0];
    ws._open();
    client.sendSuggestionUsed('s1');
    client.sendSuggestionDismissed('s2');
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'suggestion_used', suggestionId: 's1' });
    expect(JSON.parse(ws.sent[1])).toEqual({ type: 'suggestion_dismissed', suggestionId: 's2' });
  });
});
