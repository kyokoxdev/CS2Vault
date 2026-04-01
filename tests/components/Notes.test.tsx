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

const itemWithNote: Item = {
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
  notes: "Great investment item",
  groups: [],
};

const itemWithoutNote: Item = {
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
  notes: null,
  groups: [],
};

describe("WatchlistTable — Notes UI", () => {
  const mockOnToggleWatch = vi.fn();
  const mockOnRowClick = vi.fn();
  const mockOnAddNote = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders note indicator for items with notes", () => {
    render(
      <WatchlistTable
        items={[itemWithNote]}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
      />
    );

    const noteIndicator = screen.getByLabelText("Edit note");
    expect(noteIndicator).toBeInTheDocument();
    expect(noteIndicator).toHaveAttribute("title", "Great investment item");
  });

  it("does not render note indicator for items without notes", () => {
    render(
      <WatchlistTable
        items={[itemWithoutNote]}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
      />
    );

    expect(screen.queryByLabelText("Edit note")).not.toBeInTheDocument();
  });

  it("shows 'Edit Note' in action menu for items with notes", () => {
    render(
      <WatchlistTable
        items={[itemWithNote]}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        onAddNote={mockOnAddNote}
      />
    );

    fireEvent.click(screen.getByLabelText("Item actions"));
    expect(screen.getByText("Edit Note")).toBeInTheDocument();
  });

  it("shows 'Add Note' in action menu for items without notes", () => {
    render(
      <WatchlistTable
        items={[itemWithoutNote]}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        onAddNote={mockOnAddNote}
      />
    );

    fireEvent.click(screen.getByLabelText("Item actions"));
    expect(screen.getByText("Add Note")).toBeInTheDocument();
  });

  it("calls onAddNote when clicking Add Note in action menu", () => {
    render(
      <WatchlistTable
        items={[itemWithoutNote]}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        onAddNote={mockOnAddNote}
      />
    );

    fireEvent.click(screen.getByLabelText("Item actions"));
    fireEvent.click(screen.getByText("Add Note"));

    expect(mockOnAddNote).toHaveBeenCalledWith("2");
  });

  it("opens inline NoteEditor when clicking note indicator", () => {
    render(
      <WatchlistTable
        items={[itemWithNote]}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        onAddNote={mockOnAddNote}
      />
    );

    fireEvent.click(screen.getByLabelText("Edit note"));

    expect(screen.getByPlaceholderText("Add a note...")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Great investment item")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("hides NoteEditor when clicking Cancel", () => {
    render(
      <WatchlistTable
        items={[itemWithNote]}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        onAddNote={mockOnAddNote}
      />
    );

    fireEvent.click(screen.getByLabelText("Edit note"));
    expect(screen.getByPlaceholderText("Add a note...")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByPlaceholderText("Add a note...")).not.toBeInTheDocument();
  });

  it("shows character count in NoteEditor", () => {
    render(
      <WatchlistTable
        items={[itemWithNote]}
        onToggleWatch={mockOnToggleWatch}
        onRowClick={mockOnRowClick}
        onAddNote={mockOnAddNote}
      />
    );

    fireEvent.click(screen.getByLabelText("Edit note"));
    expect(screen.getByText("21/500")).toBeInTheDocument();
  });
});
