# React / Next.js Code Review Checklist (2025-2026)

**Sources:**
- https://pagepro.co/blog/18-tips-for-a-better-react-code-review-ts-js/
- https://strapi.io/blog/react-and-nextjs-in-2025-modern-best-practices
- https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md
- https://www.augustinfotech.com/blogs/nextjs-best-practices-in-2025/
- https://gist.github.com/bigsergey/aef64f68c22b3107ccbc439025ebba12

**Retrieved:** 2026-04-24
**Query used:** `code review checklist React Next.js best practices 2025`

## Summary

Modern React/Next.js code review focuses on component structure, hook usage, render boundaries (server vs. client), data-fetching strategy, and rendering strategy (SSR/SSG/ISR/CSR). These are the specific signatures `quality-worker-bee` should be able to recognize in the diff.

## Checklist items most relevant to an audit

### Component structure
- Single-responsibility components; avoid mega-components that mix state, effects, layout, and data-fetching.
- Props are typed (TypeScript) or PropTypes'd; no `any`/`unknown` without reason.
- Components composed over configuration (prefer children/slots over prop explosion).

### Hooks
- Hooks called at the top level only - not in conditionals, loops, or after early returns.
- Dependency arrays on `useEffect`, `useMemo`, `useCallback` are exhaustive (lint rule: `react-hooks/exhaustive-deps`).
- No duplicate state derivable from props or other state.
- Custom hooks extracted when two components share non-trivial state logic.

### Server vs. client boundary (Next.js App Router)
- `"use client"` only where necessary (interactivity, browser APIs). Server components by default.
- No secrets, DB clients, or server-only code imported into client components.
- Server components use `fetch` with revalidation tags; client components use SWR/TanStack Query or similar.

### Data fetching and rendering strategy
- Correct choice of SSR / SSG / ISR / CSR for the route. Static content should not render on every request.
- `fetch` calls have cache hints (`cache: "force-cache"`, `next: { revalidate: N }`) when appropriate.
- No waterfall fetches - parallelize with `Promise.all` where data is independent.

### Accessibility, performance, SEO (touch points the Bee may flag)
- Semantic HTML (`<button>` not `<div onClick>`).
- Images use `next/image` with `alt` text.
- `Metadata` / `generateMetadata` exported from each route segment.
- No client components in `layout.tsx` unless needed.

## Key quotations

> "Code reviews in React projects help maintain consistent architecture, improve code quality, and catch issues early before they reach production."

> "Developers should pay attention to common React pitfalls such as unnecessary re-renders, poor state management, and improper use of hooks."

> "For 2025, hybrid strategies-mixing Server-Side Rendering (SSR), Static Site Generation (SSG), Incremental Static Regeneration (ISR), and Client-Side Rendering (CSR)-let developers tailor data delivery for optimal speed."

## Relevance to this stinger

Feeds `guides/04-five-axis-evaluation.md` (the Alignment and Detrimental Patterns sections) and `guides/07-common-gaps.md`. In a Next.js App Router codebase, the most common "implied but missing" gaps are:

- Missing `"use client"` where a hook is used → build error (flag as Critical).
- `"use client"` on a component that doesn't need it → bundle bloat (Warning).
- Server-only module imported by a client component → build error or leaked secret (Critical).
- Missing `loading.tsx` / `error.tsx` siblings where the plan specified loading/error UX (Warning).
