/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import DashboardShell from "../../src/components/layout/DashboardShell";
import UiPreferencesProvider from "@/components/providers/UiPreferencesProvider";
import { UI_PREFERENCES_STORAGE_KEY } from "@/lib/ui/preferences";
import { AEGIS_ITEM_SELECTED_EVENT } from "@/lib/ai/item-mentions";
import { usePathname, useRouter } from "next/navigation";
import "../setup-component";

const searchResults = [
    {
        hashName: "AK-47 | Redline (Field-Tested)",
        id: "item-redline-ft",
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
];

vi.mock("next/navigation", () => ({
    usePathname: vi.fn(),
    useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("next-auth/react", () => ({
    useSession: vi.fn(() => ({ data: null, status: "unauthenticated" })),
    signOut: vi.fn(),
}));

vi.mock("react-icons/fa", () => ({
    FaChartPie: () => <span data-testid="icon-chart">icon</span>,
    FaChartLine: () => <span data-testid="icon-chart-line">icon</span>,
    FaWallet: () => <span data-testid="icon-wallet">icon</span>,
    FaEye: () => <span data-testid="icon-eye">icon</span>,
    FaBoxOpen: () => <span data-testid="icon-box">icon</span>,
    FaRobot: () => <span data-testid="icon-robot">icon</span>,
    FaCog: () => <span data-testid="icon-cog">icon</span>,
    FaSteam: () => <span data-testid="icon-steam">icon</span>,
    FaBars: () => <span data-testid="icon-bars">icon</span>,
    FaTimes: () => <span data-testid="icon-times">icon</span>,
    FaArrowLeft: () => <span data-testid="icon-arrow-left">icon</span>,
    FaSearch: () => <span data-testid="icon-search">icon</span>,
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

describe("DashboardShell", () => {
    let pushMock: ReturnType<typeof vi.fn>;

    function renderShell(children: React.ReactNode = <div>Content</div>) {
        return render(
            <UiPreferencesProvider>
                <DashboardShell>{children}</DashboardShell>
            </UiPreferencesProvider>
        );
    }

    beforeEach(() => {
        pushMock = vi.fn();
        vi.mocked(usePathname).mockReturnValue("/");
        vi.mocked(useRouter).mockReturnValue({ push: pushMock } as never);
        localStorage.clear();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
                const url = String(input);

                if (url.startsWith("/api/search?q=")) {
                    return {
                        ok: true,
                        json: async () => ({
                            success: true,
                            data: { results: searchResults },
                        }),
                    } as Response;
                }

                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        data: {
                            gainers: [
                                { id: "g1", name: "AK-47 | Redline", price: 12.5, change24h: 12.5 },
                            ],
                            losers: [
                                { id: "l1", name: "AWP | Dragon Lore", price: 1000, change24h: -8.3 },
                            ],
                        },
                    }),
                } as Response;
            }) as typeof fetch
        );
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("renders nav links for Market Overview and Portfolio", () => {
        renderShell();

        const marketOverviewElements = screen.getAllByText("Market Overview");
        expect(marketOverviewElements.length).toBeGreaterThan(0);
        expect(marketOverviewElements[0]).toBeInTheDocument();
        expect(screen.getByText("Portfolio")).toBeInTheDocument();
    });

    it("renders Intelligence navigation and page title", () => {
        vi.mocked(usePathname).mockReturnValue("/intelligence");

        renderShell();

        const intelligenceLink = screen.getByRole("link", { name: /Intelligence/ });
        expect(intelligenceLink).toHaveAttribute("href", "/intelligence");
        expect(screen.getByRole("heading", { name: "Intelligence" })).toBeInTheDocument();
    });

    it("renders route descriptions in the shell header", () => {
        vi.mocked(usePathname).mockReturnValue("/watchlist");

        const { rerender } = renderShell();

        expect(screen.getByRole("heading", { name: "Your Watchlist" })).toBeInTheDocument();
        expect(screen.getByText("Track CS2 item prices and market movements")).toBeInTheDocument();

        vi.mocked(usePathname).mockReturnValue("/portfolio");
        rerender(
            <UiPreferencesProvider>
                <DashboardShell>
                    <div>Content</div>
                </DashboardShell>
            </UiPreferencesProvider>
        );

        expect(screen.getByRole("heading", { name: "Your Portfolio" })).toBeInTheDocument();
        expect(screen.getByText("Track your CS2 inventory value and profit/loss")).toBeInTheDocument();

        vi.mocked(usePathname).mockReturnValue("/intelligence");
        rerender(
            <UiPreferencesProvider>
                <DashboardShell>
                    <div>Content</div>
                </DashboardShell>
            </UiPreferencesProvider>
        );

        expect(screen.getByRole("heading", { name: "Intelligence" })).toBeInTheDocument();
        expect(screen.getByText("Advisory signals only")).toBeInTheDocument();

        vi.mocked(usePathname).mockReturnValue("/chat");
        rerender(
            <UiPreferencesProvider>
                <DashboardShell>
                    <div>Content</div>
                </DashboardShell>
            </UiPreferencesProvider>
        );

        expect(screen.getByText("Content")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Aegis" })).not.toBeInTheDocument();
        expect(screen.queryByText("Forecast value, analyze volume, and optimize risk with Aegis.")).not.toBeInTheDocument();
    });

    it("renders a duplicated moving tape from the api and omits removed shell filler", async () => {
        renderShell();

        await waitFor(() => {
            expect(screen.getByTestId("shell-market-ticker-track")).toBeInTheDocument();
        });

        const primaryGroup = screen.getByTestId("shell-market-ticker-group-primary");
        const duplicateGroup = screen.getByTestId("shell-market-ticker-group-duplicate");

        expect(duplicateGroup).toHaveAttribute("aria-hidden", "true");
        expect(screen.getAllByText("AK-47 | Redline")).toHaveLength(2);
        expect(screen.getAllByText("$12.50")).toHaveLength(2);
        expect(screen.getAllByText("+12.50%")).toHaveLength(2);
        expect(screen.getAllByText("approx +$1.39")).toHaveLength(2);
        expect(screen.getAllByText("AWP | Dragon Lore")).toHaveLength(2);
        expect(screen.getAllByText("-8.30%")).toHaveLength(2);
        expect(screen.getAllByText("approx -$90.51")).toHaveLength(2);
        expect(primaryGroup.querySelectorAll("a")).toHaveLength(2);
        duplicateGroup.querySelectorAll("a").forEach((link) => {
            expect(link).toHaveAttribute("tabindex", "-1");
        });
        expect(screen.queryByText("Terminal Shell")).not.toBeInTheDocument();
        expect(screen.queryByText("Counter-Strike market command deck")).not.toBeInTheDocument();
        expect(screen.queryByText("Market Command")).not.toBeInTheDocument();
        expect(screen.queryByText("Primary shell")).not.toBeInTheDocument();
        expect(screen.queryByText("SCM")).not.toBeInTheDocument();
        expect(screen.queryByText("CSFloat")).not.toBeInTheDocument();
        expect(screen.queryByText("Online")).not.toBeInTheDocument();
    });

    it("falls back to approx placeholder when the dollar-change formula is not finite", async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                success: true,
                data: {
                    gainers: [],
                    losers: [{ id: "l2", name: "Broken Mover", price: 50, change24h: -100 }],
                },
            }),
        } as Response);

        renderShell();

        await waitFor(() => {
            expect(screen.getAllByText("Broken Mover")).toHaveLength(2);
        });

        expect(screen.getAllByText("approx --")).toHaveLength(2);
    });

    it("hides the ticker and does not fetch top movers when the market tape preference is disabled", async () => {
        localStorage.setItem(
            UI_PREFERENCES_STORAGE_KEY,
            JSON.stringify({ theme: "dark", marketTapeVisible: false }),
        );

        renderShell();

        await waitFor(() => {
            expect(screen.queryByTestId("shell-market-ticker")).not.toBeInTheDocument();
        });

        expect(fetch).not.toHaveBeenCalled();
    });

    it("renders Sign in with Steam when not authenticated", () => {
        renderShell();

        expect(screen.getByText("Sign in with Steam")).toBeInTheDocument();
    });

    it("renders children in main body", () => {
        renderShell(<div data-testid="child-content">Child Content</div>);

        expect(screen.getByTestId("child-content")).toBeInTheDocument();
        expect(screen.getByText("Child Content")).toBeInTheDocument();
    });

    it("does not render shell for /startup route (just returns children)", () => {
        vi.mocked(usePathname).mockReturnValue("/startup");
        const { container } = renderShell(<div data-testid="child-content">Child Content</div>);

        expect(screen.getByTestId("child-content")).toBeInTheDocument();
        expect(container.querySelector("aside")).not.toBeInTheDocument();
        expect(container.querySelector("nav")).not.toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("keeps the command trigger without shell theme or motion controls", async () => {
        renderShell();

        await waitFor(() => {
            expect(screen.getByTestId("item-command-trigger")).toBeInTheDocument();
        });

        expect(screen.queryByText(/^Theme$/)).not.toBeInTheDocument();
        expect(screen.queryByText(/^Motion$/)).not.toBeInTheDocument();
        expect(screen.queryByText(/^Density$/)).not.toBeInTheDocument();
    });

    it("opens the command palette from Cmd/Ctrl+K and restores focus to the trigger on Escape", async () => {
        renderShell();

        const trigger = await screen.findByTestId("item-command-trigger");
        trigger.focus();

        fireEvent.keyDown(document, { key: "k", metaKey: true });

        const input = await screen.findByTestId("item-command-input");
        expect(input).toHaveFocus();

        fireEvent.keyDown(input, { key: "Escape" });

        await waitFor(() => {
            expect(screen.queryByTestId("item-command-palette")).not.toBeInTheDocument();
        });

        await waitFor(() => {
            expect(trigger).toHaveFocus();
        });
    });

    it("ignores the global shortcut inside form fields", () => {
        render(
            <>
                <input aria-label="external filter" />
                <UiPreferencesProvider>
                    <DashboardShell>
                        <div>Content</div>
                    </DashboardShell>
                </UiPreferencesProvider>
            </>
        );

        const externalInput = screen.getByRole("textbox", { name: "external filter" });
        externalInput.focus();

        fireEvent.keyDown(externalInput, { key: "k", ctrlKey: true });

        expect(screen.queryByTestId("item-command-palette")).not.toBeInTheDocument();
    });

    it("opens the command palette from the marked Aegis textarea on /chat and dispatches item selection instead of navigating", async () => {
        vi.mocked(usePathname).mockReturnValue("/chat");

        const handleSelected = vi.fn();
        window.addEventListener(AEGIS_ITEM_SELECTED_EVENT, handleSelected as EventListener);

        renderShell(
            <textarea
                aria-label="Chat message input"
                data-aegis-command-target="true"
            />
        );

        const composer = screen.getByRole("textbox", { name: "Chat message input" });
        composer.focus();

        fireEvent.keyDown(composer, { key: "k", metaKey: true });

        const input = await screen.findByTestId("item-command-input");
        expect(input).toHaveFocus();

        fireEvent.change(input, { target: { value: "AK" } });

        const result = await screen.findByTestId("item-command-result");
        fireEvent.click(result);

        await waitFor(() => {
            expect(handleSelected).toHaveBeenCalledTimes(1);
        });

        const event = handleSelected.mock.calls[0][0] as CustomEvent;
        expect(event.detail).toMatchObject({
            hashName: "AK-47 | Redline (Field-Tested)",
            id: "item-redline-ft",
        });
        expect(pushMock).not.toHaveBeenCalled();

        window.removeEventListener(AEGIS_ITEM_SELECTED_EVENT, handleSelected as EventListener);
    });

    it("navigates to the selected item id when choosing a tracked search result from the shell modal", async () => {
        renderShell();

        fireEvent.click(await screen.findByTestId("item-command-trigger"));

        const input = await screen.findByTestId("item-command-input");
        fireEvent.change(input, { target: { value: "AK" } });

        const result = await screen.findByTestId("item-command-result");
        fireEvent.click(result);

        expect(pushMock).toHaveBeenCalledWith("/item/item-redline-ft");
    });

    it("does not navigate to a broken item route when the search result is not tracked", async () => {
        vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url.startsWith("/api/search?q=")) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        data: {
                            results: [{ ...searchResults[0], id: null }],
                        },
                    }),
                } as Response;
            }

            return {
                ok: true,
                json: async () => ({
                    success: true,
                    data: { gainers: [], losers: [] },
                }),
            } as Response;
        });

        renderShell();

        fireEvent.click(await screen.findByTestId("item-command-trigger"));

        const input = await screen.findByTestId("item-command-input");
        fireEvent.change(input, { target: { value: "AK" } });

        const result = await screen.findByTestId("item-command-result");
        fireEvent.click(result);

        expect(pushMock).not.toHaveBeenCalled();
    });
});
