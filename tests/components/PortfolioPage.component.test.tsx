// @vitest-environment jsdom
import "../setup-component";

import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioPage from "@/app/portfolio/page";

const mockPush = vi.fn();
const mockAddToast = vi.fn();
const mockUpdateToast = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/components/providers/ToastProvider", () => ({
  useToast: () => ({ addToast: mockAddToast, updateToast: mockUpdateToast }),
}));

vi.mock("@/hooks/usePriceRefreshInterval", () => ({
  usePriceRefreshInterval: () => 15,
}));

vi.mock("@/hooks/useSmartRefresh", () => ({
  useSmartRefresh: () => undefined,
  markRefreshed: vi.fn(),
}));

vi.mock("@/hooks/useStaleAwareRefresh", () => ({
  useStaleAwareRefresh: () => undefined,
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useReducedMotion: () => false,
}));

vi.mock("@/components/ui/FallbackToast", () => ({
  FallbackToast: () => null,
}));

vi.mock("@/components/ui/Badge", () => ({
  Badge: ({ children }: { children: string }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/StatCard", () => ({
  StatCard: ({ label, value }: { label: string; value: string | number }) => (
    <div data-testid={`stat-${label}`}>{`${label}:${value}`}</div>
  ),
}));

interface MockDataRow {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface MockColumn {
  key: string;
  header: ReactNode;
  render?: (value: unknown, row: MockDataRow) => ReactNode;
}

vi.mock("@/components/ui/DataTable", () => ({
  DataTable: ({ columns, data, emptyMessage }: { columns: MockColumn[]; data: MockDataRow[]; emptyMessage: string }) => (
    <div data-testid="data-table">
      <div data-testid="mock-row-count">{data.length}</div>
      <div>
        {columns.map((column) => (
          <span key={column.key}>{column.header}</span>
        ))}
      </div>
      {data.length === 0 ? (
        <div>{emptyMessage}</div>
      ) : (
        data.map((row) => (
          <div key={row.id} data-testid="mock-row">
            <span>{row.name}</span>
            {columns.map((column) => column.render ? (
              <span key={`${row.id}-${column.key}`}>{column.render(row[column.key], row)}</span>
            ) : null)}
          </div>
        ))
      )}
      <div data-testid="data-table-card-toggle" />
      <div data-testid="data-table-grid-toggle" />
      <div data-testid="data-table-mobile-card-list" />
    </div>
  ),
}));

interface MockPortfolioItem {
  id: string;
  itemId: string;
  assetId: string;
  name: string;
  marketHashName: string;
  category: string;
  type: string | null;
  rarity: string | null;
  exterior: string | null;
  imageUrl: string | null;
  currentPrice: number;
  acquiredPrice: number | null;
  pnl: number | null;
  pnlPercent: number | null;
  floatValue: number | null;
  wearQuality: string | null;
  acquiredAt: string;
  isWatched: boolean;
}

function createPortfolioItem(index: number, overrides: Partial<MockPortfolioItem> = {}): MockPortfolioItem {
  const currentPrice = 500 - index * 17;
  const acquiredPrice = currentPrice - 25;

  return {
    id: `inventory-${index}`,
    itemId: `item-${index}`,
    assetId: `asset-${index}`,
    name: `Exposure Item ${index}`,
    marketHashName: `Exposure Item ${index} | FN`,
    category: index % 3 === 0 ? "weapon" : index % 3 === 1 ? "knife" : "glove",
    type: index % 3 === 0 ? "Rifle" : null,
    rarity: index % 2 === 0 ? "Covert" : "Classified",
    exterior: "Factory New",
    imageUrl: null,
    currentPrice,
    acquiredPrice,
    pnl: currentPrice - acquiredPrice,
    pnlPercent: ((currentPrice - acquiredPrice) / acquiredPrice) * 100,
    floatValue: null,
    wearQuality: index % 3 === 0 ? "Factory New" : null,
    acquiredAt: "2026-06-01T00:00:00.000Z",
    isWatched: false,
    ...overrides,
  };
}

const baseItems = Array.from({ length: 14 }, (_, index) => createPortfolioItem(index + 1));
const filteredItem = createPortfolioItem(99, {
  name: "Dragon Lore",
  marketHashName: "Dragon Lore | Factory New",
  currentPrice: 999,
  acquiredPrice: 750,
  pnl: 249,
  pnlPercent: 33.2,
  category: "weapon",
});

const soldItems = [
  {
    id: "sold-1",
    itemId: "sold-item-1",
    assetId: "sold-asset-1",
    name: "Sold Line",
    marketHashName: "Sold Line | FT",
    category: "weapon",
    rarity: "Restricted",
    exterior: "Field-Tested",
    imageUrl: null,
    acquiredPrice: 120,
    soldPrice: 168,
    realizedPnl: 48,
    pnlPercent: 40,
    acquiredAt: "2026-05-01T00:00:00.000Z",
    soldAt: "2026-06-01T00:00:00.000Z",
  },
];

function makePortfolioResponse(items: MockPortfolioItem[]) {
  const totalCurrentValue = items.reduce((sum, item) => sum + item.currentPrice, 0);
  const totalAcquiredValue = items.reduce((sum, item) => sum + (item.acquiredPrice ?? 0), 0);
  const unrealizedPnL = items.reduce((sum, item) => sum + (item.pnl ?? 0), 0);

  return {
    success: true,
    data: {
      totalCurrentValue,
      totalAcquiredValue,
      hasAnyCostBasis: true,
      unrealizedPnL,
      unrealizedPnLPercent: totalAcquiredValue > 0 ? (unrealizedPnL / totalAcquiredValue) * 100 : null,
      itemCount: items.length,
      filteredCount: items.length,
      items,
      filteredTotals: {
        totalCurrentValue,
        totalAcquiredValue,
        hasAnyCostBasis: true,
        unrealizedPnL,
        unrealizedPnLPercent: totalAcquiredValue > 0 ? (unrealizedPnL / totalAcquiredValue) * 100 : null,
      },
      filterOptions: {
        categories: ["weapon", "knife", "glove"],
        rarities: ["Covert", "Classified", "Restricted"],
      },
      lastPriceUpdate: "2026-06-04T00:00:00.000Z",
    },
  };
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

describe("PortfolioPage", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockAddToast.mockReset();
    mockUpdateToast.mockReset();

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(getRequestUrl(input), "http://localhost");

      if (url.pathname === "/api/portfolio/sold") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              totalSoldValue: 168,
              totalAcquiredValue: 120,
              hasAnyCostBasis: true,
              totalRealizedPnL: 48,
              realizedPnLPercent: 40,
              soldCount: soldItems.length,
              items: soldItems,
            },
          }),
        } as Response;
      }

      if (url.pathname === "/api/portfolio") {
        const search = url.searchParams.get("search");

        return {
          ok: true,
          json: async () => search === "Dragon Lore"
            ? makePortfolioResponse([filteredItem])
            : makePortfolioResponse(baseItems),
        } as Response;
      }

      throw new Error(`Unhandled fetch: ${url.pathname}${url.search}`);
    }) as typeof fetch);
  });

  it("preserves allocation, concentration, and holdings widgets alongside the active table", async () => {
    render(<PortfolioPage />);

    expect(await screen.findByTestId("portfolio-exposure-summary")).toBeInTheDocument();
    expect(screen.getByText("Allocation Map")).toBeInTheDocument();
    expect(screen.getByText("Largest holding")).toBeInTheDocument();
    expect(screen.getByText("Top 3 concentration")).toBeInTheDocument();
    expect(screen.getByText("Priced coverage")).toBeInTheDocument();
    expect(screen.getByTestId("portfolio-exposure-treemap")).toBeInTheDocument();
    expect(screen.getByTestId("portfolio-treemap")).toBeInTheDocument();
    expect(screen.getByTestId("portfolio-exposure-mobile")).toBeInTheDocument();
    expect(screen.getByText("Other Positions")).toBeInTheDocument();
    expect(screen.getByText("Allocation Map")).toBeInTheDocument();
    expect(screen.getByText("Largest category")).toBeInTheDocument();
    expect(screen.getByText("Risk posture")).toBeInTheDocument();
    expect(screen.getByText("Top holdings")).toBeInTheDocument();
    expect(screen.getAllByTestId("portfolio-exposure-node").length).toBeLessThanOrEqual(12);
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
  });

  it("keeps filter and table workflows functional when search is applied", async () => {
    render(<PortfolioPage />);

    expect(await screen.findByTestId("mock-row-count")).toHaveTextContent("14");
    expect(screen.getAllByText("Filters").length).toBeGreaterThan(0);
    expect(screen.getByText("All prices")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search items"), {
      target: { value: "Dragon Lore" },
    });
    fireEvent.click(screen.getByText("Apply"));

    await waitFor(() => {
      expect(screen.getByTestId("mock-row-count")).toHaveTextContent("1");
    });
    expect(screen.getAllByText("Dragon Lore").length).toBeGreaterThan(0);

    const portfolioCalls = vi.mocked(fetch).mock.calls
      .map(([input]) => getRequestUrl(input))
      .filter((url) => url.startsWith("/api/portfolio"));

    expect(portfolioCalls.some((url) => url.includes("search=Dragon+Lore") || url.includes("search=Dragon%20Lore"))).toBe(true);
  });

  it("preserves sold tab access and sold table rendering", async () => {
    render(<PortfolioPage />);

    await screen.findByTestId("portfolio-exposure-summary");
    expect(screen.getByText("Top holdings")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /sold/i }));

    expect(await screen.findByTestId("stat-Items Sold")).toHaveTextContent("Items Sold:1");
    expect(screen.getAllByText("Sold Line").length).toBeGreaterThan(0);
    expect(screen.getByText("Sold Price")).toBeInTheDocument();
  });

  it("updates every duplicate portfolio row that shares the toggled item id", async () => {
    const duplicateItems = [
      createPortfolioItem(1, { id: "inventory-a", itemId: "shared-item", name: "Shared Copy A", isWatched: false }),
      createPortfolioItem(2, { id: "inventory-b", itemId: "shared-item", name: "Shared Copy B", isWatched: false }),
    ];

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(getRequestUrl(input), "http://localhost");

      if (url.pathname === "/api/portfolio/sold") {
        return {
          ok: true,
          json: async () => ({ success: true, data: { totalSoldValue: 0, totalAcquiredValue: 0, hasAnyCostBasis: false, totalRealizedPnL: 0, realizedPnLPercent: null, soldCount: 0, items: [] } }),
        } as Response;
      }

      if (url.pathname === "/api/portfolio") {
        return {
          ok: true,
          json: async () => makePortfolioResponse(duplicateItems),
        } as Response;
      }

      if (url.pathname === "/api/items/shared-item") {
        return {
          ok: true,
          json: async () => ({ success: true, data: { isWatched: true } }),
        } as Response;
      }

      throw new Error(`Unhandled fetch: ${url.pathname}${url.search}`);
    });

    render(<PortfolioPage />);

    await screen.findAllByText("Shared Copy A");
    fireEvent.click(screen.getAllByRole("button", { name: "Item actions" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: /Add to Watchlist/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Item actions" })).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Item actions" })[1]);
    expect(screen.getByRole("menuitem", { name: /Remove from Watchlist/i })).toBeInTheDocument();
  });
});
