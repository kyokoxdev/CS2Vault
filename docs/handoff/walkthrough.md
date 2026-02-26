# Phase 5: Portfolio & Inventory Manager — Walkthrough

## What Was Built

### Part A — Auth UI
| File | Change |
|---|---|
| [SessionProvider.tsx](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/components/providers/SessionProvider.tsx) | [NEW] NextAuth session context wrapper |
| [DashboardShell.tsx](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/components/layout/DashboardShell.tsx) | [MODIFY] Sidebar: "Sign in with Steam" → avatar + name + sign out |
| [layout.tsx](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/app/layout.tsx) | [MODIFY] Wrapped in `<SessionProvider>` |

### Part B — Inventory Fetcher & API
| File | Change |
|---|---|
| [steam-inventory.ts](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/lib/inventory/steam-inventory.ts) | [NEW] Fetches CS2 inventory from Steam, parses rarity/exterior/category from tags |
| [/api/inventory](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/app/api/inventory/route.ts) | [NEW] GET list with prices + P&L, POST triggers Steam sync |
| [/api/inventory/[id]](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/app/api/inventory/%5Bid%5D/route.ts) | [NEW] PATCH cost basis, DELETE item |
| [/api/portfolio](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/app/api/portfolio/route.ts) | [NEW] GET aggregated portfolio summary |

### Part C — Portfolio Page
| File | Change |
|---|---|
| [portfolio/page.tsx](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/app/portfolio/page.tsx) | [NEW] Dashboard with summary cards, inventory table, inline cost editing |

## Verification

| Check | Result |
|---|---|
| `next build` | ✅ 0 errors, 18 routes |
| `vitest run` | ✅ 20/20 tests pass |

## How to Test

1. **Restart dev server** (`npm run dev`) — needed since `.env.local` was updated with `ALLOWED_STEAM_ID`
2. **Navigate to Portfolio** — click "💼 Portfolio" in the sidebar
3. **Sync inventory** — click "🔄 Sync from Steam" to pull your CS2 items
4. **Edit cost basis** — click any price in the "Cost Basis" column to enter what you paid
5. **Try Steam login** — click "🎮 Sign in with Steam" in the sidebar footer
