// Vitest setup for Clumo web tests.

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  });
}

if (!window.clumo) {
  window.clumo = {
    isElectron: false,
    getAudioSources: async () => [],
    openExternal: async () => {},
    getVersion: async () => '0.0.0-test'
  };
}

if (!globalThis.fetch) {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({})
  });
}
