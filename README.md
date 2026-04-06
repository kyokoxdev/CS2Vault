<div align="center">

# CS2Vault

**Market Intelligence Dashboard for Counter-Strike 2**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![Turso](https://img.shields.io/badge/Turso-libSQL-00D9FF?style=flat-square)](https://turso.tech/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

Track prices, manage your inventory, and get AI-powered market insights.

Current release: **v0.4.0**

[Features](#features) · [Getting Started](#getting-started) · [Deployment](#deployment) · [License](#license)

</div>

---

## Features

| Feature | Description |
|---------|-------------|
| **Market Overview** | Real-time price tracking with CSFloat, Pricempire, and Steam as data sources |
| **Portfolio Management** | Track your CS2 inventory value with historical price data |
| **15-Minute Browser Refresh** | Refresh dashboard, watchlist, and portfolio prices from the saved settings interval while tabs stay open |
| **Manual Market Cap Refresh** | Trigger a fresh weighted market-cap calculation directly from Settings |
| **Top Movers** | See which items are gaining or losing value |
| **AI Chat** | Market analysis powered by Google Gemini and OpenAI |
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
- **AI**: Google Gemini, OpenAI GPT
- **Styling**: CSS Modules (dark theme, OKX-inspired design system)

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
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID (for Gemini OAuth flow) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Yes | Generate with `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Yes | App URL (default: `http://localhost:3000`) |
| `TOKEN_ENCRYPTION_KEY` | Yes | Encryption key for stored tokens |

</details>

### Refresh Model

- **Server background sync:** Vercel Hobby cron is limited to the daily `GET /api/sync` job configured in `vercel.json`.
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

The `vercel.json` configures a cron job that hits `GET /api/sync` once per day (`0 0 * * *`). On cron-authenticated requests, this endpoint runs both the regular sync pipeline and market-cap recalculation (when stale). Set `CRON_SECRET` in Vercel so the cron request is authorized.

For Vercel Hobby deployments, this daily cron remains the only server-side scheduler. To get more frequent updates, set `Browser Refresh Interval (Minutes)` in Settings (for example `15`). Open sessions will then refresh market data client-side every 15 minutes, and you can use the Settings page to force a market-cap refresh on demand.

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

MIT © [kyokoxdev](https://github.com/kyokoxdev)

</div>
