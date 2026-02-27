# CS2Vault — Development Task List

## Phase 0: Planning & Documentation
- [x] Research CS2 market data APIs (Pricempire, CSFloat, Steam)
- [x] Research Steam authentication & inventory APIs
- [x] Research OKX-style UI patterns & TradingView Lightweight Charts
- [x] Research optimal tech stack (Next.js + SQLite + Prisma)
- [x] Research free-tier AI providers (Gemini Flash, GPT-3.5)
- [x] Research CSFloat API docs (listings, pricing, float data)
- [x] Write development roadmap & application specs (v2)
- [x] Get user approval on final plan

## Phase 1: Project Scaffold & Core Infrastructure
- [x] Initialize Next.js 14+ with TypeScript
- [x] Configure Prisma ORM + SQLite database
- [x] Create full database schema (all models)
- [x] Set up project folder structure
- [x] Configure environment variables (Steam key, API keys)
- [x] Build rate-limited API request queue (`api-queue.ts`)

## Phase 2: Data Pipeline & Market Data Engine
- [x] Define `MarketDataProvider` interface (done in Phase 1: `types/index.ts`)
- [x] Implement Pricempire client (`market/pricempire.ts`)
- [x] Implement CSFloat client (`market/csfloat.ts`)
- [x] Implement Steam Market client (`market/steam.ts`)
- [x] Build provider registry with runtime switching (done in Phase 1: `market/registry.ts`)
- [x] Build interval-based sync scheduler (`market/scheduler.ts`)
- [x] Create OHLCV candlestick aggregation (done in Phase 1: `candles/aggregator.ts`)
- [x] Build API routes for items, prices, history, sync

## Phase 3: Authentication & Security
- [x] Implement Steam OpenID 2.0 via NextAuth.js (`auth/steam-openid.ts`, `auth/auth.ts`)
- [x] Create single-user access guard (`auth/guard.ts`)
- [x] Set up session management (JWT, HTTP-only cookies)
- [x] Implement Google OAuth 2.0 for AI access (`auth/google-oauth.ts`)
- [x] Build OAuth token storage with encryption (`auth/encryption.ts`)
- [x] Add Zod validation on all API routes (done in Phase 2)

## Phase 3.5: Foundation Hardening
- [x] Build Next.js auth middleware → migrated to `proxy.ts` (Next.js 16)
- [x] Create primitive smoke-test UI (`/test` page)
- [x] Add structured logger utility (`lib/logger.ts`)
- [x] Write unit tests for critical pure functions:
  - [x] `encryption.ts` — 6 tests
  - [x] `steam.ts` price parser — 8 tests (**found & fixed comma bug**)
  - [x] `steam-openid.ts` SteamID extractor — 6 tests

## Phase 4: Dashboard & Charting UI
- [x] Build app layout shell with sidebar navigation (`DashboardShell.tsx`)
- [x] Create Market Overview page (stats grid + items table)
- [x] Integrate TradingView Lightweight Charts v5 (candlestick)
- [x] Build Item Detail page with chart + stats (`/item/[id]`)
- [x] Implement timeframe selectors (1m → 1W)

## Phase 4.5: Item Search Autocomplete
- [x] Build Steam Market search API endpoint (`/api/search`)
- [x] Create autocomplete dropdown component (`ItemSearch.tsx`)
- [x] Integrate into Market Overview — replaces manual hash name input

## Phase 5: Portfolio & Inventory Manager
- [x] Part A: Auth UI — functional Steam login in sidebar
  - [x] Create SessionProvider wrapper
  - [x] Update DashboardShell with login/logout + avatar
  - [x] Wrap layout.tsx in SessionProvider
- [x] Part B: Inventory Fetcher & API
  - [x] Build Steam inventory fetcher (`lib/inventory/steam-inventory.ts`)
  - [x] Create `/api/inventory` route (GET list, POST sync)
  - [x] Create `/api/inventory/[id]` route (PATCH cost basis, DELETE)
  - [x] Create `/api/portfolio` route (GET summary)
- [x] Part C: Portfolio Dashboard page
  - [x] Summary cards (Total Value, Cost Basis, P&L, Item Count)
  - [x] Inventory table with inline cost editing
  - [x] Steam sync button + empty state

## Phase 5.6: Portfolio Pricing + Filtering + Market Cap
- [x] Filtered totals in Portfolio summary (totals change with active filters)
- [x] Auto price refresh every 5+ minutes for Watchlist
- [x] Auto price refresh every 5+ minutes for Portfolio (prices-only endpoint)
- [x] Market Overview: replace Total Items with Pricempire market cap
- [x] Graceful fallback when Pricempire key missing or API unavailable

## Phase 5.7: Item Type + Rarity Separation + Watchlist Cleanup
- [x] Add `type` field to Item model (Normal/StatTrak/Souvenir)
- [x] Inventory parsing stores Type separately from Rarity
- [x] Search API includes Type and keeps Rarity from Steam type
- [x] Watchlist + Portfolio APIs return Type and Rarity separately
- [x] Watchlist UI shows Type for weapons only; Rarity stays visible
- [x] Portfolio UI shows Type for weapons only; Rarity stays visible
- [x] Remove redundant Watchlist action (keep Unwatch only)

## Phase 5.8: Wear Quality Surfacing (Weapon Only)
- [x] Add wear quality mapping from Exterior (Factory New → Battle-Scarred)
- [x] Portfolio API returns wear quality for weapons
- [x] Portfolio UI shows Wear Quality column for weapons only

## Phase 6: AI Market Agent Chatbot
- [x] Define `AIProvider` interface
- [x] Implement Gemini 3 Pro-Thinking provider (Google OAuth)
- [x] Implement Gemini 2.5 Flash provider (free API key fallback)
- [x] Implement OpenAI GPT-3.5 provider (free fallback)
- [x] Build automatic fallback chain (Pro → Flash → GPT-3.5)
- [x] Build market context builder for AI prompts
- [x] Create chat API route with streaming
- [x] Build chat UI component
- [x] Add conversation persistence

## Phase 6.1: AI Chatbot Enhancements
- [x] Update `MarketContext` type to include full inventory array
- [x] Update context builder to aggregate and inject inventory items by quantity
- [x] Refine system prompts in all AI providers for investment & hold advice
- [x] Update chat API route to accept explicit API provider overrides from client
- [x] Add AI model selector dropdown to `AIChat` UI

## Phase 6.2: AI Vision Integration
- [x] Add `imageData` optional field to `ChatMessageData` interface
- [x] Update `AIChat.tsx` to accept image uploads (file input + paste)
- [x] Add thumbnail preview in Chat UI for uploaded images
- [x] Update `gemini-pro.ts` and `gemini-flash.ts` to parse and send `inlineData` for images
- [x] Update `POST /api/chat` route to accept base64 image strings

## Phase 6.3: UI Fixes & Targeted Historical Insights
- [x] Fix Chat UI image layout (image above text block via flex-column)
- [x] Update `buildMarketContext` to detect requested items from the input query
- [x] Fetch and format 30-day price history for dynamically matched items
- [x] Refine AI prompts to instruct the AI on utilizing the injected historical data

## Phase 6.4: AI Engine Debugging & Context Refinement
- [x] Improve fuzzy item matcher to handle minor user typos (substring overlap checks)
- [x] Add fallback to inject current item price even if 30-day history array is empty
- [x] Update AI Agent prompts to instruct the user if their requested item is untracked

## Phase 6.5: AI Chat Security & Reliability Remediation
- [x] [Critical] XSS mitigation: replace `dangerouslySetInnerHTML` with **react-markdown** safe rendering. Add Vitest tests for script/img injection.
- [x] [Critical] Add auth guard parity: ensure all chat-related endpoints match the auth pattern in `/api/chat`.
- [x] [High] Fix chat history ordering to return most recent 100 messages (not oldest); add Vitest tests.
- [x] [High] Align AI model dropdown labels with Settings; move dropdown near the send button (standard AI chat UX).
- [x] [High] Align AI Chat typography with Dashboard Shell tokens/fonts only (no redesign).
- [x] [Medium] Add message length limits + image upload size limits with user-visible feedback.
- [x] [Medium] Improve chat error UX: replace dev-only error strings (e.g. `.env.local` references) with user-friendly error states.
- [x] [Medium] Add ARIA labels for icon-only buttons and loading indicators.

## Phase 6.6: AI Chat UX & Context Quality
- [x] [High] Add visible loading states for history fetch and streaming response phases.
- [x] [Medium] Add user-facing error state if history load fails (no silent `console.error` only).
- [x] [Medium] Confirm market context builder handles empty datasets gracefully; add Vitest tests.
- [~] [Low] Add optional "clear chat history" UI hook. — Cancelled: deferred

## Phase 6.7: AI Chat Regression QA
- [x] [High] Vitest coverage: **react-markdown** rendering, history ordering, model selector override in chat.
- [x] [Medium] curl-based QA checks: confirm auth guard returns 401 for unauthenticated chat requests.
- [x] [Medium] Build verification: `npm run build` + `npm run test` pass with zero errors.

## Phase 7: Settings & Configuration (Provider Management)
- [x] Extend `AppSettings` Prisma schema with `openAiApiKey`, `geminiApiKey`, and `csfloatApiKey` fields
- [x] Build `/settings` UI page with secure form inputs for API keys and `syncIntervalMin`
- [x] Implement AI Model & Market Data Source toggle UI in Settings
- [x] Create `/api/settings` REST endpoint to fetch and update AppSettings gracefully
- [x] Update `src/lib/ai/init.ts` to prioritize DB API keys over `process.env` fallbacks
- [x] Update `src/lib/market/init.ts` to prioritize DB API keys over `process.env` fallbacks

## Phase 7.1: Application Error Discovery and Resolution
- [x] Fix `DashboardShell.tsx` module resolution crash caused by invalid CSS import
- [x] Run full Next.js production build to identify syntax or resolution errors
- [x] Resolve any remaining compilation blockers

## Phase 7.2: Settings Security & Validation Remediation
- [x] [Critical] Add auth guard to `/api/settings` (match the `/api/chat` auth pattern).
- [x] [Critical] Stop returning plaintext API keys in `/api/settings` GET/PATCH responses (mask to preview only, e.g. `sk-...xxxx`).
- [x] [High] Add Zod validation for PATCH payloads (`syncIntervalMin` range, provider enum values).
- [x] [High] Align AI provider display labels between Settings and AI Chat (single source of truth).
- [x] [Medium] Define and document strategy for provider init refresh when API keys change without server restart.

## Phase 7.3: Settings UX Alignment
- [x] [High] Align Settings page typography, spacing, and color tokens with Dashboard Shell (no redesign; use existing `globals.css` tokens only).
- [x] [High] Fix broken CSS token (`--accent-blue` -> `--accent-primary`) and add missing `.loading` class in `Settings.module.css`.
- [x] [Medium] Add inline validation/help text for API key fields and sync interval input.
- [x] [Medium] Add accessible labels and improve error messaging in Settings form.

## Phase 7.4: Settings Regression QA
- [x] [High] Vitest: auth guard on `/api/settings`, key masking in responses, Zod validation failures.
- [x] [Medium] Smoke test: `GET /api/settings` unauthenticated returns HTTP 401.
- [x] [Medium] Build verification: `npm run build` succeeds with zero TypeScript errors.

## Phase 8: Final Polish & Production Readiness
- [x] [High] OKX-inspired dark theme redesign (globals.css tokens, Card/StatCard/Table primitives)
- [x] [High] Dashboard layout overhaul (CSS Grid stats row, skeleton loaders, smooth transitions)
- [x] [High] Chart components modernization (gradient fills, custom tooltips, no-data states)
- [x] [Medium] Micro-interactions and hover effects (card lifts, button feedback, nav indicators)
- [x] [Medium] Responsive design (mobile nav, fluid grids, touch targets)
- [x] [Medium] Typography and spacing standardization (font scale, section headers)
- [x] [Low] Final UX audit and Playwright QA verification

## Phase 9: Fixes & Improvements
- [x] [High] Fix blank sparkline charts (hourly data grouping)
- [x] [High] Expand Top 5 Movers to full market via Pricempire API
- [x] [High] Fix portfolio value stat to use actual inventory data
- [x] [High] Broaden news sources (HLTV, Reddit, SteamDB, Valve via RSS)
- [x] [Medium] Move news feed to bottom of Market Overview layout
- [x] [Medium] Replace all emoji icons with react-icons
- [x] [High] Full redesign of AI Chat page (OKX dark theme)
- [x] [High] Full redesign of Settings page (OKX dark theme)
- [x] [Medium] Update tests for top-movers and news-feed changes
- [x] [Medium] Final verification: build passes, 146/146 tests pass, deprecated tokens cleaned
