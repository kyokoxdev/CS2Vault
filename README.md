<div align="center">

# CS2Vault

**Market Intelligence Dashboard for Counter-Strike 2**

[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2.3-blue?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.4.1-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![Turso](https://img.shields.io/badge/Turso-libSQL-00D9FF?style=flat-square)](https://turso.tech/)
[![License: GNU GPLv3](https://img.shields.io/badge/license-%20%20GNU%20GPLv3%20-green?style=flat-square)](LICENSE)

Track market prices, manage your inventory, and get AI-powered market insights for Counter-Strike 2 items.

[![English](https://img.shields.io/badge/EN-English-blue?style=flat-square)](./README.md) · [![中文](https://img.shields.io/badge/CN-中文-informational?style=flat-square)](./README.zh-CN.md) · [![日本語](https://img.shields.io/badge/JA-日本語-success?style=flat-square)](./README.ja-JP.md) · [![Tiếng Việt](https://img.shields.io/badge/VI-Tiếng%20Việt-orange?style=flat-square)](./README.vi-VN.md)

[Features](#features) · [Getting Started](#getting-started) · [Data Synchronization](#data-synchronization) · [Scripts](#scripts) · [Deployment](#deployment) · [License](#license)

</div>

---

## Features

| Feature | Description |
|---------|-------------|
| **Market Overview** | Real-time price tracking with CSFloat, Pricempire, and Steam Community Market API. |
| **Portfolio Tracker** | Manage your CS2 inventory, monitor assets value, purchase history, and margins. |
| **Top Movers** | Track items experiencing the largest price gains or losses in short/long intervals. |
| **Aegis Chat** | AI-powered market analysis using Google Gemini, OpenAI GPT, Anthropic Claude, OpenRouter, or 9Router. |
| **News Feed** | Aggregated Counter-Strike economy and market updates via RSS feeds. |
| **Price Analysis** | Interactive candlestick price charts using TradingView Lightweight Charts and technical indicators. |
| **Responsive UI** | Adaptive desktop, tablet, and mobile interface built with CSS Modules. |

---

## Tech Stack

- **Framework**: Next.js 16.1.6 (App Router, React Compiler)
- **UI & Styling**: React 19.2.3, CSS Modules (Design tokens configured in `src/app/globals.css`)
- **Database & ORM**: SQLite (Local development) / Turso (Production libSQL) managed by Prisma 7.4.1 (Generated client in `src/generated/prisma`)
- **Authentication**: NextAuth.js (Steam OpenID)
- **Charts**: TradingView Lightweight Charts & `lightweight-charts-indicators`
- **AI Integrations**: Gemini, OpenAI, Anthropic SDKs, plus OpenRouter and 9Router gateway options

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm, pnpm, or yarn

### Installation & Local Setup

```bash
# Clone the repository
git clone https://github.com/kyokoxdev/CS2Vault.git
cd CS2Vault

# Install dependencies
npm install

# Copy environment variables template and edit values
cp .env.example .env.local

# Generate the Prisma client
npx prisma generate

# Initialize the local SQLite database schema
npx prisma db push

# Seed the default settings and data
npx tsx prisma/seed.ts

# Start the development server
npm run dev
```

The application will run locally at [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

The application reads variables from `.env.local` for local development.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Path to the local SQLite file (default: `file:./dev.db`) |
| `TURSO_DATABASE_URL` | Production | Turso database URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Production | Turso authentication token |
| `CRON_SECRET` | Production | Token to authorize background cron routes |
| `STEAM_API_KEY` | Yes | [Steam Web API Key](https://steamcommunity.com/dev/apikey) |
| `ALLOWED_STEAM_ID` | Yes | Steam64 ID of the user allowed to log in |
| `CSFLOAT_API_KEY` | Yes | [CSFloat API Key](https://csfloat.com/) |
| `PRICEMPIRE_API_KEY` | No | [Pricempire API Key](https://pricempire.com/) |
| `GEMINI_API_KEY` | No | [Google AI Studio API Key](https://aistudio.google.com/apikey) |
| `OPENAI_API_KEY` | No | [OpenAI API Key](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | No | Override default OpenAI model (default: `gpt-4o-mini`) |
| `ANTHROPIC_API_KEY` | No | [Anthropic Console API Key](https://console.anthropic.com/settings/keys) |
| `ANTHROPIC_MODEL` | No | Override default Anthropic model (default: `claude-opus-4-7`) |
| `OPENROUTER_API_KEY` | No | [OpenRouter API Key](https://openrouter.ai/settings/keys) |
| `OPENROUTER_BASE_URL` | No | Base URL for OpenRouter (default: `https://openrouter.ai/api/v1`) |
| `OPENROUTER_MODEL` | No | Override default OpenRouter model (default: `~openai/gpt-latest`) |
| `NINEROUTER_API_KEY` | No | 9Router gateway key |
| `NINEROUTER_BASE_URL` | No | Base URL for 9Router (default: `http://localhost:20128/v1`) |
| `NINEROUTER_MODEL` | No | Override default 9Router model (default: `cc/claude-opus-4-7`) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID (for Gemini OAuth flows) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Yes | App authentication secret (generate with `openssl rand -hex 32`) |
| `NEXTAUTH_URL` | Yes | Hostname URL (default: `http://localhost:3000`) |
| `TOKEN_ENCRYPTION_KEY` | Yes | Symmetric key for encrypting stored database credentials |

---

## Data Synchronization

Data refreshes are split between server-side schedulers and client-side triggers:

1. **Vercel Cron Jobs** (configured in `vercel.json`):
   - `GET /api/sync` runs daily (`0 4 * * *`) to fetch general price updates.
   - `GET /api/market/market-cap-sync` runs daily (`0 8 * * *`) to compute weighted market caps.
2. **External Schedulers** (e.g., cron-job.org):
   - `GET /api/intelligence/run` must be configured in an external cron service to run every 5 minutes with the `CRON_SECRET` authorization header. This handles candidate scanning via CSFloat and validation via Steam Community Market (SCM). To prevent SCM bans, it executes at most 3 validations per run, respecting SCM limits of 19 requests/minute and 950 requests/day.
3. **Browser Refreshes**:
   - The application automatically refreshes watchlist and portfolio metrics while a dashboard tab is active using the interval specified by the `priceRefreshIntervalMin` database setting.
   - Users can manually trigger a market-cap update in the Settings dashboard.

---

## Scripts

Manage the lifecycle using these `npm` commands:

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the local hot-reloading Next.js development server. |
| `npm run build` | Generate Prisma models, run schema migrations/seeding, and compile the Next.js production build. |
| `npm run start` | Start the Next.js production server. |
| `npm run lint` | Run ESLint syntax checking. |
| `npm run test` | Execute Vitest unit and integration tests. |
| `npm run test:watch` | Run Vitest unit tests in interactive watch mode. |
| `npm run db:push:turso` | Push local schema changes and run database seeding against production Turso database. |
| `npm run db:migrate` | Create and apply a new migration locally using SQLite. |
| `npm run db:studio` | Run the Prisma Studio GUI database manager. |

---

## Deployment

### Production: Vercel + Turso

This project relies on Turso to provide SQLite databases over HTTP for serverless deployments.

1. **Set up Turso database**:
   ```bash
   # Install CLI
   curl -sSfL https://get.tur.so/install.sh | bash

   # Create database instance
   turso db create cs2vault

   # Obtain URL and authentication tokens
   turso db show cs2vault --url
   turso db tokens create cs2vault
   ```
2. **Push Schema to Turso**:
   Configure `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in `.env.local`, then push:
   ```bash
   npm run db:push:turso
   ```
3. **Configure Vercel Deployment**:
   - Connect the repository at Vercel.
   - Configure all environment variables in Vercel project settings.
   - Set the Next.js Build Command override:
     ```bash
     prisma generate && npx tsx prisma/push-schema.ts && next build
     ```
   - Deploy.

*Note: If compilation fails due to memory limits, prepend the build command with: `NODE_OPTIONS=--max-old-space-size=4096`*

---

## License

GPL v3
