/**
 * @vitest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ItemDetailPage from '../../src/app/item/[id]/page';
import '../setup-component';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'item-123' }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/charts/CandlestickChart', () => ({
  default: function MockCandlestickChart({ onMarketSnapshotChange }: { onMarketSnapshotChange?: (snapshot: { price: number | null; timestamp: string | null; source: string | null; interval: string }) => void }) {
    useEffect(() => {
      onMarketSnapshotChange?.({
        price: 15.5,
        timestamp: '2023-01-02T12:00:00Z',
        source: 'steam',
        interval: '1d',
      });
    }, [onMarketSnapshotChange]);

    return <div data-testid="candlestick-chart">Chart</div>;
  },
}));

// Mock data
const mockItem = {
  success: true,
  data: {
    id: 'item-123',
    marketHashName: 'AK-47 | Redline (Field-Tested)',
    name: 'AK-47 | Redline',
    category: 'weapon',
    type: 'Rifle',
    rarity: 'Classified',
    exterior: 'Field-Tested',
    isWatched: true,
    isActive: true,
    createdAt: '2023-01-01T00:00:00Z',
  },
};

describe('ItemDetail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders loading state initially', () => {
    // Mock fetch to not resolve immediately or resolve empty
    (global.fetch as any).mockImplementation(() => new Promise(() => {})); 
    
    render(<ItemDetailPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders item details when data loads', async () => {
    (global.fetch as any).mockResolvedValue({
      json: () => Promise.resolve(mockItem),
    });

    render(<ItemDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('AK-47 | Redline')).toBeInTheDocument();
    });

    expect(screen.getByText('AK-47 | Redline (Field-Tested)')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('$15.50')).toBeInTheDocument();
    });

    expect(screen.getByText('Classified')).toBeInTheDocument();
    expect(screen.getByText('Rifle')).toBeInTheDocument();
    expect(screen.getByText('Field-Tested')).toBeInTheDocument();
    expect(screen.getByText('Watching')).toBeInTheDocument();

    expect(screen.getByTestId('candlestick-chart')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('renders error state when item fetch fails', async () => {
    (global.fetch as any).mockResolvedValue({
      json: () => Promise.resolve({ success: false }),
    });

    render(<ItemDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.getByText('← Back to Market')).toBeInTheDocument();
  });
});
