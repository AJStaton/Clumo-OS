// Tests for server/crm/note-format.js — pure note composition/append logic.

const nf = require('../../crm/note-format');

describe('note-format — braceGuid', () => {
  it('upper-cases and brace-wraps a bare guid', () => {
    expect(nf.braceGuid('fa4621ef-e63e-e611-80e8-5065f38aab31'))
      .toBe('{FA4621EF-E63E-E611-80E8-5065F38AAB31}');
  });

  it('strips existing braces before re-wrapping', () => {
    expect(nf.braceGuid('{abc-DEF}')).toBe('{ABC-DEF}');
  });

  it('tolerates empty input', () => {
    expect(nf.braceGuid()).toBe('{}');
  });
});

describe('note-format — formatModifiedOn', () => {
  it('renders MSX-style M/D/YYYY, h:mm:ss tt', () => {
    const d = new Date(2026, 5, 20, 14, 48, 5); // 6/20/2026 2:48:05 PM
    expect(nf.formatModifiedOn(d)).toBe('6/20/2026, 2:48:05 PM');
  });

  it('renders midnight as 12 AM', () => {
    const d = new Date(2026, 0, 1, 0, 5, 0);
    expect(nf.formatModifiedOn(d)).toBe('1/1/2026, 12:05:00 AM');
  });
});

describe('note-format — composeNote', () => {
  it('returns empty string for missing analysis', () => {
    expect(nf.composeNote(null)).toBe('');
    expect(nf.composeNote({})).toBe('');
  });

  it('bullets call notes and appends next steps', () => {
    const out = nf.composeNote({
      callNotes: ['Budget confirmed', 'Champion identified'],
      crmUpdate: { nextSteps: 'Send proposal Friday' }
    });
    expect(out).toBe('- Budget confirmed\n- Champion identified\n\nNext steps: Send proposal Friday');
  });
});

describe('note-format — appendComment', () => {
  const now = new Date(2026, 5, 20, 14, 48, 0);

  it('creates a fresh JSON array when none exists', () => {
    const { jsonValue, textValue, entry } = nf.appendComment({
      existingJson: null,
      existingText: null,
      userId: 'fa4621ef-e63e-e611-80e8-5065f38aab31',
      comment: 'First note',
      now
    });
    const arr = JSON.parse(jsonValue);
    expect(arr).toHaveLength(1);
    expect(arr[0]).toEqual({
      userId: '{FA4621EF-E63E-E611-80E8-5065F38AAB31}',
      modifiedOn: '6/20/2026, 2:48:00 PM',
      comment: 'First note'
    });
    expect(textValue).toBe('First note');
    expect(entry.comment).toBe('First note');
  });

  it('appends to the end of an existing array (chronological)', () => {
    const existing = JSON.stringify([
      { userId: '{X}', modifiedOn: '1/1/2020, 1:00:00 AM', comment: 'Old' }
    ]);
    const { jsonValue, textValue } = nf.appendComment({
      existingJson: existing,
      existingText: 'Old',
      userId: 'abc',
      comment: 'New',
      now
    });
    const arr = JSON.parse(jsonValue);
    expect(arr.map(e => e.comment)).toEqual(['Old', 'New']);
    expect(textValue).toBe('Old\nNew');
  });

  it('recovers from malformed existing JSON by starting fresh', () => {
    const { jsonValue } = nf.appendComment({
      existingJson: 'not json',
      existingText: '',
      userId: 'abc',
      comment: 'Recovered',
      now
    });
    const arr = JSON.parse(jsonValue);
    expect(arr).toHaveLength(1);
    expect(arr[0].comment).toBe('Recovered');
  });

  it('does not mutate the input array', () => {
    const original = [{ userId: '{X}', modifiedOn: 'a', comment: 'Old' }];
    const existing = JSON.stringify(original);
    nf.appendComment({ existingJson: existing, userId: 'abc', comment: 'New', now });
    expect(JSON.parse(existing)).toHaveLength(1);
  });
});
