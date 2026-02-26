# Phase 5: Portfolio & Inventory Manager

Wires up Steam login in the UI, adds inventory syncing from Steam, and builds a portfolio dashboard with P&L tracking.

## Part A — Auth UI (Sidebar Login)

The backend auth flow is fully built (Phase 3) but the sidebar shows static "Guest / Not signed in" text. We need to make it functional.

#### [NEW] [SessionProvider.tsx](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/components/providers/SessionProvider.tsx)

Wraps the app with NextAuth's `SessionProvider` so client components can access session state via `useSession()`.

#### [MODIFY] [DashboardShell.tsx](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/components/layout/DashboardShell.tsx)

- **Signed out**: Show "Sign in with Steam" button → links to `/api/auth/steam/login`
- **Signed in**: Show Steam avatar + display name, plus a "Sign out" button
- Uses `useSession()` to read auth state

#### [MODIFY] [layout.tsx](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/app/layout.tsx)

Wrap children in `<SessionProvider>`.

---

## Part B — Inventory Fetcher & API

#### [NEW] [steam-inventory.ts](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/lib/inventory/steam-inventory.ts)

Fetches user's CS2 inventory from Steam's public endpoint:
GET https://steamcommunity.com/inventory/{steamId}/730/2?l=english&count=5000

- Parses asset descriptions (name, icon, type, market hash name)
- Rate-limited through `steamQueue`
- Returns structured array of inventory items

#### [NEW] [route.ts](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/app/api/inventory/route.ts)

| Method | Description |
|---|---|
| `GET` | List user's inventory items (joined with `Item` for current prices) |
| `POST` | Trigger full inventory sync from Steam → upserts `InventoryItem` records |

#### [NEW] [route.ts](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/app/api/inventory/[id]/route.ts)

| Method | Description |
|---|---|
| `PATCH` | Update cost basis (`acquiredPrice`, `soldPrice`, `soldAt`) |
| `DELETE` | Remove an inventory item |

#### [NEW] [route.ts](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/app/api/portfolio/route.ts)

`GET` — Aggregated portfolio summary: total current value, total cost basis, unrealized P&L ($ and %), per-item breakdown with latest prices.

---

## Part C — Portfolio Page

#### [NEW] [page.tsx](file:///c:/Users/ADMIN/Documents/root/cs2vault/src/app/portfolio/page.tsx)

- **Summary cards row**: Total Value, Cost Basis, Unrealized P&L, Item Count
- **Inventory table**: Image, name, rarity badge, current price, acquired price, P&L, float value
- **Inline cost editing**: Click acquired/sold price to edit directly in the table
- **Sync button**: "Sync from Steam" triggers POST `/api/inventory` and refreshes
- **Empty state**: Friendly message with sync CTA when no inventory items exist

> [!IMPORTANT]
> In development (no Steam login), the inventory sync will use `ALLOWED_STEAM_ID` from `.env` as a fallback. In production, it uses the session's Steam ID.

## Verification Plan

### Automated
- `npx next build` — 0 errors
- `npx vitest run` — all pass

### Manual
- Click "Sign in with Steam" → redirected to Steam → returns logged in (avatar + name visible)
- Click "Sync from Steam" → inventory items populate the table
- Edit cost basis on an item → P&L updates correctly
- Portfolio summary cards show accurate totals
