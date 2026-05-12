/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "../setup-component";

import { ChartModeToggle } from "@/components/charts/ChartModeToggle";

describe("ChartModeToggle", () => {
  it("renders both modes and marks the active one", () => {
    render(<ChartModeToggle mode="regular" onModeChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Chart mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advanced mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chart mode" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Advanced mode" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onModeChange with the selected mode", () => {
    const onModeChange = vi.fn();

    render(<ChartModeToggle mode="regular" onModeChange={onModeChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(onModeChange).toHaveBeenCalledWith("advanced");
  });

  it("does not change mode when disabled", () => {
    const onModeChange = vi.fn();

    render(<ChartModeToggle mode="advanced" onModeChange={onModeChange} disabled />);

    expect(screen.getByRole("button", { name: "Chart mode" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Advanced mode" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Chart mode" }));

    expect(onModeChange).not.toHaveBeenCalled();
  });
});
