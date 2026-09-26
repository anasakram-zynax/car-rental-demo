<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — frontend (Next.js web app)

Customer site + admin panel for TravelsOTA. Read root `AGENTS.md` first for business context.

> **node_modules note:** generally off-limits, but the Next.js block above is a deliberate exception — `node_modules/next/dist/docs/` is the canonical reference for THIS Next.js version. Nothing else under `node_modules/` should be read.

## Stack
- **Next.js 16** (App Router) · **React 19** · TypeScript.
- **TailwindCSS 4**, `tailwind-merge`. Charts: ApexCharts. SVGs via `@svgr/webpack`.
- Server state: **TanStack React Query**. Forms: **react-hook-form + Zod v4**.
- Payments UI: `@stripe/react-stripe-js`. Talks to backend at `/api/v1`.

## Commands (exact)
```bash
npm run dev          # next dev
npm run build        # next build (run before declaring done)
npm run lint         # eslint
npm run test         # vitest run
npm run test:watch   # vitest watch
```

## Structure (`src/`)
- `app/` — App Router pages/layouts (customer routes + `app/admin/*`).
- `features/<domain>/` — `flights`, `hotels`, `admin`, `payments`, `system`: each has `api/` (typed fetchers), `components/`, `hooks/`.
- `components/` — shared `ui/`, `form/`, `layout/`, `admin/`, `payment/`, `common/`.
- `lib/` — `client.ts` (API client w/ JWT auto-refresh + retry), auth context, Zod schemas, routes, currency utils, env.
- `hooks/`, `context/` (Theme/Sidebar/Currency), `icons/`.

## Conventions
- **Server state goes through React Query hooks** (`useApiQuery`/`useApiMutation` + feature hooks). DO NOT `fetch` directly in components.
- **All API calls go through `lib/client.ts`** — it handles base URL, auth header, 401→refresh→retry. DO NOT bypass it.
- The backend returns `{ success, statusCode, message, ..., data }` — read `data`; don't assume the payload is the root object.
- Forms: react-hook-form + Zod resolver. Reuse `components/form/*` and `components/ui/*` — don't hand-roll inputs.
- Admin routes are permission-gated (`RequirePagePermission`, `usePermissions`) and cookie-guarded in middleware. Keep new admin pages gated.
- Money: format with `lib` currency helpers; never render raw smallest-unit integers.
- **Performance & Best Practices:** Use the **`vercel-react-best-practices`** skill (installed globally across all AI tools). Follow Vercel's 8 prioritized rule tiers (P0 `async-*` waterfalls, P0 `bundle-*` size, P1 `server-*`, P1 `client-*`, P2 `rerender-*`, P2 `rendering-*`, P3 `js-*`, P3 `advanced-*`) for all React and Next.js frontend code.

## Don'ts
- DO NOT use class components.
- DO NOT read `node_modules/` (except the Next.js docs path above), `.next/`, build output.
- DO NOT add a styling lib — use Tailwind 4 + existing UI components.
- DO NOT call backend endpoints outside `lib/client.ts` / feature `api/` modules.

## Design System (MANDATORY for any UI work)
Use the **`ui-ux-pro-max` skill**. It owns design decisions. This is NOT optional for UI structure, color, typography, or UX work.

**When you change how anything looks/feels/moves/interacts — DO:**
1. **Read `D:\traval-q\design-system\travalq\MASTER.md`** — the single source of truth (authoritative tokens: `--primary #0064D2`, Plus Jakarta Sans, 4/8/12/16/24/32/48/64/80 spacing, no surface gradients, anti-slop rules).
2. **Check the page override** at `design-system/travalq/pages/<page>.md`. If it exists, its rules **override** MASTER. (home / flight-search / hotel-search / checkout / admin / auth).
3. **Never guess** — run the skill CLI for any dimension you're unsure of:
   ```bash
   python ../.agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux|color|typography|style|chart [--stack nextjs]
   ```
4. **Run the Master's Pre-Delivery Checklist** before declaring UI done (contrast ≥4.5:1, focus rings, reduced-motion, touch ≥44px, no emoji icons, cursor-pointer, responsive breakpoints).

**Accent law:** the PUBLIC customer site uses `#0064D2` blue ONLY. The ADMIN shell may use its own theme classes (`themes.css`, slate/indigo inspector) — but don't leak admin colors into `(public)/*`, and never redefine MASTER's primary per-screen.

**Persistence:** regenerate/extend with:
```bash
python ../.agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "TravalQ" [--page "<name>" --page-query "<...>"]
```
