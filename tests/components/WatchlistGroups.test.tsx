/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "../setup-component";
import { WatchlistGroups, type Group } from "@/components/market/WatchlistGroups";

vi.mock("@/components/providers/ToastProvider", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("@/components/market/GroupManager", () => ({
  GroupManager: ({ group, onClose }: { group: { id: string }; onClose: () => void }) => (
    <div data-testid="group-manager" data-group-id={group.id}>
      <button type="button" onClick={onClose}>Close</button>
    </div>
  ),
}));

const mockGroups: Group[] = [
  { id: "g1", name: "Investment", color: "#00C076", sortOrder: 0, _count: { items: 3 } },
  { id: "g2", name: "Trade", color: "#F6465D", sortOrder: 1, _count: { items: 1 } },
];

describe("WatchlistGroups Component", () => {
  const mockOnGroupSelect = vi.fn();
  const mockOnGroupsChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders All Items tab and group tabs with names and item counts", () => {
    render(
      <WatchlistGroups
        groups={mockGroups}
        activeGroupId={null}
        onGroupSelect={mockOnGroupSelect}
        onGroupsChange={mockOnGroupsChange}
      />
    );

    expect(screen.getByText("All Items")).toBeInTheDocument();
    expect(screen.getByText("Investment")).toBeInTheDocument();
    expect(screen.getByText("Trade")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("marks All Items tab as active when activeGroupId is null", () => {
    render(
      <WatchlistGroups
        groups={mockGroups}
        activeGroupId={null}
        onGroupSelect={mockOnGroupSelect}
        onGroupsChange={mockOnGroupsChange}
      />
    );

    const allItemsTab = screen.getByText("All Items").closest("button")!;
    expect(allItemsTab.className).toContain("tabActive");
  });

  it("marks the correct group tab as active", () => {
    render(
      <WatchlistGroups
        groups={mockGroups}
        activeGroupId="g2"
        onGroupSelect={mockOnGroupSelect}
        onGroupsChange={mockOnGroupsChange}
      />
    );

    const allItemsTab = screen.getByText("All Items").closest("button")!;
    expect(allItemsTab.className).not.toContain("tabActive");

    const tradeTab = screen.getByText("Trade").closest("button")!;
    expect(tradeTab.className).toContain("tabActive");
  });

  it("calls onGroupSelect with group id when clicking a group tab", () => {
    render(
      <WatchlistGroups
        groups={mockGroups}
        activeGroupId={null}
        onGroupSelect={mockOnGroupSelect}
        onGroupsChange={mockOnGroupsChange}
      />
    );

    const investmentTab = screen.getByText("Investment").closest("button")!;
    fireEvent.click(investmentTab);
    expect(mockOnGroupSelect).toHaveBeenCalledWith("g1");
  });

  it("calls onGroupSelect with null when clicking All Items", () => {
    render(
      <WatchlistGroups
        groups={mockGroups}
        activeGroupId="g1"
        onGroupSelect={mockOnGroupSelect}
        onGroupsChange={mockOnGroupsChange}
      />
    );

    fireEvent.click(screen.getByText("All Items"));
    expect(mockOnGroupSelect).toHaveBeenCalledWith(null);
  });

  it("shows inline form when clicking + New Group", () => {
    render(
      <WatchlistGroups
        groups={mockGroups}
        activeGroupId={null}
        onGroupSelect={mockOnGroupSelect}
        onGroupsChange={mockOnGroupsChange}
      />
    );

    fireEvent.click(screen.getByText("+ New Group"));

    expect(screen.getByPlaceholderText("Group name")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    const colorSwatches = screen.getAllByRole("button", { name: /Select color/ });
    expect(colorSwatches.length).toBe(6);
  });

  it("hides inline form when clicking Cancel", () => {
    render(
      <WatchlistGroups
        groups={mockGroups}
        activeGroupId={null}
        onGroupSelect={mockOnGroupSelect}
        onGroupsChange={mockOnGroupsChange}
      />
    );

    fireEvent.click(screen.getByText("+ New Group"));
    expect(screen.getByPlaceholderText("Group name")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByPlaceholderText("Group name")).not.toBeInTheDocument();
    expect(screen.getByText("+ New Group")).toBeInTheDocument();
  });

  it("opens GroupManager when clicking gear icon on a group tab", () => {
    render(
      <WatchlistGroups
        groups={mockGroups}
        activeGroupId={null}
        onGroupSelect={mockOnGroupSelect}
        onGroupsChange={mockOnGroupsChange}
      />
    );

    const gearButtons = screen.getAllByText("⚙");
    expect(gearButtons).toHaveLength(2);

    fireEvent.click(gearButtons[0]);

    const manager = screen.getByTestId("group-manager");
    expect(manager).toBeInTheDocument();
    expect(manager).toHaveAttribute("data-group-id", "g1");
  });

  it("closes GroupManager when clicking its Close button", () => {
    render(
      <WatchlistGroups
        groups={mockGroups}
        activeGroupId={null}
        onGroupSelect={mockOnGroupSelect}
        onGroupsChange={mockOnGroupsChange}
      />
    );

    const gearButtons = screen.getAllByText("⚙");
    fireEvent.click(gearButtons[0]);
    expect(screen.getByTestId("group-manager")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByTestId("group-manager")).not.toBeInTheDocument();
  });

  it("renders color dots for groups with colors", () => {
    const { container } = render(
      <WatchlistGroups
        groups={mockGroups}
        activeGroupId={null}
        onGroupSelect={mockOnGroupSelect}
        onGroupsChange={mockOnGroupsChange}
      />
    );

    const dots = container.querySelectorAll(".tabDot");
    expect(dots).toHaveLength(2);
    expect((dots[0] as HTMLElement).style.backgroundColor).toBe("rgb(0, 192, 118)");
  });
});
