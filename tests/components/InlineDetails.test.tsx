/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../setup-component";

import { InlineDetails } from "@/components/charts/InlineDetails";

describe("InlineDetails", () => {
    it("renders change, range, and candle stats on one strip", () => {
        render(
            <InlineDetails
                stats={{
                    startPrice: 10,
                    endPrice: 15,
                    delta: 5,
                    changePercent: 50,
                    high: 18,
                    low: 8,
                    candleCount: 24,
                    trend: "up",
                }}
                chartMode="line"
                trendClassName="is-up"
            />
        );

        expect(screen.getByText("Change")).toBeInTheDocument();
        expect(screen.getByText("+50.00%")).toBeInTheDocument();
        expect(screen.getByText("+$5.00")).toBeInTheDocument();
        expect(screen.getByText("Range")).toBeInTheDocument();
        expect(screen.getByText("$8.00")).toBeInTheDocument();
        expect(screen.getByText("to $18.00")).toBeInTheDocument();
        expect(screen.getByText("Candles")).toBeInTheDocument();
        expect(screen.getByText("24")).toBeInTheDocument();
        expect(screen.getByText("Close line view")).toBeInTheDocument();
    });

    it("applies the trend class to change values", () => {
        render(
            <InlineDetails
                stats={{
                    startPrice: 10,
                    endPrice: 9,
                    delta: -1,
                    changePercent: -10,
                    high: 12,
                    low: 8,
                    candleCount: 4,
                    trend: "down",
                }}
                chartMode="candles"
                trendClassName="is-down"
            />
        );

        expect(screen.getByText("-10.00%")).toHaveClass("is-down");
        expect(screen.getByText("-$1.00")).toHaveClass("is-down");
    });

    it("renders nothing when stats are missing", () => {
        const { container } = render(<InlineDetails stats={null} chartMode="line" />);

        expect(container).toBeEmptyDOMElement();
    });
});
