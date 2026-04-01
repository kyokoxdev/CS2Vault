/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import "../setup-component";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/components/ui/Select", () => ({
  Select: ({ value, onChange, options, className }: any) => (
    <select
      data-testid="select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

import { WatchlistFilters } from "@/components/market/WatchlistFilters";

const defaultFilterOptions = {
  categories: ["Rifle", "Pistol", "Knife"],
  rarities: ["Consumer", "Industrial", "Mil-Spec"],
  groups: [
    { id: "g1", name: "Group A" },
    { id: "g2", name: "Group B" },
  ],
};

const defaultProps = {
  category: "",
  rarity: "",
  search: "",
  group: "",
  filterOptions: defaultFilterOptions,
  itemCount: 10,
  totalCount: 20,
  onChange: vi.fn(),
  onClear: vi.fn(),
};

describe("WatchlistFilters", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("all filter controls render", () => {
    render(<WatchlistFilters {...defaultProps} />);

    const selects = screen.getAllByTestId("select");
    expect(selects).toHaveLength(3);

    expect(
      screen.getByPlaceholderText("Search items...")
    ).toBeInTheDocument();
  });

  it("debounced search fires onChange", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<WatchlistFilters {...defaultProps} onChange={onChange} />);

    const searchInput = screen.getByPlaceholderText("Search items...");
    fireEvent.change(searchInput, { target: { value: "test query" } });

    expect(onChange).not.toHaveBeenCalledWith("search", "test query");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledWith("search", "test query");
  });

  it("Clear Filters button appears when any filter active", () => {
    const { rerender } = render(
      <WatchlistFilters {...defaultProps} category="Rifle" />
    );
    expect(screen.getByText("Clear Filters")).toBeInTheDocument();

    rerender(<WatchlistFilters {...defaultProps} />);
    expect(screen.queryByText("Clear Filters")).not.toBeInTheDocument();
  });

  it("Clear Filters calls onClear", () => {
    const onClear = vi.fn();
    render(
      <WatchlistFilters
        {...defaultProps}
        category="Rifle"
        onClear={onClear}
      />
    );

    fireEvent.click(screen.getByText("Clear Filters"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("item count display shows correct text", () => {
    render(
      <WatchlistFilters {...defaultProps} itemCount={5} totalCount={10} />
    );
    expect(screen.getByText("Showing 5 of 10 items")).toBeInTheDocument();
  });
});
