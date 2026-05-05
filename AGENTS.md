# Agent Rules for CS2Vault Project

> **MANDATORY**: Every AI agent working on this codebase MUST read this file in full at the start of every session before making any changes. No exceptions.

---

## ZERO-TOLERANCE COMPLIANCE RULES

These rules override ALL other instructions. Violating any of these is a critical failure, even if the code changes are correct.

### Rule 1: READ THIS FILE FIRST — EVERY SESSION, EVERY TIME

Before writing a single line of code or making any edit, you MUST:
1. Read `AGENTS.md` in full at the start of the session
2. Confirm to the user that you have read and understood the rules
3. Reference specific rules when making decisions (e.g. "Per AGENTS.md research rule, I'm waiting for the explore agent before editing")

If you cannot confirm you've read this file, STOP and read it. No exceptions.

### Rule 2: RESEARCH BEFORE IMPLEMENTATION — NO SHORTCUTS

- **For logic changes or architectural updates**: You MUST wait for ALL background explore/research agents to complete before writing any code. Do NOT start editing files while agents are still running.
- **Anti-duplication**: If you fire an explore or librarian agent for a search, you MUST NOT manually perform the same search yourself. Wait for their results.
- **When in doubt**: Fire the explore agent. The cost of skipping research far exceeds the cost of waiting for it.

### Rule 3: USE THE RIGHT WORKFLOW FOR THE TASK SCOPE

- **Multi-file change (3+ files)**: Consult the Plan Agent FIRST. Do NOT start implementing without a plan.
- **Multi-module / cross-cutting change**: DELEGATE to the appropriate category agent. Do NOT implement cross-cutting changes yourself unless it's a trivial local fix.
- **Git operations**: ALWAYS load the `git-master` skill FIRST. Never run git commands without it.

### Rule 4: NEVER SKIP VERIFICATION

- After making changes, you MUST run `lsp_diagnostics` on all changed files in parallel
- You MUST run the relevant test suite and confirm it passes
- You MUST run the production build (`npm run build`) and confirm it succeeds
- Delegated work ALWAYS requires V3 verification — read every touched file yourself, never trust subagent self-reports

### Rule 5: DETECT USER INTENT BEFORE ACTING

Before performing any task, you MUST:

1. **Pause and analyze** what the user actually wants — not just what they literally said. Users often describe symptoms, not root causes. They may say "add X" when the real need is "solve problem Y". Ask yourself: "What outcome are they after? What didn't they say that they probably expect?"
2. **If the intent is ambiguous**, ask ONE clarifying question before proceeding. Do not assume and do not implement multiple interpretations — clarify first.
3. **If the intent is clear**, confirm your understanding briefly (one sentence) and then act. Do not re-confirm when the user's message confirms an intent you already verbalized this conversation.
4. **Never substitute your own assumptions** for missing requirements. If the user didn't specify a design choice, ask — don't guess and ship.

Example violations of this rule:
- User says "add a button" → agent adds it without asking where, what it does, or how it should look
- User says "fix the slow page" → agent adds a loading spinner instead of investigating why it's slow
- User says "this feels off" → agent rewrites the whole component instead of asking what specifically feels wrong

### Rule 6: DO NOT BUMP VERSION FOR NON-APP CHANGES

Version bumps in `package.json` are reserved for changes that affect the **running application** — features, bug fixes, UI changes, API changes, database schema changes, etc.

**Do NOT bump version for:**
- Changes to `AGENTS.md` or other agent rule files
- Changes to `.github/`, CI/CD config, or development tooling that doesn't affect the production build
- Documentation-only changes (README, comments, etc.)
- Changes to linting/formatting configs that don't affect runtime behavior

**When in doubt**: Ask yourself "Does this change what the user sees or experiences in the deployed app?" If the answer is no, do not bump the version.

---

## General Agent Behavior

- Follow existing code patterns and conventions (see Coding Style below)
- Run lint and type checks before committing
- Keep commits atomic and focused
- Never commit secrets or sensitive data

### Research Before Implementation (MANDATORY)

- **If the task is purely about local conventions or documentation** (like AGENTS.md, README, comments): proceed via direct code reading — no background explore agent needed.
- **For logic changes or architectural updates**: you MUST wait for the background explore agent to provide full context before committing any changes. Never commit code you haven't thoroughly explored.
- **DO NOT edit files while explore/librarian agents are still running.** Wait for their results, then synthesize, then plan, then implement.
- **Anti-duplication rule**: If you fire an explore or librarian agent for a search, you MUST NOT manually perform the same search yourself. Use direct tools only for non-overlapping work.
- When in doubt, fire the explore agent. The cost of skipping research far exceeds the cost of waiting for it.

### Quick Start Commands

Copy-paste ready commands for common tasks:

```bash
# Development
npm run dev                    # Start development server on :3000
npm install                    # Install dependencies (postinstall runs prisma generate)

# Build & Deploy
npm run build                  # Production build (includes Prisma generate + schema push)
npm run db:push:turso         # Push schema to Turso and seed default settings

# Quality Assurance
npm run test                   # Run Vitest test suite
npm run lint                   # Run ESLint
npm run db:studio             # Open Prisma Studio for database inspection

# Database (Local Development)
npx prisma db push            # Push schema changes to local SQLite
npx prisma generate           # Regenerate Prisma client (auto-runs on postinstall)
npx tsx prisma/seed.ts        # Seed default settings manually
```

### Available Skills

Sisyphus can load specialized skills for specific tasks. **Always check if a skill applies before starting work.**

#### Built-in Skills

| Skill | Use When | Trigger Phrases |
|-------|----------|-----------------|
| `git-master` | ANY git operation — commits, pushes, rebase, history search | "commit", "push", "rebase", "squash", "who wrote", "when was X added" |
| `playwright` | Browser automation — testing, screenshots, web scraping, verification | "test in browser", "screenshot", "verify UI", "e2e test" |
| `frontend-ui-ux` | UI/UX design without mockups — layout, styling, components | "design", "make it look better", "improve UI", "layout" |
| `review-work` | Post-implementation review — QA, verification, audit | "review my work", "QA this", "verify implementation", "check my work" |
| `ai-slop-remover` | Clean up AI-generated code smells in a single file | "clean up", "remove AI slop", "refactor this file" |

#### Project Skills (Power Pack)

| Skill | Use When | Trigger Phrases |
|-------|----------|-----------------|
| `agents-md-improver` | Auditing/updating AGENTS.md or CLAUDE.md files | "audit AGENTS.md", "improve project rules", "check CLAUDE.md" |
| `agents-md-revise` | Capturing session learnings into project rules | "update AGENTS.md", "save to project memory", "remember this" |
| `code-architect` | Architecture design for new features | "design feature", "architecture plan", "implementation blueprint" |
| `code-explorer` | Understanding how existing features work | "how does X work", "explain this codebase", "trace execution" |
| `code-review` | Reviewing PRs or pending changes | "review PR", "audit changes", "check before merge" |
| `code-reviewer` | Reviewing specific files or functions | "review this file", "critique this function", "check for bugs" |
| `feature-dev` | Methodical feature implementation (7-phase workflow) | "implement feature", "build new feature", "add functionality" |
| `find-skills` | Discovering what skills are available | "what skills", "find skill for", "how do I do X" |
| `frontend-design` | Building web components/pages with high design quality | "build component", "create page", "frontend implementation" |
| `mcp-builder` | Creating MCP servers for external API integration | "build MCP", "create MCP server", "Model Context Protocol" |
| `security-review` | Security audit of pending changes | "security review", "audit for vulnerabilities", "security check" |
| `skill-creator` | Creating new skills or modifying existing ones | "create skill", "new skill", "modify skill" |

**Skill Loading Protocol:**
1. **Before ANY task**, check if a skill's domain overlaps with your work
2. **When in doubt, load the skill** — cost of loading is near zero, cost of missing is high
3. **Use `skill()` tool first**, then proceed with the task
4. **Git operations** → ALWAYS load `git-master` first, no exceptions

---

## Project Architecture

Directory structure and key locations:

```
src/
├── app/              # Next.js App Router (pages & API routes)
│   ├── api/         # API route handlers
│   ├── chat/        # Chat page
│   ├── item/[id]/   # Item detail page
│   ├── market-cap/  # Market cap page
│   ├── portfolio/   # Portfolio page
│   ├── settings/    # Settings page
│   ├── startup/     # Landing page
│   ├── watchlist/   # Watchlist page
│   ├── error.tsx    # Global error boundary
│   ├── globals.css  # Global styles & CSS variables
│   ├── layout.tsx   # Root layout
│   └── page.tsx     # Market overview (homepage)
├── components/       # React components (CSS Modules required)
│   ├── landing/     # Landing page components
│   ├── layout/      # Layout components (DashboardShell)
│   ├── market/      # Market-related (Watchlist, TopMovers, NewsFeed)
│   ├── portfolio/   # Portfolio components
│   ├── providers/   # React context providers
│   └── ui/          # Reusable UI primitives (Badge, Card, DataTable, etc.)
├── generated/        # Prisma client (auto-generated, DO NOT EDIT)
├── hooks/           # Custom React hooks (usePriceRefreshInterval, etc.)
├── lib/             # Utilities & business logic
│   ├── ai/          # AI providers (Gemini, OpenAI)
│   ├── auth/        # Authentication (Steam OpenID, Google OAuth)
│   ├── candles/     # Candlestick data aggregation
│   ├── market/      # Price fetching, sync, market cap logic
│   ├── news/        # RSS feed aggregation
│   └── db.ts        # Prisma client singleton
└── types/           # Shared TypeScript types

prisma/
├── schema.prisma    # Database schema (Turso/SQLite)
├── seed.ts         # Default settings seeder
└── migrations/     # Database migrations

tests/               # Vitest tests (mirrors src/ structure)
├── components/      # Component tests
├── lib/            # Utility tests
└── *.test.ts       # Unit tests
```

**Key patterns:**
- **Pages** in `src/app/**/page.tsx` use default exports (Next.js convention)
- **Components** in `src/components/` use named exports only
- **Tests** live in `tests/` mirroring the `src/` structure
- **CSS Modules** are co-located: `Component.tsx` + `Component.module.css`

---

## Environment Setup

Required environment variables (copy `.env.example` to `.env.local`):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Local dev | SQLite path (default: `file:./dev.db`) |
| `TURSO_DATABASE_URL` | Vercel | Turso database URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Vercel | Turso auth token |
| `STEAM_API_KEY` | Yes | [Steam Web API key](https://steamcommunity.com/dev/apikey) |
| `ALLOWED_STEAM_ID` | Yes | Your Steam64 ID for auth |
| `NEXTAUTH_SECRET` | Yes | Generate with `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Yes | App URL (default: `http://localhost:3000`) |
| `CRON_SECRET` | Vercel | Secret for Vercel Cron job auth |

**Optional (for features):**
- `CSFLOAT_API_KEY` — CSFloat price data
- `PRICEMPIRE_API_KEY` — Pricempire price data  
- `GEMINI_API_KEY` — Google Gemini AI chat
- `OPENAI_API_KEY` — OpenAI GPT chat
- `TOKEN_ENCRYPTION_KEY` — Encrypt stored tokens

**Turso setup for Vercel:**
```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Create database
turso db create cs2vault
turso db show cs2vault --url
turso db tokens create cs2vault

# Push schema
npm run db:push:turso
```

---

## Gotchas & Common Issues

1. **Prisma client import**: Always use `import { prisma } from "@/lib/db"`. Never import from `@prisma/client` directly — the client is generated to `src/generated/prisma/` and wrapped for adapter configuration.

2. **Turso vs SQLite**: Local development uses a SQLite file (`dev.db`); production uses Turso (libSQL). Both use the same Prisma schema. The `db.ts` file handles the adapter selection automatically.

3. **Default exports**: Only page components in `src/app/` may use default exports. All other components MUST use named exports. Default exports in components break the build.

4. **Strict TypeScript**: The project has `"strict": true`. Never use `as any`, `@ts-ignore`, or `@ts-expect-error`. Fix the type properly or leave the code unchanged.

5. **CSS Modules required**: Every component MUST have a corresponding `.module.css` file. No global CSS for component styles, no inline `style={{}}`, no Tailwind, no CSS-in-JS.

6. **Database schema changes**: After ANY change to `prisma/schema.prisma`, you MUST run `npm run db:push:turso` to sync the production database. Skipping this will break production.

7. **Component structure order**: Follow the exact order: `"use client"` (if needed) → imports → interfaces/types → component function → export. Never deviate.

8. **Path aliases**: Always use `@/` imports (maps to `src/`). Never use relative paths that escape `src/` (e.g., no `../../../`).

9. **Test location**: Tests live in `tests/` directory, not alongside source files. Mirror the `src/` structure (e.g., `src/components/ui/Badge.tsx` → `tests/components/Badge.test.tsx`).

10. **Git workflow**: Always load the `git-master` skill before any git operations. Never use plain git commands. Follow the commit message format with descriptive bodies.

---

## Coding Style (MANDATORY — CONSISTENCY)

Every agent MUST match the existing codebase conventions exactly. The project follows strict patterns — do not introduce alternative styles.

### TypeScript & React

- **Strict mode enabled** — `tsconfig.json` has `"strict": true`. No `as any`, no `@ts-ignore`, no `@ts-expect-error`. Fix the type properly or leave it alone.
- **Path alias**: Use `@/` imports (maps to `src/`). Never use relative paths that escape the `src/` boundary (e.g. no `../../../`).
- **Component files** (`.tsx`): One component per file. Named exports only — never `export default` for React components. The exception is page-level components in `src/app/` which use default exports (Next.js App Router convention).
- **Component structure order**: `"use client"` directive (if needed) → imports → interfaces/types → component function → export.
- **Types vs interfaces**: Use `interface` for React props and object shapes. Use `type` for unions, primitives, and utility types. Never use `I` prefix (e.g. write `PriceData`, not `IPriceData`).
- **Props**: Always use `interface` for React props (not `type`). Co-locate in the same file, directly above the component.
- **State hooks**: Group `useState` declarations together at the top of the component, before any `useCallback` or `useEffect`.
- **Callbacks**: Use `useCallback` for all callback functions passed as props or used in effect dependencies. Include proper dependency arrays.
- **Dynamic imports**: Use `next/dynamic` with `{ ssr: false }` for heavy client-only components (charts, data tables). Use the named-export pattern: `dynamic(() => import("@/components/X").then((m) => ({ default: m.ComponentName })), { ssr: false })`.
- **Buttons**: Always include `type="button"` on `<button>` elements to prevent unintended form submission.
- **Accessibility**: Use `aria-label` for icon-only buttons and interactive elements. Use `aria-hidden="true"` for decorative SVGs. Include meaningful labels.
- **Constants**: Define file-level constants at the top (outside component). Use `UPPER_SNAKE_CASE` for true constants (e.g. `MAX_MESSAGE_LENGTH`, `CACHE_MAX_AGE_HOURS`). Use `camelCase` for configuration objects.

### CSS & Styling

- **CSS Modules only** — every component has a corresponding `ComponentName.module.css`. No global CSS for component styles, no inline `style={{}}` for anything that belongs in a module, no CSS-in-JS libraries, no Tailwind.
- **Class name convention**: `camelCase` in CSS modules. Reference as `styles.classNameName`.
- **CSS custom properties**: Use the project's existing CSS variables (defined in global styles) for colors, spacing, and typography. Do not hardcode values that already exist as variables.

### Server vs Client Components

- **Default to Server Components** (no `"use client"`). Only add `"use client"` when the component needs React hooks, browser APIs, or event handlers.
- **API routes** (`src/app/api/`): Always `NextResponse` from `next/server`. Wrap the handler body in `try/catch`. Return `{ success: boolean, ... }` JSON shape consistently. Use `Cache-Control` headers where appropriate.
- **Data fetching in pages**: Server components fetch directly (no `useEffect` for initial data). Client components fetch via `useEffect` + `fetch` to API routes.
- **Error boundaries**: Create `error.tsx` in route segments following Next.js convention. Log errors with `console.error`, provide retry functionality.

### Utility & Service Patterns

- **Named exports**: Use `export function functionName()` for all public functions. Group related functions in the same file.
- **Do not throw from utilities**: Return result objects with error information. Include `failureReason?: string` and `fallbackAvailable?: boolean` in return types rather than throwing exceptions.
- **Custom hooks**: Store in `src/hooks/` directory. Name with `use` prefix (e.g. `usePriceRefreshInterval`, `useMediaQuery`). Extract reusable stateful logic into hooks.

### Error Handling

- **API routes**: Always wrap in `try/catch`. Error responses use `{ success: false, status: "error", error: "Human-readable message" }` with appropriate HTTP status codes.
- **Client components**: Use `useState<string | null>` for error state. Display with the project's error UI pattern (see existing components).
- **Logging**: Use `console.error("[ComponentOrModuleName]", error)` with a bracketed context prefix. Never bare `console.error(error)`.

### Database (Prisma)

- **Schema changes**: After ANY change to `prisma/schema.prisma`, you MUST run `npm run db:push:turso` to sync the Turso database. This is non-negotiable — the production DB must stay in sync with the schema.
- **Client import**: `import { prisma } from "@/lib/db"`. Never instantiate a new Prisma client.
- **Model naming**: `PascalCase` for models in `schema.prisma`. Fields are `camelCase`. Always add `@@index` for foreign keys and frequently queried fields.
- **IDs**: Use `@id @default(cuid())` for String IDs, `@id @default(autoincrement())` for Int IDs. Follow existing model patterns exactly.

### Import Order

Group imports in this order, separated by blank lines:
1. React / Next.js core (`react`, `next/link`, `next/dynamic`, etc.)
2. Third-party libraries (`next-auth`, etc.)
3. Internal components (`@/components/...`)
4. Internal types (`@/types/...`)
5. Internal utilities (`@/lib/...`, `@/hooks/...`)
6. CSS Module imports (`styles from "./..."`)

---

## Git Operations (CRITICAL — NON-NEGOTIABLE)

### ALWAYS Use git-master Skill

**Rule**: For ANY git operation (commit, push, rebase, history search, etc.), the agent MUST:

1. Load the `git-master` skill FIRST before any git commands
2. Follow the skill's style detection protocol
3. Use `GIT_MASTER=1` prefix for ALL git commands
4. Create atomic commits as specified by the skill

**No Exceptions**:
- Never skip the skill
- Never use plain git commands without the skill loaded
- Never assume commit style — always detect from repo history

### Required Workflow for Commits

```
1. Load git-master skill
2. Run parallel context gathering (git status, git log, git diff)
3. Detect commit style from recent history
4. Analyze files and create atomic commit plan
5. Execute commits following dependency order
6. Verify before push
```

### Commit Messages (CRITICAL — EXPLAIN THE CHANGE)

Every commit message MUST include an **explanation** of what changed and why — not just a terse label. A reviewer reading the message should understand the intent without reading the diff.

#### Structure

```
type: concise subject line (≤72 chars)

Detailed body paragraph explaining what changed, why, and any
non-obvious context. Mention the component/module affected, the
problem being solved, and any tradeoffs or decisions made.
```

**The commit body MUST always be present**, UNLESS the change is small and fully self-explanatory from the subject line alone (e.g. `chore: bump version to 0.7.2`, `fix: correct typo in button label`). When in doubt, include the body.

#### Examples

**Good — with body** (the standard, expected format):
```
feat: replace Range card with ATH in Market Cap chart summary

The Range card showed low-to-high which is redundant with the chart
area. Replaced with All-Time High showing the peak value and its
date, giving users a meaningful single-point stat instead of a range
that requires mental comparison.
```

```
fix: preload sold items alongside active portfolio on mount

Previously sold items only loaded when the user clicked the Sold tab,
causing a visible loading delay. Now both active and sold data fetch
in parallel on page mount, so the Sold tab renders instantly.
```

```
fix: show Back to Portfolio when navigating from portfolio

The back button always read "Back to Market Overview" regardless of
where the user came from. Now checks the ?from= query param and
shows context-appropriate labels: "Back to Watchlist",
"Back to Portfolio", or fallback "Back to Market Overview".
```

**Good — subject-only** (ONLY for trivial changes):
- `chore: bump version to 0.7.2`
- `fix: correct typo in button label`

**Bad examples** (too vague, no body):
- `fix: fetch logic` — what about it?
- `feat: update card` — which card, what changed?
- `refactor: cleanup` — cleanup what?
- `fix: bug` — which bug?

#### Subject line pattern

`type: verb/describe what changed + where + why it matters`

For `fix` commits: describe the **symptom** or **user-visible behavior** that was wrong.
For `feat` commits: describe the **feature** and **where** it appears.
For `refactor` commits: describe **what** was moved/extracted/renamed and **where**.
For `chore` commits: describe **what** was done (version bump, config update, dependency change).

### Version Bumping (CRITICAL — BEFORE PUSHING)

**Rule**: Before pushing any commit(s), the agent MUST bump the version in `package.json` according to change scope. Be conservative — when in doubt, use a smaller bump.

| Change Scope | Version Bump | Examples |
|---|---|---|
| **Small changes / UX improvements** | Patch (+0.0.1) | Bug fixes, error message improvements, UI tweaks, label changes, performance fixes, refactors with no API change |
| **Bigger changes & new features** | Minor (+0.1.0) | New feature, new page, new API endpoint, new component, significant enhancement changing user workflows |
| **Large overhauls, bundled features, structure changes** | Major (+1.0.0) | Architectural rewrites, breaking changes, multi-feature releases |

#### Version Bump Decision Framework

**STEP 1: Ask "What does the USER experience?"**

Analyze the primary user-facing impact, not code complexity:

```
❌ WRONG: "I added 50 lines of error handling logic" → Minor bump
✅ RIGHT: "Users now see better error messages for the same failures" → Patch bump

❌ WRONG: "I refactored the entire auth flow" → Minor bump  
✅ RIGHT: "Users log in exactly the same way, code is just cleaner" → Patch bump
```

**STEP 2: Use the Decision Tree**

```
Does this add a NEW capability users didn't have before?
  ├─ YES: New feature → Minor (+0.1.0)
  └─ NO: Continue...
    
Does this change EXISTING user workflows or behavior?
  ├─ YES: Breaking change → Major (+1.0.0)  
  └─ NO: Continue...

Does this improve/fix something users already use?
  ├─ YES: Bug fix or UX improvement → Patch (+0.0.1)
  └─ NO: Unclear → Ask user or default to Patch
```

**STEP 3: Watch for Common Mistakes**

These often LOOK like features but are PATCHES:

| Change | Looks Like | Actually Is | Why |
|--------|-----------|-------------|-----|
| Better error messages | Feature | **Patch** | Same failures, better UX |
| Form validation improvements | Feature | **Patch** | Same forms, better feedback |
| Loading states/spinners | Feature | **Patch** | Same loading, better UX |
| Refactored code | Feature | **Patch** | No user-facing change |
| Accessibility fixes | Feature | **Patch** | Same functionality, better compliance |
| Performance optimization | Feature | **Patch** | Same behavior, faster |
| Code reorganized | Refactor | **Patch** | No user-facing change |

**STEP 4: Determine Final Scope**

After analyzing ALL unpushed commits:

```
IF any commit is Major → Major bump
ELSE IF any commit is Minor → Minor bump
ELSE → Patch bump (most common)
```

**Workflow**:
1. Finish all code changes and commit them
2. **Analyze each commit** using the decision framework above
3. Determine the highest scope among all commits
4. Bump `version` in `package.json` accordingly
5. Commit the version bump with message like `chore: bump version to X.Y.Z`
6. Push everything

**No Exceptions**:
- Never push without bumping version
- **Never** skip the scope assessment
- **When in doubt, prefer Patch over Minor**
- Mixed scopes default to the highest scope among unpushed changes

### Forbidden Actions

- Single commit from multiple unrelated files
- Semantic commits when repo uses plain style
- Any git operation without skill loaded
- Pushing without verification
- Pushing without version bump