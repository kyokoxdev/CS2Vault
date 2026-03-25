/**
 * @vitest-environment jsdom
 */
import "../setup-component";
import { render, screen } from "@testing-library/react";
import { NewsFeed, FeedItem } from "@/components/market/NewsFeed";
import { vi, describe, it, expect } from "vitest";

// mock next/link
vi.mock("next/link", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockNewsItem: FeedItem = {
  id: "news-1",
  type: "news",
  title: "CS2 Update Released",
  summary: "A new update has been released for Counter-Strike 2.",
  timestamp: new Date(Date.now() - 5 * 60000).toISOString(), // 5 min ago
  url: "https://store.steampowered.com/news/1234",
};

const mockPriceAlert: FeedItem = {
  id: "alert-1",
  type: "price_alert",
  title: "AK-47 | Redline price surge",
  summary: "Price increased by 12.5%",
  timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), // 2 hours ago
  meta: {
    itemName: "AK-47 | Redline",
    priceChange: 12.5,
    newPrice: 15.0,
    itemId: "item-123",
  },
};

describe("NewsFeed Component", () => {
  it('renders section header "Market Activity"', () => {
    render(<NewsFeed items={[]} isLoading={false} />);
    expect(screen.getByText("Market Activity")).toBeInTheDocument();
  });

  it("renders news item with title and relative timestamp", () => {
    render(<NewsFeed items={[mockNewsItem]} isLoading={false} />);
    expect(screen.getByText("CS2 Update Released")).toBeInTheDocument();
    expect(screen.getByText(/5m ago/)).toBeInTheDocument();
  });

  it("renders news item with external link", () => {
    render(<NewsFeed items={[mockNewsItem]} isLoading={false} />);
    const link = screen.getByText("CS2 Update Released").closest("a");
    expect(link).toHaveAttribute("href", "https://store.steampowered.com/news/1234");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders price alert with price change", () => {
    render(<NewsFeed items={[mockPriceAlert]} isLoading={false} />);
    expect(screen.getByText(/\+12.5%/)).toBeInTheDocument();
  });

  it("shows loading skeleton when isLoading=true", () => {
    const { container } = render(<NewsFeed items={[]} isLoading={true} />);
    // Check for skeletons
    // Since we use css modules, we can't easily query by class name directly without importing the module or using a test id.
    // However, the prompt says "assert skeleton elements (use container.querySelectorAll)"
    // The skeleton implementation: <div className={styles.skeleton} />
    // We can assume there are 5 divs inside the list container.
    // Or we can check if the list container has 5 children.
    // Let's verify via the structure.
    const skeletons = container.querySelectorAll("div[class*='skeleton']");
    expect(skeletons.length).toBe(5);
  });

  it("shows empty state when items=[] and not loading", () => {
    render(<NewsFeed items={[]} isLoading={false} />);
    expect(screen.getByText(/No recent activity/i)).toBeInTheDocument();
  });

  it('external links have rel="noopener noreferrer"', () => {
     render(<NewsFeed items={[mockNewsItem]} isLoading={false} />);
     const link = screen.getByText("CS2 Update Released").closest("a");
     expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
