import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SuggestionCard from '../../src/components/SuggestionCard.jsx';

const baseSuggestion = {
  type: 'case_study',
  suggestion: {
    company: 'Acme',
    headline: 'Scaled to 10x revenue',
    result: 'Used Clumo across 200 reps.',
    link: 'https://example.com/case'
  }
};

describe('SuggestionCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders case study fields', () => {
    render(<SuggestionCard suggestion={baseSuggestion} onUse={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    expect(screen.getByText(/Scaled to 10x revenue/)).toBeInTheDocument();
    expect(screen.getByText(/Used Clumo across 200 reps/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Read more/i })).toHaveAttribute('href', 'https://example.com/case');
    expect(screen.getByText('Case Study')).toBeInTheDocument();
  });

  it('renders discovery question', () => {
    render(
      <SuggestionCard
        suggestion={{ type: 'discovery', suggestion: { question: 'What is your budget?', context: 'Asked early' } }}
        onUse={() => {}}
        onDismiss={() => {}}
      />
    );
    expect(screen.getByText('What is your budget?')).toBeInTheDocument();
    expect(screen.getByText('Asked early')).toBeInTheDocument();
    expect(screen.getByText('Discovery Question')).toBeInTheDocument();
  });

  it('renders proof point with source', () => {
    render(
      <SuggestionCard
        suggestion={{ type: 'proof_point', suggestion: { stat: '99.99% uptime', source: 'Q4 report' } }}
        onUse={() => {}}
        onDismiss={() => {}}
      />
    );
    expect(screen.getByText('99.99% uptime')).toBeInTheDocument();
    expect(screen.getByText(/Source: Q4 report/)).toBeInTheDocument();
  });

  it('renders product truth with category', () => {
    render(
      <SuggestionCard
        suggestion={{ type: 'product_truth', suggestion: { fact: 'Local-first storage', category: 'Architecture' } }}
        onUse={() => {}}
        onDismiss={() => {}}
      />
    );
    expect(screen.getByText('Local-first storage')).toBeInTheDocument();
    expect(screen.getByText('Architecture')).toBeInTheDocument();
  });

  it('starts at 15 seconds and decrements every second', () => {
    render(<SuggestionCard suggestion={baseSuggestion} onUse={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText('15s')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('14s')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('9s')).toBeInTheDocument();
  });

  it('auto-dismisses after 15 seconds', () => {
    const onDismiss = vi.fn();
    render(<SuggestionCard suggestion={baseSuggestion} onUse={() => {}} onDismiss={onDismiss} />);
    act(() => { vi.advanceTimersByTime(15000); });
    expect(onDismiss).toHaveBeenCalled();
  });

  it('calls onUse when check button clicked', () => {
    const onUse = vi.fn();
    render(<SuggestionCard suggestion={baseSuggestion} onUse={onUse} onDismiss={() => {}} />);
    fireEvent.click(screen.getByTitle('Used this'));
    expect(onUse).toHaveBeenCalled();
  });

  it('calls onDismiss when X button clicked', () => {
    const onDismiss = vi.fn();
    render(<SuggestionCard suggestion={baseSuggestion} onUse={() => {}} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTitle('Dismiss'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('falls back to case_study styling for unknown type', () => {
    render(
      <SuggestionCard
        suggestion={{ type: 'mystery', suggestion: { company: 'X', headline: 'y', result: 'z' } }}
        onUse={() => {}}
        onDismiss={() => {}}
      />
    );
    expect(screen.getByText('Case Study')).toBeInTheDocument();
  });
});
