import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import CoachingPanel from '../../src/components/CoachingPanel.jsx';

const nudge = (overrides = {}) => ({
  _id: Math.random(),
  persona: 'ae',
  type: 'MultiThread',
  urgency: 'now',
  signal: 'pushing back on price',
  headline: 'Identify the economic buyer now',
  why: 'Understanding the economic buyer is crucial for advancing the deal.',
  say: 'Can we discuss who the economic buyer is for this project?',
  ...overrides
});

describe('CoachingPanel', () => {
  it('shows the listening empty state when there are no nudges', () => {
    render(<CoachingPanel coaching={[]} status="listening" />);
    expect(screen.getByText(/only at the moments that matter/i)).toBeInTheDocument();
  });

  it('shows the idle empty state when not listening', () => {
    render(<CoachingPanel coaching={[]} status="idle" />);
    expect(screen.getByText(/Live coaching appears here during a call/i)).toBeInTheDocument();
  });

  it('renders a single nudge with headline, why and try-saying', () => {
    render(<CoachingPanel coaching={[nudge()]} status="listening" />);
    expect(screen.getByText('Identify the economic buyer now')).toBeInTheDocument();
    expect(screen.getByText(/crucial for advancing the deal/i)).toBeInTheDocument();
    expect(screen.getByText('Try saying')).toBeInTheDocument();
    expect(screen.getByText(/who the economic buyer is/i)).toBeInTheDocument();
    expect(screen.getByText('Account Executive')).toBeInTheDocument();
    expect(screen.getByText('Multi-thread')).toBeInTheDocument();
  });

  it('shows the customer signal that triggered the card', () => {
    render(
      <CoachingPanel
        coaching={[nudge({ signal: 'questioning value of the technology' })]}
        status="listening"
      />
    );
    expect(screen.getByText('Customer signal:')).toBeInTheDocument();
    expect(screen.getByText(/questioning value of the technology/i)).toBeInTheDocument();
  });

  it('omits the customer signal line when no signal is present', () => {
    render(<CoachingPanel coaching={[nudge({ signal: null })]} status="listening" />);
    expect(screen.queryByText('Customer signal:')).not.toBeInTheDocument();
  });

  it('renders labels for the new SE technical moves', () => {
    render(
      <CoachingPanel
        coaching={[
          nudge({ _id: 'p', persona: 'se', type: 'ProveIt' }),
          nudge({ _id: 'q', persona: 'se', type: 'QuantifyTech' })
        ]}
        status="listening"
      />
    );
    expect(screen.getByText('Prove it')).toBeInTheDocument();
    expect(screen.getByText('Quantify value')).toBeInTheDocument();
  });

  it('stacks multiple nudges rather than replacing them', () => {
    render(
      <CoachingPanel
        coaching={[
          nudge({ _id: 'b', headline: 'Newest move' }),
          nudge({ _id: 'a', headline: 'Older move' })
        ]}
        status="listening"
      />
    );
    expect(screen.getByText('Newest move')).toBeInTheDocument();
    expect(screen.getByText('Older move')).toBeInTheDocument();
  });

  it('renders the newest nudge first', () => {
    const { container } = render(
      <CoachingPanel
        coaching={[
          nudge({ _id: 'b', headline: 'Newest move' }),
          nudge({ _id: 'a', headline: 'Older move' })
        ]}
        status="listening"
      />
    );
    const headlines = within(container).getAllByText(/move$/);
    expect(headlines[0]).toHaveTextContent('Newest move');
    expect(headlines[1]).toHaveTextContent('Older move');
  });

  it('only shows the Now badge on the latest nudge', () => {
    render(
      <CoachingPanel
        coaching={[
          nudge({ _id: 'b', urgency: 'now', headline: 'Newest' }),
          nudge({ _id: 'a', urgency: 'now', headline: 'Older' })
        ]}
        status="listening"
      />
    );
    expect(screen.getAllByText('Now')).toHaveLength(1);
  });

  it('accepts a single object for backward compatibility', () => {
    render(<CoachingPanel coaching={nudge({ headline: 'Legacy shape' })} status="listening" />);
    expect(screen.getByText('Legacy shape')).toBeInTheDocument();
  });

  it('falls back to the AE persona for an unknown persona', () => {
    render(<CoachingPanel coaching={[nudge({ persona: 'mystery' })]} status="listening" />);
    expect(screen.getByText('Account Executive')).toBeInTheDocument();
  });
});
