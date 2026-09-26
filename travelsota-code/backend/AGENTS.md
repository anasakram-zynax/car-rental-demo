# AGENTS.md - backend

NestJS API for TravelsOTA. Read the root/shared context first when needed:

- `.agent-context/root/AGENTS.md` for monorepo-wide rules.
- `.agent-context/root/PROJECT_STATUS.md` for current module status.
- `.agent-context/root/PROJECT_CONTEXT.md` for product context.
- `.agent-context/AGENT_ORCHESTRATOR_WORKFLOW.md` for AO parent/worker workflow.

## Commands

```bash
npm run build
npm run lint
npm run test
npm run test:e2e
```

Check `package.json` before relying on a command.

## Backend Rules

- Follow existing NestJS and module patterns.
- Preserve the backend response envelope: `{ success, statusCode, message, ..., data }`.
- Never hardcode, print, or commit secrets.
- Never use floats for money; use smallest-unit/minor-unit helpers.
- Booking state must stay consistent with payment state. A booking is only ticketed/confirmed after payment succeeds.
- Provider credentials are encrypted and seeded from env. Do not log provider credentials.
- For notifications, real user actions need a unique `eventId = randomUUID()` used as `idempotencyKey` for both outbox and direct notification paths.
- Client-IP handling is proxy-boundary dependent: set `TRUST_PROXY_HOPS` only after verifying the production reverse-proxy hop count; do not trust forwarded IP headers by default.

## Hotel Content DB layout (two SQLite files)

Content/reference data lives in TWO SQLite files (never Postgres — PG is transactional-only):

- `reference.db` (`REFERENCE_DB_PATH`) — the small hot catalog: `Hotels` (CanonicalHotel), `HotelSupplierLinks` (HotelProviderMapping), `Destinations` (SupportedHotelDestination), `DestinationSupplierCodes` (SupportedHotelDestinationProvider). Autocomplete/grouping/mapping read here.
- `content.db` (`CONTENT_DB_PATH`) — the big cold supplier content: `HotelContent` (HotelStaticContent), `SupplierDestinations` (HotelDestination), `SupplierRegions` (RatehawkRegionContent), `ImportJobs` (HotelContentSyncJob), `ImportJobItems` (HotelContentSyncItem).

Model names in `prisma/reference.prisma` + `prisma/content.prisma` are the simple names above; physical table names are kept via `@@map` to the old names so data migrates in place. `HotelContent.canonicalHotelId` is a SOFT link to `Hotels.id` (no FK — relations cannot cross files). `PrismaService` routes model access by name: reference models → reference client, content models → content client, everything else → PG. Access via `this.prisma.hotels`, `this.prisma.hotelContent`, etc. Never add a relation across the two files.


## Blog Module Rules

- Blog post `bodyHtml` is user-authored HTML. It MUST be sanitized server-side on every create/update using the allowlist in `src/modules/blog/infrastructure/html-sanitizer.ts` (`sanitize-html`). Never persist raw editor HTML.
- Plain-text fields (excerpt, metaTitle, metaDescription, metaKeywords) are HTML-stripped via `stripHtmlToText` before saving.
- Slugs are auto-generated from the title when omitted and deduped with a `-N` suffix (unique at DB level).
- `publishedAt` is set once on first transition to `PUBLISHED` and preserved on later edits.
- Public blog endpoints (`/blog/*`) return published posts only, without `bodyHtml` in list responses. Admin endpoints are gated by `BLOGS_READ`/`BLOGS_WRITE`.
- Category deletion is blocked while posts reference the category (DB `onDelete: Restrict` + service check).

## CMS Module Rules

- CMS page `content` (and `contentTranslations`) is HTML sanitized server-side with the same shared allowlist (`src/shared/html/html-sanitizer.ts` — reused by blog). Plain-text fields (description, seo fields, `nameTranslations`) are HTML-stripped.
- Slugs are auto-generated from `name` when omitted and deduped with a `-N` suffix (unique at DB level). Public URL is `/page/{slug}`.
- Pages have `isActive`; inactive pages 404 on public. Translations (`nameTranslations`/`contentTranslations` JSON keyed by lang code) are served when `?lang=xx` is passed and a translation exists; otherwise English.
- Menus: `CmsMenu` items are `PAGE` (link to `CmsPage`, url resolved to `/page/{slug}`) or `EXTERNAL` (raw url), in `HEADER`/`FOOTER`/`BOTH`, nested via `parentId` (delete cascades children), ordered by `sortOrder`. `PUT /admin/cms/menus/structure` persists drag-drop order/parents.
- Admin endpoints gated by `CMS_READ`/`CMS_WRITE`. Public `/cms/*` returns active content only.

## AO Worker Rules

- Work only in the current AO worktree/branch.
- Do not edit frontend code from a backend worker unless explicitly assigned.
- Keep diffs small and reviewable.
- Before finishing, report changed files, commands run, failures, and any assumptions.
