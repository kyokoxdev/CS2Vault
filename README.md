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
- **Database**: SQLite via [Prisma](https://prisma.io) + [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
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

# Generate Prisma client and create database
npx prisma generate
npx prisma db push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | SQLite path (default: `file:./dev.db`) |
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
npm run dev        # Start dev server
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
npm run test       # Run Vitest tests
```

## Deployment

### Vercel

> **Note**: This app uses SQLite (`better-sqlite3`) which requires a persistent filesystem. Vercel's serverless functions don't support local file storage. For Vercel deployment, you'll need to either:
> 1. Migrate to [Turso](https://turso.tech/) (SQLite-compatible cloud database) or PostgreSQL via Prisma
> 2. Use the [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) or external database

For a VPS/self-hosted deployment (Railway, Fly.io, etc.), the app works as-is.

### Build Configuration

If you encounter OOM errors during build:

```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

## License

MIT
