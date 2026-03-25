/** @vitest-environment jsdom */
import './setup-component';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import type { Session } from 'next-auth';

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children?: ReactNode }) => createElement('div', {}, children),
}));

vi.mock('@/components/ui/StatCard', () => ({
  StatCard: (props: { label: string; value: string | number; prefix?: string }) =>
    createElement(
      'div',
      { 'data-testid': `stat-${props.label}` },
      `${props.label}:${props.prefix ?? ''}${String(props.value)}`
    ),
}));

vi.mock('@/components/market/WatchlistTable', () => ({
  WatchlistTable: () => createElement('div', { 'data-testid': 'watchlist-table' }),
}));

vi.mock('@/components/market/AddItemPanel', () => ({
  AddItemPanel: () => createElement('div', { 'data-testid': 'add-item-panel' }),
}));

vi.mock('@/components/market/TopMovers', () => ({
  TopMovers: () => createElement('div', { 'data-testid': 'top-movers' }),
}));

vi.mock('@/components/market/NewsFeed', () => ({
  NewsFeed: () => createElement('div', { 'data-testid': 'news-feed' }),
}));

vi.mock('react-icons/fa', () => ({
  FaCheckCircle: () => null,
  FaTimesCircle: () => null,
  FaTimes: () => null,
  FaPlus: () => null,
  FaSpinner: () => null,
  FaSyncAlt: () => null,
}));

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

import MarketOverview from '../src/app/page';

const mockUseSession = vi.mocked(useSession);

function makeUseSessionReturn(status: 'authenticated' | 'unauthenticated' | 'loading') {
  const session: Session = {
    user: { id: 'u1', steamId: '76561198000000000', name: 'Test', image: undefined },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };

  return {
    data: status === 'authenticated' ? session : null,
    status,
    update: vi.fn(),
  };
}

function getFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function makeResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as unknown as Response;
}

describe('Portfolio Value auth-dependent fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getFetchUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/items?limit=1') {
        return makeResponse({ success: true, data: { items: [], total: 0 } });
      }

      if (url === '/api/sync' && method === 'GET') {
        return makeResponse({ success: true, data: { logs: [] } });
      }

      if (url === '/api/sync' && method === 'POST') {
        return makeResponse({ success: true, data: { itemCount: 0, duration: 0 } });
      }

      if (url === '/api/market/summary') {
        return makeResponse({
          success: true,
          data: { marketCapUsd: null, source: 'CSFloat', status: 'ok' },
        });
      }

      if (url === '/api/market/top-movers') {
        return makeResponse({
          success: true,
          data: { gainers: [], losers: [], source: 'watchlist' },
        });
      }

      if (url === '/api/market/news-feed?limit=20') {
        return makeResponse({
          success: true,
          data: { items: [], updatedAt: new Date().toISOString() },
        });
      }

      if (url === '/api/market/market-cap') {
        return makeResponse({
          success: true,
          status: 'error',
          data: null,
        });
      }

      if (url === '/api/portfolio') {
        return makeResponse({
          success: true,
          data: { totalCurrentValue: 1234.56 },
        });
      }

      throw new Error(`Unhandled fetch: ${method} ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('when authenticated: calls /api/portfolio', async () => {
    mockUseSession.mockReturnValue(makeUseSessionReturn('authenticated') as never);

    render(createElement(MarketOverview));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/portfolio');
    });
  });

  it('when unauthenticated: renders Login required and does not fetch /api/portfolio', async () => {
    mockUseSession.mockReturnValue(makeUseSessionReturn('unauthenticated') as never);

    render(createElement(MarketOverview));

    expect(screen.getByText('Login required')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/items?limit=1');
    });

    const calledPortfolio = vi
      .mocked(fetch)
      .mock.calls.some(([input]) => getFetchUrl(input).includes('/api/portfolio'));
    expect(calledPortfolio).toBe(false);
  });

  it('when loading: renders Loading...', async () => {
    mockUseSession.mockReturnValue(makeUseSessionReturn('loading') as never);

    render(createElement(MarketOverview));

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/items?limit=1');
    });
  });
});
