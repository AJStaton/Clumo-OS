// Tests for server/coaching-style.js — normalize + render.
// Vitest globals are enabled repo-wide; do NOT import from 'vitest'.

const { MAX_STYLE, normalizeStyle, renderCoachingStyle } = require('../coaching-style');

describe('normalizeStyle', () => {
  it('trims whitespace', () => {
    expect(normalizeStyle('  be direct  ')).toBe('be direct');
  });

  it('coerces non-strings to empty', () => {
    expect(normalizeStyle(null)).toBe('');
    expect(normalizeStyle(undefined)).toBe('');
    expect(normalizeStyle(42)).toBe('');
    expect(normalizeStyle({})).toBe('');
  });

  it('caps length at MAX_STYLE', () => {
    const out = normalizeStyle('x'.repeat(MAX_STYLE + 500));
    expect(out.length).toBe(MAX_STYLE);
  });
});

describe('renderCoachingStyle', () => {
  it('returns empty string when there is no style', () => {
    expect(renderCoachingStyle('')).toBe('');
    expect(renderCoachingStyle('   ')).toBe('');
    expect(renderCoachingStyle(null)).toBe('');
  });

  it('renders a marked block containing the style text', () => {
    const block = renderCoachingStyle('Be direct. Never discount.');
    expect(block).toContain("REP'S COACHING PREFERENCES");
    expect(block).toContain('Be direct. Never discount.');
  });

  it('trims and caps the rendered text', () => {
    const block = renderCoachingStyle('  ' + 'y'.repeat(MAX_STYLE + 100) + '  ');
    // Marker line + capped body; the body portion must not exceed MAX_STYLE.
    expect(block).toContain('y'.repeat(MAX_STYLE));
    expect(block).not.toContain('y'.repeat(MAX_STYLE + 1));
  });
});
