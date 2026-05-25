# Agent Rules for CS2Vault

Every AI agent must read this file in full before making changes in this repository. Confirm with a short `Understood` message, then follow these rules. They are mandatory and override lower-priority guidance.

## Current Focus

Last updated: 2026-05-21

- CS2Vault is a Next.js 16 / React 19 / strict TypeScript market-intelligence dashboard for Counter-Strike 2 items.
- App Router lives in `src/app`; market logic in `src/lib/market`; intelligence in `src/lib/market/intelligence` plus `/app/intelligence`; charts in `src/components/charts`; tests in `tests` with Playwright e2e in `tests/e2e`.
- Data stack: Prisma 7 generated client in `src/generated/prisma`, SQLite locally, Turso/libSQL in production, custom Turso migration push in `prisma/push-schema.ts`.
- UI stack: CSS Modules, existing design tokens in `globals.css`, TradingView Lightweight Charts, `lightweight-charts-indicators`, `oakscriptjs`, NextAuth Steam auth, Google OAuth for AI provider access, Gemini/OpenAI chat.
- Intelligence cron runs every 5 minutes with a 3-SCM-validation per-run cap, CSFloat scout candidates queued for SCM validation, and SCM safety limits of 19/minute and 950/day.
- Keep this section short. Update it only when architecture, stack, workflows, active priorities, or recurring hazards change. Never include secrets.

## Zero-Tolerance Rules

- Read this file before edits and reference it when it affects a decision.
- Detect intent before acting. Ask one focused question if scope is ambiguous; otherwise confirm the scope and proceed.
- Implement only what the user requested. Do not add adjacent fixes, speculative abstractions, or broad cleanup without approval.
- Logic changes and architecture changes require background explore/research first. Wait for those agents before editing related files and do not duplicate their search manually.
- For 3+ changed files, consult the Plan Agent before implementation. For cross-module work, delegate unless the fix is trivial and local.
- Load relevant available skills before work. If a project-listed skill is unavailable, state that briefly and follow the closest compliant workflow manually.
- For any git command, load `git-master` first and use `GIT_MASTER=1` with the command.
- Always complete the Verification Checklist before handoff. Scale tests/build to the change: run relevant tests for behavior changes and `npm run build` only when runtime, config, dependency, database/generated-code, route/export, or verification needs require it.
- Do not use `as any`, `@ts-ignore`, `@ts-expect-error`, empty catches, failing-test deletion, destructive git commands, commit amend, or force push unless explicitly authorized where applicable.

## Version Policy

- Bump `package.json` only for changes that affect the running app: features, fixes, UI/API behavior, database schema, or shipped runtime behavior.
- Do not bump for `AGENTS.md`, README/docs-only edits, CI/tooling changes without runtime impact, comments, or rule files.
- Before pushing app changes, use patch for fixes/UX improvements, minor for new capabilities, and major for breaking workflow or architecture changes.

## Project Snapshot

```text
src/
  app/                  App Router pages, layouts, route handlers
    api/                auth, chat, groups, intelligence, inventory, market, portfolio, sync, settings, watchlist
    chat/               AI chat page
    intelligence/       signal/status dashboard
    item/[id]/          item detail and charts
    market-cap/         market-cap page
    portfolio/          portfolio page
    settings/           refresh controls and settings
    watchlist/          watchlist page
  components/
    charts/             Lightweight Charts and indicator UI
    chat/               chat experience
    intelligence/       intelligence dashboard components
    layout/             dashboard shell/navigation
    landing/            public/startup visuals
    market/             market tables, movers, watchlist, news
    portfolio/          portfolio UI
    providers/          client providers
    ui/                 reusable primitives
  hooks/                reusable React hooks
  lib/
    ai/                 Gemini/OpenAI providers and chat utilities
    auth/               Steam OpenID, NextAuth, Google OAuth/token helpers
    candles/            candlestick aggregation
    indicators/         chart indicator calculation service
    inventory/          inventory helpers
    market/             price sync, market-cap, refresh, intelligence logic
    news/               RSS aggregation
    db.ts               Prisma singleton
  generated/            Prisma client output; do not edit
  types/                shared TypeScript types

prisma/                 schema, migrations, seed, Turso push script
tests/                  Vitest/RTL tests plus e2e specs under tests/e2e
src/proxy.ts            auth and cron gate, including intelligence cron auth
vercel.json             scheduled sync jobs
```

Current behavior to preserve:
- Market intelligence combines price sources, market-cap calculations, top movers, news, portfolio/watchlist state, intelligence signals, and AI chat insights.
- Charts use TradingView Lightweight Charts with candle data from `src/lib/candles`; indicator logic stays in `src/lib/indicators`.
- Chat renders markdown with `react-markdown`, `remark-gfm`, and sanitized HTML where markdown output can render HTML.
- Cron jobs in `vercel.json`: `/api/sync` at `0 4 * * *`, `/api/market/market-cap-sync` at `0 8 * * *`, and `/api/intelligence/run` at `*/5 * * * *`.

## Commands

```bash
npm run dev             # start local dev server
npm run test            # Vitest suite
npm run test:watch      # Vitest watch mode
npm run lint            # ESLint
npm run build           # prisma generate, Turso push when env exists, next build
npm run db:push:turso   # push schema and seed Turso
npm run db:seed         # Prisma seed command
npm run db:migrate      # create/apply local migration
npm run db:studio       # open Prisma Studio
npx prisma db push      # push schema to local SQLite
npx prisma generate     # regenerate Prisma client
npx tsx prisma/seed.ts  # seed defaults manually
```

## Skills And Delegation

- Load only skills available in the current runtime. If a desired skill is unavailable, say so briefly and use the closest compliant manual workflow.
- Use `git-master` for every git operation.
- Use `playwright` or `webapp-testing` for browser automation, screenshots, UI verification, and e2e checks.
- Use `frontend-ui-ux` or `frontend-design` for UI, layout, styling, and component design.
- Use `review-work` after significant implementation, and `ai-slop-remover` only for targeted cleanup in a specific file.
- Use task-specific skills only when the task directly matches them: `claude-api`, `mcp-builder`, `pdf`, `docx`, `pptx`, `xlsx`, `find-skills`, `plannotator-*`, or design/artifact skills.
- For rules-file work, audit first, report proposed wording, and wait for approval before editing.
- When delegating with `task`, always set `load_skills` and `run_in_background`; pass task-appropriate skills, or `[]` only when no available skill matches.

## Implementation Patterns

### Exports And Components

- Next.js page, layout, loading, and error segment files use framework-required default exports.
- Components use mixed export styles. Follow the existing style in the folder/file and prefer named exports for reusable components unless surrounding code clearly uses default exports.
- Do not perform export-style cleanup unless explicitly requested.
- Default to Server Components. Add `"use client"` only for hooks, event handlers, browser APIs, local storage, timers, chart libraries, or other client-only behavior.
- Use `next/dynamic` with `{ ssr: false }` for heavy client-only charts/tables when existing patterns do so.

### Placement

- New App Router page: `src/app/<route>/page.tsx`.
- New API endpoint: `src/app/api/<domain>/<action>/route.ts` or the closest existing route shape.
- Reusable UI primitive: `src/components/ui`.
- Domain component: matching folder under `src/components`.
- Shared business logic: `src/lib/<domain>`.
- Reusable stateful React logic: `src/hooks/use<Name>.ts`.
- Shared TypeScript shapes: `src/types` when crossing module boundaries.
- Tests: `tests/`, mirroring source areas where practical; e2e specs live in `tests/e2e`.

### TypeScript And React

- Strict TypeScript is enabled. Avoid type suppression and keep types explicit at module boundaries.
- Prefer `interface` for props/object shapes; use `type` for unions and utility types.
- Use `@/` imports for source paths. Avoid relative imports that climb out of `src` unless matching an established exception such as reading package metadata.
- Keep component order consistent: optional `"use client"`, imports, interfaces/types, constants, component, exports.
- Group `useState` hooks near the top of client components.
- Use `useCallback` for callbacks passed as props or used in effect dependencies when the file follows that pattern.
- Add `type="button"` to non-submit buttons and accessible labels for icon-only or ambiguous controls.

### Styling

- Use CSS Modules for reusable presentation.
- Do not introduce Tailwind, CSS-in-JS, or broad global CSS.
- Prefer existing tokens from `globals.css`, especially `--surface-0`, `--bull`, `--bear`, and `--text-primary-90`.
- Existing chart/animation code may use local inline or library-driven styles. Match the local pattern instead of broad restyling.
- Use camelCase CSS module class names.

### API Routes

- Wrap handlers in `try/catch` unless streaming lifecycle constraints require local error handling.
- Use `NextResponse.json()` for normal JSON responses.
- Bare `Response` is allowed for streaming, Server-Sent Events, and other narrow route behaviors that require Web Response APIs.
- Use appropriate HTTP statuses: 400 client error, 401/403 auth failure, 404 not found, 500 server failure.
- Log errors with bracketed context, for example `console.error("[RouteName]", error)`.
- Normal JSON shape is `{ success: boolean, data?: T, error?: string }`; preserve route-specific established shapes where clients already depend on them.
- Add `Cache-Control` headers for cacheable responses.

### Services And Data Flow

- Keep price-source, sync, market-cap, refresh, and intelligence behavior under `src/lib/market` and owned API routes.
- Keep AI provider details under `src/lib/ai`; UI calls chat API routes rather than provider clients directly.
- Keep Steam, NextAuth, Google OAuth, and token helpers under `src/lib/auth`.
- Keep RSS aggregation under `src/lib/news`.
- Server-rendered page data belongs in Server Components when no client interaction is needed.
- Data that changes with tabs, filters, toggles, polling, or browser state belongs in Client Components plus API routes/hooks.
- Open-tab refresh must respect saved refresh interval settings.

### Database

- Import Prisma only through `import { prisma } from "@/lib/db"`.
- Do not instantiate Prisma clients directly.
- Do not edit `src/generated/prisma`.
- `prisma.config.ts` owns the Prisma datasource URL; `prisma/schema.prisma` owns models and generated client output.
- Local development uses SQLite; production uses Turso/libSQL through the same schema.
- For schema changes, update `prisma/schema.prisma`, create/apply migrations as appropriate, regenerate Prisma, and run `npm run db:push:turso` when production schema sync is required.
- `prisma/push-schema.ts` skips safely when Turso env vars are absent.

### Utilities And Errors

- Use named exports for public utilities.
- Follow the existing error strategy in the file. Prefer result objects for recoverable utility failures when surrounding code uses them.
- Store reusable hooks in `src/hooks` with a `use` prefix.
- Avoid new abstractions until there is real reuse or a clear simplification.
- Client components should keep error state explicit, usually `string | null`, and render it with existing UI patterns.
- Error boundaries live in route segment `error.tsx` files and should provide retry behavior where appropriate.
- Never log bare errors without context.

## Testing Rules

- Framework: Vitest plus React Testing Library and jsdom; component setup is in `tests/setup-component.ts`.
- Prefer `getByRole` or stable `data-testid` selectors over brittle text-only queries.
- Mock API calls and Next.js navigation with `vi.fn()` / `vi.mock()`.
- Name tests by behavior, for example `it("shows loading state while fetching")`.
- Use TDD for non-trivial fixes when feasible: reproduce the behavior, implement the smallest fix, then make the suite green.
- If a test is infeasible, explain why and run the closest relevant verification.
- Playwright e2e specs are excluded from Vitest and live under `tests/e2e`.

## Environment

Copy `.env.example` to `.env.local` for local development. Never commit secrets.

Required or deployment-critical:
- `DATABASE_URL`: local SQLite path, normally `file:./dev.db`.
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`: production Turso/libSQL access.
- `CRON_SECRET`: authorizes scheduled sync and intelligence jobs.
- `STEAM_API_KEY`, `ALLOWED_STEAM_ID`: Steam API and account allowlist.
- `CSFLOAT_API_KEY`: CSFloat price data.
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`: NextAuth configuration.
- `TOKEN_ENCRYPTION_KEY`: encryption key for stored tokens.

Optional feature variables:
- `PRICEMPIRE_API_KEY`: Pricempire price data.
- `GEMINI_API_KEY`, `OPENAI_API_KEY`: AI chat providers.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth for Gemini flow.

## Vercel And Cron

- `vercel.json` configures `/api/sync` at `0 4 * * *`, `/api/market/market-cap-sync` at `0 8 * * *`, and `/api/intelligence/run` at `*/5 * * * *`.
- Cron-authenticated sync runs regular market sync and market-cap recalculation when stale.
- Cron-authenticated intelligence uses the hybrid runner: SCM hot/discovery validations share the 3-request per-run cap, CSFloat scout queues thin-supply candidates for later SCM validation, and SCM budgets enforce 19/minute plus 950/day.
- `src/proxy.ts` authorizes protected routes and intelligence cron access.
- Set `CRON_SECRET` in Vercel so cron requests are authorized.
- Frequent open-tab refresh should stay client/settings-driven, not server-cron-driven.
- Production build command is the repository `npm run build`: `prisma generate && npx tsx prisma/push-schema.ts && next build`.

## Git Rules

Load `git-master` before any git operation. No exceptions.

Use the platform-specific prefix for every git command:
- PowerShell: `$env:GIT_MASTER=1; git status`
- Windows CMD: `set GIT_MASTER=1 && git status`
- macOS/Linux/Git Bash: `GIT_MASTER=1 git status`

Commit workflow:
- Gather status, diff, and recent log before committing.
- Detect commit style from repository history.
- Stage only relevant files.
- Keep commits atomic and focused.
- Do not commit secrets or local environment files.
- Do not amend, rebase, force push, or run destructive git commands unless explicitly requested.

Commit message shape:

```text
type: concise subject under 72 characters

Explain what changed, why, and any non-obvious tradeoffs or context.
```

For docs-only `AGENTS.md` edits, use one atomic docs commit and do not create a version-bump commit.

## Verification Checklist

Before handing off completed work:
- Confirm user scope was followed exactly.
- Confirm no unrelated files were edited.
- Run `lsp_diagnostics` on changed supported source files.
- Run relevant tests for new features, bug fixes, and behavior-affecting code changes.
- Run `npm run build` when runtime behavior, build/config/dependencies, database/generated code, route/page/export boundaries, broad refactors, or verification needs require it.
- For docs/rules-only changes, no app tests or build are required unless explicitly requested; report them as skipped because no runtime code changed.
- For UI changes, use browser verification when relevant.
- For database schema changes, confirm Prisma generation/migration and Turso sync requirements.
- For delegated changes, personally inspect every touched file and do not trust subagent self-reports.
- Report any skipped check with the reason.
