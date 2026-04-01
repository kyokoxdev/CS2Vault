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
      onClick?: (e: React.MouseEvent) => void;
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

vi.mock("@/components/providers/ToastProvider", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

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

describe("WatchlistTable — Bulk Actions (Checkbox Selection)", () => {
  const mockOnToggleWatch = vi.fn();
  const mockOnRowClick = vi.fn();
  const mockOnSelectionChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders checkbox column when selection props are provided", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        selectedIds={new Set<string>()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(3);
  });

  it("does not render checkboxes when selection props are omitted", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
      />
    );

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("selects all items when header checkbox is clicked", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        selectedIds={new Set<string>()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    expect(mockOnSelectionChange).toHaveBeenCalledTimes(1);
    const calledWith = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
    expect(calledWith).toEqual(new Set(["1", "2"]));
  });

  it("deselects all items when header checkbox is clicked and all are selected", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        selectedIds={new Set(["1", "2"])}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    expect(mockOnSelectionChange).toHaveBeenCalledTimes(1);
    const calledWith = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
    expect(calledWith).toEqual(new Set());
  });

  it("toggles individual row selection when row checkbox is clicked", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        selectedIds={new Set<string>()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    expect(mockOnSelectionChange).toHaveBeenCalledTimes(1);
    const calledWith = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
    expect(calledWith.has("1")).toBe(true);
    expect(calledWith.size).toBe(1);
  });

  it("removes item from selection when already-selected row checkbox is clicked", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        selectedIds={new Set(["1"])}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    expect(mockOnSelectionChange).toHaveBeenCalledTimes(1);
    const calledWith = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
    expect(calledWith.has("1")).toBe(false);
    expect(calledWith.size).toBe(0);
  });

  it("header checkbox is checked when all items are selected", () => {
    render(
      <WatchlistTable
        items={mockItems}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        selectedIds={new Set(["1", "2"])}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).toBeChecked();
  });
});
