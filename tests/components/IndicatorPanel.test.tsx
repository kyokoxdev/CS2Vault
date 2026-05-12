/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "../setup-component";

import { IndicatorPanel } from "@/components/charts/IndicatorPanel";

describe("IndicatorPanel", () => {
  it("renders overlay and oscillator sections", () => {
    render(<IndicatorPanel activeIndicators={[]} onToggle={vi.fn()} />);

    expect(screen.getByText("Overlay")).toBeInTheDocument();
    expect(screen.getByText("Oscillator")).toBeInTheDocument();
  });

  it("renders indicator toggles with accessible labels", () => {
    render(<IndicatorPanel activeIndicators={[]} onToggle={vi.fn()} />);

    expect(screen.getByText("SMA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Simple Moving Average" })).toBeInTheDocument();
    expect(screen.getByText("RSI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Relative Strength Index" })).toBeInTheDocument();
  });

  it("calls onToggle with the selected indicator id", () => {
    const onToggle = vi.fn();

    render(<IndicatorPanel activeIndicators={[]} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle Simple Moving Average" }));

    expect(onToggle).toHaveBeenCalledWith("sma");
  });

  it("marks active indicators as on", () => {
    render(<IndicatorPanel activeIndicators={["sma"]} onToggle={vi.fn()} />);

    const toggle = screen.getByRole("button", { name: "Toggle Simple Moving Average" });

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveTextContent("On");
  });

  it("shows indicator inputs when active and forwards changes", () => {
    const onInputChange = vi.fn();

    render(
      <IndicatorPanel
        activeIndicators={["sma"]}
        onToggle={vi.fn()}
        onInputChange={onInputChange}
      />
    );

    const input = screen.getByDisplayValue("14");

    expect(input).toBeInTheDocument();
    expect(input).toHaveValue(14);

    fireEvent.change(input, { target: { value: "21" } });

    expect(onInputChange).toHaveBeenCalledWith("sma", "length", 21);
  });
});
