// @vitest-environment jsdom
import "../setup-component";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimeframeDropdown } from "@/components/charts/TimeframeDropdown";

describe("TimeframeDropdown", () => {
    const options = [
        { label: "15M", value: "15m", description: "Short-range structure" },
        { label: "1H", value: "1h", description: "Trend over days" },
        { label: "4H", value: "4h", description: "Swing perspective" },
        { label: "1D", value: "1d", description: "Mid-term view" },
        { label: "1W", value: "1w", description: "Long-term context" },
    ];

    it("renders the selected value and opens with a label", () => {
        render(<TimeframeDropdown value="1h" onChange={vi.fn()} />);

        expect(screen.getByRole("button", { name: "Timeframe: 1H — Trend over days" })).toBeInTheDocument();
    });

    it("renders all default options with descriptions", () => {
        render(<TimeframeDropdown value="15m" onChange={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: "Timeframe: 15M — Short-range structure" }));

        expect(screen.getByRole("option", { name: "15M — Short-range structure" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "1H — Trend over days" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "1W — Long-term context" })).toBeInTheDocument();
    });

    it("calls onChange when an option is selected", () => {
        const onChange = vi.fn();

        render(<TimeframeDropdown value="15m" onChange={onChange} options={options} />);

        fireEvent.click(screen.getByRole("button", { name: "Timeframe: 15M — Short-range structure" }));
        fireEvent.click(screen.getByRole("option", { name: "4H — Swing perspective" }));

        expect(onChange).toHaveBeenCalledWith("4h");
    });

    it("supports keyboard navigation and Escape to close", () => {
        const onChange = vi.fn();

        render(<TimeframeDropdown value="1h" onChange={onChange} options={options} />);

        const trigger = screen.getByRole("button", { name: "Timeframe: 1H — Trend over days" });
        fireEvent.keyDown(trigger, { key: "ArrowDown" });

        expect(screen.getByRole("option", { name: "4H — Swing perspective" })).toHaveAttribute("aria-selected", "false");

        fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
        fireEvent.keyDown(screen.getByRole("listbox"), { key: "Enter" });

        expect(onChange).toHaveBeenCalledWith("4h");

        fireEvent.keyDown(trigger, { key: "Escape" });
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
});
