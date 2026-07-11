import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Transcript from '../../src/components/Transcript.jsx';

describe('Transcript', () => {
  it('renders empty-state placeholder when no entries', () => {
    render(<Transcript entries={[]} />);
    expect(screen.getByText(/Transcript will appear here/i)).toBeInTheDocument();
  });

  it('renders entries with timestamps', () => {
    const entries = [
      { text: 'hello there', timestamp: '2025-05-17T14:30:00Z' },
      { text: 'general kenobi', timestamp: '2025-05-17T14:30:05Z' }
    ];
    render(<Transcript entries={entries} />);
    expect(screen.getByText('hello there')).toBeInTheDocument();
    expect(screen.getByText('general kenobi')).toBeInTheDocument();
  });

  it('escapes HTML in transcript text (XSS guard)', () => {
    const entries = [{ text: '<img src=x onerror=alert(1)>', timestamp: new Date().toISOString() }];
    const { container } = render(<Transcript entries={entries} />);
    // The string should appear as text, not as a rendered <img>
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });

  it('labels You and Customer speakers when attributed', () => {
    const entries = [
      { text: 'how does the API work', speaker: 'customer', timestamp: '2025-05-17T14:30:00Z' },
      { text: 'great question, let me explain', speaker: 'you', timestamp: '2025-05-17T14:30:05Z' }
    ];
    render(<Transcript entries={entries} />);
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });

  it('omits a speaker label when the entry is unattributed', () => {
    const entries = [{ text: 'unlabelled line', timestamp: '2025-05-17T14:30:00Z' }];
    render(<Transcript entries={entries} />);
    expect(screen.queryByText('You')).toBeNull();
    expect(screen.queryByText('Customer')).toBeNull();
    expect(screen.getByText('unlabelled line')).toBeInTheDocument();
  });
});
