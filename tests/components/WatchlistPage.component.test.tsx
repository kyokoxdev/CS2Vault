/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "../setup-component";
import WatchlistPage from "@/app/watchlist/page";

const addToast = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/providers/ToastProvider", () => ({
  useToast: () => ({ addToast }),
}));

vi.mock("@/hooks/usePriceRefreshInterval", () => ({
  usePriceRefreshInterval: () => 30,
}));

vi.mock("@/hooks/useSmartRefresh", () => ({
  markRefreshed: vi.fn(),
  useSmartRefresh: vi.fn(),
}));

vi.mock("@/hooks/useStaleAwareRefresh", () => ({
  useStaleAwareRefresh: vi.fn(),
}));

vi.mock("@/components/market/WatchlistTable", () => ({
  WatchlistTable: ({ items }: { items: Array<{ name: string }> }) => (
    <div data-testid="watchlist-table">
      {items.map((item) => (
        <div key={item.name}>{item.name}</div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/market/WatchlistFilters", () => ({
  WatchlistFilters: () => <div data-testid="watchlist-filters" />,
}));

vi.mock("@/components/market/WatchlistGroups", () => ({
  WatchlistGroups: () => <div data-testid="watchlist-groups" />,
}));

vi.mock("@/components/market/AddItemPanel", () => ({
  AddItemPanel: () => <div data-testid="add-item-panel" />,
}));

vi.mock("@/components/ui/FallbackToast", () => ({
  FallbackToast: () => <div data-testid="fallback-toast" />,
}));

const watchedItem = {
  id: "item-1",
  marketHashName: "AK-47 | Redline (Field-Tested)",
  name: "AK-47 | Redline",
  category: "weapon",
  type: "Rifle",
  rarity: "Classified",
  exterior: "Field-Tested",
  imageUrl: null,
  notes: null,
  groups: [],
  isWatched: true,
  currentPrice: 12.34,
  priceChange24h: 0,
  sparkline: [],
  priceSource: "CSFloat",
  lastUpdated: null,
};

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

describe("WatchlistPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addToast.mockClear();
  });

  it("bypasses cached item data after clearing the full watchlist", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/items?limit=100") {
        return jsonResponse({
          success: true,
          data: {
            items: fetchMock.mock.calls.filter(([callInput]) => callInput.toString() === url).length === 1
              ? [watchedItem]
              : [],
            total: fetchMock.mock.calls.filter(([callInput]) => callInput.toString() === url).length === 1 ? 1 : 0,
            lastPriceUpdate: null,
          },
        });
      }

      if (url === "/api/groups") {
        return jsonResponse({ success: true, data: { groups: [] } });
      }

      if (url === "/api/items/bulk") {
        return jsonResponse({ success: true, affected: 1 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WatchlistPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Clear all watched items" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith("Cleared 1 watched item", "success");
    });

    const itemFetches = fetchMock.mock.calls.filter(([input]) => input.toString() === "/api/items?limit=100");
    expect(itemFetches.length).toBeGreaterThanOrEqual(2);
    expect(itemFetches.every(([, init]) => (init as RequestInit).cache === "no-store")).toBe(true);
  });
});
