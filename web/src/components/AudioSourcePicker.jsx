import { useEffect } from 'react';

// Auto-selects the best audio source on mount.
// Electron: first screen source (Entire Screen). Browser: screen-share.
export default function AudioSourcePicker({ onSourceSelected }) {
  const isElectron = !!window.clumo?.isElectron;

  useEffect(() => {
    async function autoSelect() {
      if (isElectron) {
        try {
          const sources = await window.clumo.getAudioSources();
          const screen = sources.find(s => s.id.startsWith('screen:'));
          if (screen) {
            onSourceSelected(screen.id);
          }
        } catch (e) {
          console.error('Failed to get audio sources:', e);
        }
      } else {
        onSourceSelected('screen-share');
      }
    }
    autoSelect();
  }, []);

  // No visible UI, selection is automatic
  return null;
}
