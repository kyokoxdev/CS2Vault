/**
 * SparklineChart Component Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import "../setup-component";
import { render } from "@testing-library/react";

const addSeries = vi.fn(() => ({ setData: vi.fn() }));

// jsdom does not provide ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

vi.mock("lightweight-charts", () => ({
    createChart: vi.fn(() => ({
        addSeries,
        applyOptions: vi.fn(),
        timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
        remove: vi.fn(),
    })),
    AreaSeries: {},
    ColorType: { Solid: "solid" },
}));

import SparklineChart from "@/components/charts/SparklineChart";
import { createChart } from "lightweight-charts";

const sampleData = [
    { time: 1000, value: 10 },
    { time: 2000, value: 12 },
    { time: 3000, value: 15 },
];

describe("SparklineChart Component", () => {
    it("creates an area series with transparent fills and the trend line color", () => {
        render(<SparklineChart data={sampleData} />);

        expect(addSeries).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            lineColor: "#00C076",
            topColor: "transparent",
            bottomColor: "transparent",
            lineWidth: 2,
        }));
    });

    it("renders container div when data has 2+ points", () => {
        const { container } = render(<SparklineChart data={sampleData} />);
        const div = container.querySelector("div");
        expect(div).toBeInTheDocument();
    });

    it("renders null when data is empty", () => {
        const { container } = render(<SparklineChart data={[]} />);
        expect(container.innerHTML).toBe("");
    });

    it("createChart is called when data provided", () => {
        render(<SparklineChart data={sampleData} />);
        expect(createChart).toHaveBeenCalled();
    });

    it("does not crash with single data point", () => {
        const singlePoint = [{ time: 1000, value: 5 }];
        const { container } = render(<SparklineChart data={singlePoint} />);
        const div = container.querySelector("div");
        expect(div).toBeInTheDocument();
    });
});
