import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlaybookEditor from '../../src/components/PlaybookEditor.jsx';

const DRAFT = {
  role: 'Solution Engineer',
  company: { name: 'Contoso', description: 'A data + AI platform.' },
  products: ['Fabric'],
  personas: ['CISO'],
  outcomes: ['Cut pipeline latency 60%'],
  differentiators: ['Native governance'],
  competitors: ['Snowflake'],
  proofPoints: ['40% cost cut at Acme'],
  competitorTraps: [{ competitor: 'Snowflake', question: '' }],
  source: 'draft'
};

function mockFetch(handlers) {
  return vi.fn(async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    const key = `${method} ${url}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unexpected fetch: ${key}`);
    return handler(opts);
  });
}

function jsonRes(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe('PlaybookEditor', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('loads and renders the playbook fields from the API', async () => {
    global.fetch = mockFetch({ 'GET /api/playbook': () => jsonRes(DRAFT) });
    render(<PlaybookEditor />);

    expect(await screen.findByDisplayValue('Solution Engineer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Contoso')).toBeInTheDocument();
    expect(screen.getByText('Fabric')).toBeInTheDocument();
    expect(screen.getByText('CISO')).toBeInTheDocument();
    // Competitor trap row is shown for each competitor.
    expect(screen.getByLabelText('Trap question for Snowflake')).toBeInTheDocument();
  });

  it('shows a helpful message when no knowledge base exists yet', async () => {
    global.fetch = mockFetch({ 'GET /api/playbook': () => jsonRes({ error: 'nope' }, false, 404) });
    render(<PlaybookEditor />);
    expect(await screen.findByText(/Run onboarding first/i)).toBeInTheDocument();
  });

  it('saves edits via PUT and confirms success', async () => {
    const put = vi.fn((opts) => jsonRes({ ...JSON.parse(opts.body), source: 'edited' }));
    global.fetch = mockFetch({
      'GET /api/playbook': () => jsonRes(DRAFT),
      'PUT /api/playbook': put
    });
    render(<PlaybookEditor />);

    const roleInput = await screen.findByDisplayValue('Solution Engineer');
    await userEvent.clear(roleInput);
    await userEvent.type(roleInput, 'Senior SE');

    await userEvent.click(screen.getByRole('button', { name: /save playbook/i }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const sent = JSON.parse(put.mock.calls[0][0].body);
    expect(sent.role).toBe('Senior SE');
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('fills a competitor trap question and includes it on save', async () => {
    const put = vi.fn((opts) => jsonRes({ ...JSON.parse(opts.body), source: 'edited' }));
    global.fetch = mockFetch({
      'GET /api/playbook': () => jsonRes(DRAFT),
      'PUT /api/playbook': put
    });
    render(<PlaybookEditor />);

    const trap = await screen.findByLabelText('Trap question for Snowflake');
    await userEvent.type(trap, 'How do you govern models today?');
    await userEvent.click(screen.getByRole('button', { name: /save playbook/i }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const sent = JSON.parse(put.mock.calls[0][0].body);
    expect(sent.competitorTraps).toEqual([{ competitor: 'Snowflake', question: 'How do you govern models today?' }]);
  });

  it('renders a personalised summary of the rep from their onboarding', async () => {
    global.fetch = mockFetch({ 'GET /api/playbook': () => jsonRes({ ...DRAFT, company: { name: 'Contoso', description: '' } }) });
    render(<PlaybookEditor />);
    // Reflects role, company, product and persona so the tool feels tailored.
    expect(await screen.findByText(/You're a Solution Engineer at Contoso/i)).toBeInTheDocument();
    expect(screen.getByText(/selling Fabric to CISO/i)).toBeInTheDocument();
  });

  it('save-and-continue: saves then invokes onContinue when used in first-run', async () => {
    const put = vi.fn((opts) => jsonRes({ ...JSON.parse(opts.body), source: 'edited' }));
    global.fetch = mockFetch({
      'GET /api/playbook': () => jsonRes(DRAFT),
      'PUT /api/playbook': put
    });
    const onContinue = vi.fn();
    render(<PlaybookEditor onContinue={onContinue} />);

    const btn = await screen.findByRole('button', { name: /save & start meeting/i });
    await userEvent.click(btn);

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
  });

  it('save-and-continue: does NOT continue when the save fails', async () => {
    global.fetch = mockFetch({
      'GET /api/playbook': () => jsonRes(DRAFT),
      'PUT /api/playbook': () => jsonRes({ error: 'boom' }, false, 500)
    });
    const onContinue = vi.fn();
    render(<PlaybookEditor onContinue={onContinue} />);

    await userEvent.click(await screen.findByRole('button', { name: /save & start meeting/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
