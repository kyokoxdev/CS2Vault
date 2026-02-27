/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "../setup-component";
import { AddItemPanel } from "@/components/market/AddItemPanel";

// Mock ItemSearch
vi.mock("@/components/ui/ItemSearch", () => ({
  default: ({
    onSelect,
    placeholder,
  }: {
    onSelect: (selected: any) => void;
    placeholder: string;
  }) => (
    <div data-testid="item-search">
      <input
        placeholder={placeholder}
        onChange={() =>
          onSelect({
            hashName: "AK-47 | Redline (Field-Tested)",
            name: "AK-47 | Redline",
            category: "weapon",
            rarity: "Classified",
            exterior: "Field-Tested",
            type: "Rifle",
          })
        }
      />
    </div>
  ),
}));

describe("AddItemPanel Component", () => {
  it("renders panel with label and search", () => {
    const onSelect = vi.fn();
    render(<AddItemPanel onAdd={onSelect} />);

    expect(
      screen.getByText("Search Steam Market to add items")
    ).toBeInTheDocument();
    expect(screen.getByTestId("item-search")).toBeInTheDocument();
  });

  it("calls onAdd when item is selected in search", () => {
    const onSelect = vi.fn();
    render(<AddItemPanel onAdd={onSelect} />);

    const input = screen.getByPlaceholderText(/Type to search/i);
    fireEvent.change(input, { target: { value: "AK-47" } });

    expect(onSelect).toHaveBeenCalledWith({
      hashName: "AK-47 | Redline (Field-Tested)",
      name: "AK-47 | Redline",
      category: "weapon",
      rarity: "Classified",
      exterior: "Field-Tested",
      type: "Rifle",
    });
  });
});
