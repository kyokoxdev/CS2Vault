/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TopMovers, TopMover } from '../../src/components/market/TopMovers';
import '../setup-component';

// Mock SparklineChart
vi.mock('@/components/charts/SparklineChart', () => ({
  default: () => <div data-testid="sparkline" />,
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('TopMovers Component', () => {
  const mockGainers: TopMover[] = [
    { 
      id: 'g1', 
      name: 'AK-47 | Redline', 
      price: 12.5, 
      change24h: 12.5, 
      sparkline: [{ time: 1700000000, value: 10 }, { time: 1700086400, value: 12.5 }] 
    },
  ];

  const mockLosers: TopMover[] = [
    { 
      id: 'l1', 
      name: 'AWP | Dragon Lore', 
      price: 1000, 
      change24h: -8.3, 
      sparkline: [{ time: 1700000000, value: 1100 }, { time: 1700086400, value: 1000 }] 
    },
  ];

  it('renders section headers', () => {
    render(<TopMovers gainers={mockGainers} losers={mockLosers} />);
    expect(screen.getByText('Top Gainers')).toBeInTheDocument();
    expect(screen.getByText('Top Losers')).toBeInTheDocument();
  });

  it('renders gainer cards with correct details', () => {
    render(<TopMovers gainers={mockGainers} losers={mockLosers} />);
    expect(screen.getByText('AK-47 | Redline')).toBeInTheDocument();
    expect(screen.getByText('$12.50')).toBeInTheDocument();
    expect(screen.getByText('+12.50%')).toBeInTheDocument();
  });

  it('renders loser cards with correct details', () => {
    render(<TopMovers gainers={mockGainers} losers={mockLosers} />);
    expect(screen.getByText('AWP | Dragon Lore')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText('-8.30%')).toBeInTheDocument();
  });

  it('shows loading skeletons when isLoading is true', () => {
    const { container } = render(<TopMovers gainers={[]} losers={[]} isLoading={true} />);
    // Check for skeleton class presence
    const skeletons = container.querySelectorAll('div[class*="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
    // Should be 10 skeletons (5 for gainers, 5 for losers)
    expect(skeletons.length).toBe(10);
  });

  it('shows empty state when both arrays are empty and not loading', () => {
    render(<TopMovers gainers={[]} losers={[]} isLoading={false} />);
    expect(screen.getByText(/No market data available/i)).toBeInTheDocument();
  });

  it('renders sparkline for each card', () => {
    render(<TopMovers gainers={mockGainers} losers={mockLosers} />);
    const sparklines = screen.getAllByTestId('sparkline');
    expect(sparklines).toHaveLength(mockGainers.length + mockLosers.length);
  });

  it('navigates to item page on click', () => {
    render(<TopMovers gainers={mockGainers} losers={mockLosers} />);
    const card = screen.getByText('AK-47 | Redline').closest('div');
    if (card) {
      fireEvent.click(card);
      expect(mockPush).toHaveBeenCalledWith('/item/g1');
    } else {
      throw new Error('Card not found');
    }
  });
});
