/** @vitest-environment jsdom */

import "./setup-component";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/Select", () => ({
    Select: ({ id, value, onChange, options, className }: {
        id: string;
        value: string;
        onChange: (value: string) => void;
        options: Array<{ label: string; value: string }>;
        className?: string;
    }) => (
        <select
            id={id}
            className={className}
            value={value}
            onChange={(event) => onChange(event.target.value)}
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

import SettingsPage from "@/app/settings/page";

describe("SettingsPage", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("loads the browser refresh interval and shows the market cap refresh action", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                activeMarketSource: "csfloat",
                activeAIProvider: "gemini-pro",
                priceRefreshIntervalMin: 15,
                openAiApiKey: "",
                geminiApiKey: "",
                csfloatApiKey: "",
                csgotraderSubProvider: "csfloat",
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        render(<SettingsPage />);

        expect(await screen.findByLabelText("Browser Refresh Interval (Minutes)")).toHaveValue(15);
        expect(screen.getByRole("button", { name: "Market Cap Controls" })).toBeInTheDocument();
    });

    it("forces a manual market cap refresh from settings", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    activeMarketSource: "csfloat",
                    activeAIProvider: "gemini-pro",
                    priceRefreshIntervalMin: 15,
                    openAiApiKey: "",
                    geminiApiKey: "",
                    csfloatApiKey: "",
                    csgotraderSubProvider: "csfloat",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    data: {
                        totalMarketCap: 5774762257,
                    },
                }),
            });
        vi.stubGlobal("fetch", fetchMock);

        render(<SettingsPage />);

        const button = await screen.findByRole("button", { name: "Market Cap Controls" });
        fireEvent.click(button);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/market/market-cap-sync", { method: "POST" });
        });

        expect(await screen.findByText("$5,774,762,257 refreshed successfully.")).toBeInTheDocument();
    });
});
