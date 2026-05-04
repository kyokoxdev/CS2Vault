# Agent Rules for CS2Vault Project

> **MANDATORY**: Every AI agent working on this codebase MUST read this file in full at the start of every session before making any changes. No exceptions.

---

## General Agent Behavior

- Follow existing code patterns and conventions (see Coding Style below)
- Run lint and type checks before committing
- Keep commits atomic and focused
- Never commit secrets or sensitive data

### Research Before Implementation (MANDATORY)

- **If the task is purely about local conventions or documentation** (like AGENTS.md, README, comments): proceed via direct code reading — no background explore agent needed.
- **For logic changes or architectural updates**: you MUST wait for the background explore agent to provide full context before committing any changes. Never commit code you haven't thoroughly explored.
- When in doubt, fire the explore agent. The cost of skipping research far exceeds the cost of waiting for it.

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

### Version Bumping (CRITICAL — BEFORE PUSHING)

**Rule**: Before pushing any commit(s), the agent MUST bump the version in `package.json` according to change scope:

| Change Scope | Version Bump | Examples |
|---|---|---|
| **Small changes** | Patch (+0.0.1) | Bug fixes, UI tweaks, label changes, minor refactors |
| **Bigger changes & new features** | Minor (+0.1.0) | New feature, new page, new API endpoint, significant enhancement |
| **Large overhauls, bundled features, structure changes** | Major (+1.0.0) | Architectural rewrites, breaking changes, multi-feature releases |

**Workflow**:
1. Finish all code changes and commit them
2. Determine the change scope of ALL unpushed commits since last push
3. Bump `version` in `package.json` accordingly (use the highest scope if mixed)
4. Commit the version bump with message like `chore: bump version to X.Y.Z`
5. Push everything

**No Exceptions**:
- Never push without bumping version
- Never skip the scope assessment
- Mixed scopes default to the highest scope among unpushed changes

### Forbidden Actions

- Single commit from multiple unrelated files
- Semantic commits when repo uses plain style
- Any git operation without skill loaded
- Pushing without verification
- Pushing without version bump