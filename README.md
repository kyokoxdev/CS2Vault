# CS2Vault

Market intelligence dashboard for Counter-Strike 2 items. Track prices, manage your inventory, and get AI-powered market insights.

## Features

- **Market Overview** — Real-time price tracking with CSFloat, Pricempire, and Steam as data sources
- **Portfolio Management** — Track your CS2 inventory value with historical price data
- **Top Movers** — See which items are gaining or losing value
- **AI Chat** — Market analysis powered by Google Gemini and OpenAI
- **News Feed** — Aggregated CS2 market news via RSS
- **Item Detail** — Candlestick price charts with TradingView Lightweight Charts
- **Responsive UI** — Works on desktop, tablet, and mobile

## Tech Stack

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

### Setup

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

Copy `.env.example` to `.env.local` and fill in your values:

| Variable | Required | Description |
|---|---|---|
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

### Scripts

```bash
npm run dev            # Start dev server
npm run build          # Production build
npm run start          # Start production server
npm run lint           # Run ESLint
npm run test           # Run Vitest tests
npm run db:push:turso  # Push schema + seed to Turso
```

## Deployment

### Vercel + Turso

This app uses [Turso](https://turso.tech/) as the cloud database for Vercel deployment.

#### 1. Set up Turso

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Create a database
turso db create cs2vault

# Get your credentials
turso db show cs2vault --url
turso db tokens create cs2vault
```

#### 2. Push schema to Turso

```bash
# Set credentials in .env.local, then:
npm run db:push:turso
```

#### 3. Deploy to Vercel

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new)
2. Add all environment variables from `.env.example` in the Vercel dashboard
3. Set the build command override: `npx prisma generate && next build`
4. Deploy

#### 4. Cron (automatic price sync)

The `vercel.json` configures a cron job that hits `GET /api/sync` every 5 minutes. It uses the `CRON_SECRET` env var for authentication. Make sure to set `CRON_SECRET` in Vercel.

### Local Development

For local development, the app uses a local SQLite file (`dev.db`) automatically — no Turso needed.

### Build Configuration

If you encounter OOM errors during build:

```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

## License

MIT
