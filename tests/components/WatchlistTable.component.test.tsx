/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "../setup-component";
import { WatchlistTable, type Item } from "@/components/market/WatchlistTable";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("next/link", () => {
  return {
    default: ({
      children,
      href,
      onClick,
      className,
    }: {
      children: React.ReactNode;
      href: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onClick?: (e: any) => void;
      className?: string;
    }) => (
      <a href={href} onClick={onClick} className={className}>
        {children}
      </a>
    ),
  };
});

vi.mock("@/components/ui/Badge", () => ({
  Badge: ({
    children,
    variant,
  }: {
    children: React.ReactNode;
    variant: string;
  }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/charts/SparklineChart", () => ({
  default: ({ data, width, height }: { data: unknown[]; width: number; height: number }) => (
    <div data-testid="sparkline" data-points={data.length} style={{ width, height }} />
  ),
}));

describe("WatchlistTable Component", () => {
  const mockItems: Item[] = [
    {
      id: "1",
      marketHashName: "AK-47 | Redline (Field-Tested)",
      name: "AK-47 | Redline",
      category: "weapon",
      type: "Rifle",
      rarity: "Classified",
      exterior: "Field-Tested",
      isWatched: true,
      currentPrice: 15.5,
      priceSource: "CSFloat",
      lastUpdated: "2023-10-27T10:00:00Z",
      imageUrl: "https://example.com/ak47.png",
      priceChange24h: 3.25,
      sparkline: [
        { time: 1000, value: 14.0 },
        { time: 2000, value: 15.5 },
      ],
      notes: null,
      groups: [],
    },
    {
      id: "2",
      marketHashName: "AWP | Asiimov (Field-Tested)",
      name: "AWP | Asiimov",
      category: "weapon",
      type: "Sniper Rifle",
      rarity: "Covert",
      exterior: "Field-Tested",
      isWatched: true,
      currentPrice: null,
      priceSource: null,
      lastUpdated: null,
      imageUrl: null,
      priceChange24h: null,
      sparkline: [],
      notes: "Watch this one",
      groups: [{ id: "g1", name: "Snipers", color: "#ff0" }],
    },
  ];

  const mockOnToggleWatch = vi.fn();
  const mockOnRowClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders table headers correctly", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
      />
    );

    expect(screen.getByText("Item")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Rarity")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("24h")).toBeInTheDocument();
    expect(screen.getByText("7d")).toBeInTheDocument();
  });

  it("renders items correctly", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
      />
    );

    expect(screen.getByText("AK-47 | Redline")).toBeInTheDocument();
    expect(screen.getByText("AWP | Asiimov")).toBeInTheDocument();
    expect(screen.getByText("$15.50")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders item images and placeholders", () => {
    const { container } = render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
      />
    );

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "https://example.com/ak47.png");
    expect(images[0]).toHaveAttribute("loading", "lazy");

    const placeholders = container.querySelectorAll("[role='img']");
    expect(placeholders).toHaveLength(1);
  });

  it("renders 24h price change with correct styling", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
      />
    );

    expect(screen.getByText(/\+3\.25%/)).toBeInTheDocument();
  });

  it("renders sparkline charts for items with data", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
      />
    );

    const sparklines = screen.getAllByTestId("sparkline");
    expect(sparklines).toHaveLength(1);
    expect(sparklines[0]).toHaveAttribute("data-points", "2");
  });

  it("calls onRowClick when clicking a row", () => {
    const { container } = render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
      />
    );

    const rows = container.querySelectorAll("tbody tr");
    fireEvent.click(rows[0]);

    expect(mockOnRowClick).toHaveBeenCalledWith("1");
  });

  it("opens action menu and calls onToggleWatch on Unwatch", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
      />
    );

    const triggers = screen.getAllByLabelText("Item actions");
    fireEvent.click(triggers[0]);

    const unwatchButtons = screen.getAllByText("Unwatch");
    fireEvent.click(unwatchButtons[0]);

    expect(mockOnToggleWatch).toHaveBeenCalledWith("1", true);
  });

  it("shows action menu items when callbacks provided", () => {
    const mockAddNote = vi.fn();
    const mockAssignGroup = vi.fn();
    const mockViewDetails = vi.fn();

    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        onAddNote={mockAddNote}
        onAssignGroup={mockAssignGroup}
        onViewDetails={mockViewDetails}
      />
    );

    const triggers = screen.getAllByLabelText("Item actions");
    fireEvent.click(triggers[0]);

    expect(screen.getByText("Add Note")).toBeInTheDocument();
    expect(screen.getByText("Assign to Group")).toBeInTheDocument();
    expect(screen.getByText("View Details")).toBeInTheDocument();
  });

  it("renders empty state message when no items", () => {
    render(
      <WatchlistTable
        items={[]}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
      />
    );

    expect(
      screen.getByText(
        /No items in watchlist. Add items above to start tracking./i
      )
    ).toBeInTheDocument();
  });

  it("renders rarity badges correctly", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
      />
    );

    const badges = screen.getAllByTestId("badge");
    expect(badges.length).toBeGreaterThan(0);
  });
});
