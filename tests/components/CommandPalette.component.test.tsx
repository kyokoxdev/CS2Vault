/** @vitest-environment jsdom */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "../setup-component";
import CommandPalette from "../../src/components/ui/CommandPalette";

vi.mock("react-icons/fa", () => ({
    FaSearch: () => <span data-testid="icon-search">search-icon</span>,
}));

const mockResults = [
    {
        id: "item-redline-ft",
        hashName: "AK-47 | Redline (Field-Tested)",
        name: "AK-47 Redline",
        imageUrl: null,
        price: "$28.50",
        listings: 152,
        category: "weapon",
        type: "Rifle",
        rarity: "Classified",
        exterior: "Field-Tested",
        steamType: "Rifle",
    },
    {
        id: "item-dragon-lore-fn",
        hashName: "AWP | Dragon Lore (Factory New)",
        name: "AWP Dragon Lore",
        imageUrl: null,
        price: "$1800.00",
        listings: 8,
        category: "weapon",
        type: "Sniper Rifle",
        rarity: "Covert",
        exterior: "Factory New",
        steamType: "Sniper Rifle",
    },
];

function mockFetchSuccess(results: typeof mockResults) {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { results } }),
    });
}

function createDeferredResponse(results: typeof mockResults) {
    let resolveJson: (() => void) | undefined;
    const json = vi.fn(() => new Promise((resolve) => {
        resolveJson = () => resolve({ success: true, data: { results } });
    }));

    return {
        response: Promise.resolve({ ok: true, json }),
        resolve() {
            resolveJson?.();
        },
    };
}

describe("CommandPalette", () => {
    beforeEach(() => {
        mockFetchSuccess([]);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("renders nothing when closed", () => {
        const { container } = render(
            <CommandPalette isOpen={false} onClose={vi.fn()} onSelect={vi.fn()} />
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders palette when open with correct testids", () => {
        render(
            <CommandPalette isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />
        );
        expect(screen.getByTestId("item-command-palette")).toBeInTheDocument();
        expect(screen.getByTestId("item-command-input")).toBeInTheDocument();
    });

    it("focuses input when opened", async () => {
        const { rerender } = render(
            <CommandPalette isOpen={false} onClose={vi.fn()} onSelect={vi.fn()} />
        );
        rerender(
            <CommandPalette isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />
        );

        await waitFor(() => {
            expect(screen.getByTestId("item-command-input")).toHaveFocus();
        });
    });

    it("fetches and displays search results", async () => {
        mockFetchSuccess(mockResults);

        render(
            <CommandPalette isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />
        );

        const input = screen.getByTestId("item-command-input");
        fireEvent.change(input, { target: { value: "AK" } });

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith("/api/search?q=AK");
        });

        await waitFor(() => {
            const results = screen.getAllByTestId("item-command-result");
            expect(results.length).toBe(2);
        });

        expect(screen.getByRole("combobox")).toHaveAttribute(
            "aria-activedescendant",
            "command-result-0"
        );
    });

    it("shows empty state when no results found", async () => {
        mockFetchSuccess([]);

        render(
            <CommandPalette isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />
        );

        const input = screen.getByTestId("item-command-input");
        fireEvent.change(input, { target: { value: "XYZ" } });

        await waitFor(() => {
            expect(screen.getByText(/No items found/)).toBeInTheDocument();
        });
    });

    it("navigates with ArrowDown and ArrowUp", async () => {
        mockFetchSuccess(mockResults);

        render(
            <CommandPalette isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />
        );

        const input = screen.getByTestId("item-command-input");
        fireEvent.change(input, { target: { value: "AK" } });

        await waitFor(() => {
            expect(screen.getAllByTestId("item-command-result").length).toBe(2);
        });

        const results = screen.getAllByTestId("item-command-result");

        expect(results[0]).toHaveAttribute("data-active", "true");
        expect(results[1]).toHaveAttribute("data-active", "false");

        fireEvent.keyDown(input, { key: "ArrowDown" });
        expect(results[0]).toHaveAttribute("data-active", "false");
        expect(results[1]).toHaveAttribute("data-active", "true");

        fireEvent.keyDown(input, { key: "ArrowUp" });
        expect(results[0]).toHaveAttribute("data-active", "true");
        expect(input).toHaveAttribute("aria-activedescendant", "command-result-0");
    });

    it("selects with Enter and calls onSelect with correct payload", async () => {
        mockFetchSuccess(mockResults);

        const onSelect = vi.fn();
        const onClose = vi.fn();

        render(
            <CommandPalette isOpen={true} onClose={onClose} onSelect={onSelect} />
        );

        const input = screen.getByTestId("item-command-input");
        fireEvent.change(input, { target: { value: "AK" } });

        await waitFor(() => {
            expect(screen.getAllByTestId("item-command-result").length).toBe(2);
        });

        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(onSelect).toHaveBeenCalledWith({
            id: "item-dragon-lore-fn",
            hashName: "AWP | Dragon Lore (Factory New)",
            name: "AWP Dragon Lore",
            imageUrl: null,
            category: "weapon",
            rarity: "Covert",
            exterior: "Factory New",
            type: "Sniper Rifle",
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes and calls onClose on Escape", () => {
        const onClose = vi.fn();
        render(
            <CommandPalette isOpen={true} onClose={onClose} onSelect={vi.fn()} />
        );

        const input = screen.getByTestId("item-command-input");
        fireEvent.keyDown(input, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes on backdrop click", () => {
        const onClose = vi.fn();
        render(
            <CommandPalette isOpen={true} onClose={onClose} onSelect={vi.fn()} />
        );

        const overlay = screen.getByTestId("item-command-palette");
        fireEvent.mouseDown(overlay);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("navigates with Home and End keys", async () => {
        mockFetchSuccess(mockResults);

        render(
            <CommandPalette isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />
        );

        const input = screen.getByTestId("item-command-input");
        fireEvent.change(input, { target: { value: "AK" } });

        await waitFor(() => {
            expect(screen.getAllByTestId("item-command-result").length).toBe(2);
        });

        fireEvent.keyDown(input, { key: "ArrowDown" });

        fireEvent.keyDown(input, { key: "End" });
        const results = screen.getAllByTestId("item-command-result");
        expect(results[1]).toHaveAttribute("data-active", "true");

        fireEvent.keyDown(input, { key: "Home" });
        expect(results[0]).toHaveAttribute("data-active", "true");
    });

    it("selects result on click", async () => {
        mockFetchSuccess(mockResults);

        const onSelect = vi.fn();
        const onClose = vi.fn();

        render(
            <CommandPalette isOpen={true} onClose={onClose} onSelect={onSelect} />
        );

        const input = screen.getByTestId("item-command-input");
        fireEvent.change(input, { target: { value: "AK" } });

        await waitFor(() => {
            expect(screen.getAllByTestId("item-command-result").length).toBe(2);
        });

        const results = screen.getAllByTestId("item-command-result");
        fireEvent.click(results[0]);

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not show results for queries shorter than 2 characters", () => {
        render(
            <CommandPalette isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />
        );

        const input = screen.getByTestId("item-command-input");
        fireEvent.change(input, { target: { value: "A" } });

        expect(screen.queryByTestId("item-command-result")).not.toBeInTheDocument();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("ignores stale responses from earlier searches", async () => {
        vi.useFakeTimers();

        const first = createDeferredResponse([mockResults[0]]);
        const second = createDeferredResponse([mockResults[1]]);
        global.fetch = vi
            .fn()
            .mockImplementationOnce(() => first.response)
            .mockImplementationOnce(() => second.response);

        render(
            <CommandPalette isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />
        );

        const input = screen.getByTestId("item-command-input");
        fireEvent.change(input, { target: { value: "AK" } });
        await act(async () => {
            vi.advanceTimersByTime(300);
            await Promise.resolve();
        });

        fireEvent.change(input, { target: { value: "AW" } });
        await act(async () => {
            vi.advanceTimersByTime(300);
            await Promise.resolve();
        });

        await act(async () => {
            second.resolve();
            await Promise.resolve();
        });

        expect(screen.getByText("AWP Dragon Lore")).toBeInTheDocument();

        await act(async () => {
            first.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.getByText("AWP Dragon Lore")).toBeInTheDocument();
        expect(screen.queryByText("AK-47 Redline")).not.toBeInTheDocument();
    });

    it("clears and invalidates in-flight results when query becomes shorter than 2 characters", async () => {
        vi.useFakeTimers();

        const pending = createDeferredResponse([mockResults[0]]);
        global.fetch = vi.fn().mockImplementationOnce(() => pending.response);

        render(
            <CommandPalette isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />
        );

        const input = screen.getByTestId("item-command-input");

        fireEvent.change(input, { target: { value: "AK" } });
        await act(async () => {
            vi.advanceTimersByTime(300);
            await Promise.resolve();
        });

        expect(global.fetch).toHaveBeenCalledWith("/api/search?q=AK");

        fireEvent.change(input, { target: { value: "A" } });

        expect(screen.getByText("Type at least 2 characters to search")).toBeInTheDocument();
        expect(screen.queryByTestId("item-command-result")).not.toBeInTheDocument();

        await act(async () => {
            pending.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.getByText("Type at least 2 characters to search")).toBeInTheDocument();
        expect(screen.queryByText("AK-47 Redline")).not.toBeInTheDocument();
        expect(screen.queryByTestId("item-command-result")).not.toBeInTheDocument();
    });
});
