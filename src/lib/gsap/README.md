# GSAP Validation Spike (Next.js 16 App Router)

## Ownership boundaries

- **GSAP owns:** landing-page animation sequences and timeline-driven hero/section effects.
- **Framer Motion owns:** dashboard UI micro-interactions (cards, lists, modal transitions, tap/hover states).
- **Hard rule:** never apply both GSAP and Framer Motion to the same DOM element.

If both libraries are needed in one feature area, split ownership by wrapper structure (parent controlled by one library, child controlled by the other) so each element has a single animation owner.

## SSR safety pattern used

Implemented in `test-ssr.tsx`:

1. Component is client-only via `'use client'`.
2. GSAP import does not touch `window`/`document` at module scope.
3. Animation runs inside `useLayoutEffect` with a `typeof window !== 'undefined'` guard.
4. `gsap.context(..., rootRef)` scopes selectors/tweens.
5. Cleanup uses `ctx.revert()` to avoid stale animations on unmount/re-render.

## CSS 3D verification in spike

The test component applies both:

- `perspective: 1000px`
- `transform-style: preserve-3d`

This confirms the baseline 3D CSS properties required for landing-page motion composition are present and compatible with the GSAP test flow.
