<div align="center">

# CS2Vault

**Market Intelligence Dashboard for Counter-Strike 2**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![Turso](https://img.shields.io/badge/Turso-libSQL-00D9FF?style=flat-square)](https://turso.tech/)
[![License: GNU GPLv3](https://img.shields.io/badge/license-%20%20GNU%20GPLv3%20-green?style=flat-square)](LICENSE)

Track prices, manage your inventory, and get AI-powered market insights.

[![English](https://img.shields.io/badge/EN-English-blue?style=flat-square)](./README.md) · [![中文](https://img.shields.io/badge/CN-中文-informational?style=flat-square)](./README.zh-CN.md) · [![日本語](https://img.shields.io/badge/JA-日本語-success?style=flat-square)](./README.ja-JP.md) · [![Tiếng Việt](https://img.shields.io/badge/VI-Tiếng%20Việt-orange?style=flat-square)](./README.vi-VN.md)

[Features](#features) · [Getting Started](#getting-started) · [Deployment](#deployment) · [License](#license)

</div>

---

## Features

| Feature | Description |
|---------|-------------|
| **Market Overview** | Real-time price tracking with CSFloat, Pricempire, and Steam as data sources |
| **Portfolio Management** | Track your CS2 inventory value with historical price data |
| **Top Movers** | See which items are gaining or losing value |
| **Aegis Chat** | Aegis-powered chat using Gemini, OpenAI, Anthropic, OpenRouter, or 9Router |
| **News Feed** | Aggregated CS2 market news via RSS |
| **Item Detail** | Candlestick price charts with TradingView Lightweight Charts |
| **Responsive UI** | Works on desktop, tablet, and mobile |

## Tech Stack

<table>
<tr>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=nextjs" width="48" height="48" alt="Next.js" />
<br>Next.js 16
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=ts" width="48" height="48" alt="TypeScript" />
<br>TypeScript
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=prisma" width="48" height="48" alt="Prisma" />
<br>Prisma
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=sqlite" width="48" height="48" alt="SQLite" />
<br>SQLite/Turso
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=css" width="48" height="48" alt="CSS" />
<br>CSS Modules
</td>
</tr>
</table>

- **Framework**: [Next.js 16](https://nextjs.org) (App Router, React Compiler)
- **Database**: SQLite via [Prisma](https://prisma.io) + [Turso](https://turso.tech/) (libSQL)
- **Auth**: [NextAuth.js](https://next-auth.js.org) (Steam OpenID)
- **Charts**: [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
- **AI**: Google Gemini, OpenAI GPT, Anthropic Claude, OpenRouter, 9Router
- **Styling**: CSS Modules (dark theme, more themes planned)

## Getting Started

### Prerequisites

- Node.js 20+
- npm / pnpm / yarn

### Quick Start

```bash
# Clone the repo
git clone https://github.com/kyokoxdev/CS2Vault.git
cd CS2Vault

# Install dependencies
npm install

# Copy environment template and fill in your keys
cp .env.example .env.local

# Generate Prisma client and create local database
npx prisma generate
npx prisma db push

# Seed default settings
npx tsx prisma/seed.ts

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

<details>
<summary>Click to expand environment variables table</summary>

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path for local dev (default: `file:./dev.db`) |
| `TURSO_DATABASE_URL` | Vercel | Turso database URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Vercel | Turso auth token |
| `CRON_SECRET` | Vercel | Secret for Vercel Cron job auth |
| `STEAM_API_KEY` | Yes | [Steam Web API key](https://steamcommunity.com/dev/apikey) |
| `ALLOWED_STEAM_ID` | Yes | Your Steam64 ID for auth |
| `CSFLOAT_API_KEY` | Yes | [CSFloat API key](https://csfloat.com/) |
| `PRICEMPIRE_API_KEY` | No | [Pricempire API key](https://pricempire.com/) |
| `GEMINI_API_KEY` | No | [Google AI Studio key](https://aistudio.google.com/apikey) |
| `OPENAI_API_KEY` | No | [OpenAI API key](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | No | OpenAI model override (default: `gpt-4o-mini`) |
| `ANTHROPIC_API_KEY` | No | [Anthropic API key](https://console.anthropic.com/settings/keys) |
| `ANTHROPIC_MODEL` | No | Anthropic model override (default: `claude-opus-4-7`) |
| `OPENROUTER_API_KEY` | No | [OpenRouter API key](https://openrouter.ai/settings/keys) |
| `OPENROUTER_BASE_URL` | No | OpenRouter-compatible base URL (default: `https://openrouter.ai/api/v1`) |
| `OPENROUTER_MODEL` | No | OpenRouter model override (default: `~openai/gpt-latest`) |
| `NINEROUTER_API_KEY` | No | Optional 9Router gateway key when local auth is enabled |
| `NINEROUTER_BASE_URL` | No | 9Router OpenAI-compatible gateway URL (default: `http://localhost:20128/v1`) |
| `NINEROUTER_MODEL` | No | 9Router model override (default: `cc/claude-opus-4-7`) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID (for Gemini OAuth flow) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Yes | Generate with `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Yes | App URL (default: `http://localhost:3000`) |
| `TOKEN_ENCRYPTION_KEY` | Yes | Encryption key for stored tokens |

</details>

### Refresh Model

- **Server background sync:** `vercel.json` schedules daily market sync, daily market-cap sync, and 5-minute `GET /api/intelligence/run` checks capped at 3 SCM validations per run.
- **Open-tab refresh:** the app now uses the saved `priceRefreshIntervalMin` setting to refresh homepage, watchlist, and portfolio market data while the browser is open.
- **Manual market-cap refresh:** Settings now includes a `Refresh Market Cap` action that forces a new weighted calculation immediately.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest tests |
| `npm run db:push:turso` | Push schema + seed to Turso |

## Deployment

### Vercel + Turso

This app uses [Turso](https://turso.tech/) as the cloud database for Vercel deployment.

<details>
<summary><strong>1. Set up Turso</strong></summary>

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Create a database
turso db create cs2vault

# Get your credentials
turso db show cs2vault --url
turso db tokens create cs2vault
```

</details>

<details>
<summary><strong>2. Push schema to Turso</strong></summary>

```bash
# Set credentials in .env.local, then:
npm run db:push:turso
```

</details>

<details>
<summary><strong>3. Deploy to Vercel</strong></summary>

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new)
2. Add all environment variables from `.env.example` in the Vercel dashboard
3. Set the build command override: `npx prisma generate && next build`
4. Deploy

</details>

<details>
<summary><strong>4. Cron and refresh behavior</strong></summary>

The `vercel.json` configures daily `GET /api/sync` (`0 4 * * *`), daily `GET /api/market/market-cap-sync` (`0 8 * * *`), and 5-minute `GET /api/intelligence/run` (`*/5 * * * *`) cron jobs. On cron-authenticated requests, the intelligence runner keeps SCM usage to 3 validations per run while enforcing the 19/minute and 950/day safety caps. Set `CRON_SECRET` in Vercel so cron requests are authorized.

If your Vercel plan does not support 5-minute cron, run `/api/intelligence/run` from an external scheduler with the same `CRON_SECRET`. Open sessions still refresh market data client-side through `Browser Refresh Interval (Minutes)`, and Settings can force a market-cap refresh on demand.

</details>

### Local Development

For local development, the app uses a local SQLite file (`dev.db`) automatically — no Turso needed.

### Build Configuration

If you encounter OOM errors during build:

```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

---

<div align="center">

## License

GPL v3

</div>
