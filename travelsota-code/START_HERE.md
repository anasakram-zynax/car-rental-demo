# TravelsOTA Reference Build — Start Here

**Audience:** you (junior developer) · **Purpose:** give you a real, working copy of our production architecture so you can build the Car Rental module *inside it* instead of next to it.

You can hand this whole file to your own AI assistant (Claude, ChatGPT, Copilot, whatever you use) and ask it to explain any part in more depth — it has everything it needs to understand the project from this file alone.

---

## 1. Why this folder exists

Look at the other two folders in this repo: `car-rental-backend/` and `car-rental-frontend/`. That's the demo you already built — good work, and it taught you the shape of a booking flow. But it's a **standalone project**: its own auth (none), its own database, its own everything. It can't be merged into our real site, because our real site already has:

- a full auth system (JWT + refresh tokens + Google sign-in + roles/permissions)
- payments (Stripe, PayPal, wallet, invoices)
- notifications, emails, promo codes, currency conversion
- an admin panel with real users, real permissions, real navigation

If you built Car Rental as a bigger version of your standalone demo, none of that would fit — you'd be rebuilding auth, rebuilding the admin panel, rebuilding payments, and none of it would match how we actually do things.

**So instead:** this `travelsota-code/` folder is a trimmed copy of our *real* codebase. Same architecture, same conventions, same shared systems (auth, payments, notifications, admin panel) — with only the third-party supplier integrations removed (the real flight/hotel suppliers, like Travelport and Hotelbeds — those need paid API credentials you don't have and don't need for this task).

What's **kept**, fully working, for you to learn from and copy the pattern of:
- **Manual Hotels** module — `backend/src/modules/hotels/manual/`
- **Manual Flights** module — `backend/src/modules/flights/manual/`

These two are your reference pattern. A "manual" hotel or flight is one **we** enter directly (no external supplier) — an admin creates it, a customer searches and books it, exactly like a real supplier-backed one, just without the supplier API call in the middle. **Car Rental is the same idea**: there's no external car supplier, so your whole module will look like a bigger, standalone version of "manual hotels."

Everything else in the codebase (auth, payments, notifications, admin panel, currency, invoices) is the real thing, fully wired up. You plug into it — you don't rebuild it.

---

## 2. What got removed, and why it doesn't affect you

To keep this copy small and focused, we removed:
- Real supplier integrations: Travelport (flights), Duffel, Amadeus, Hotelbeds, RateHawk (hotels)
- The hotel "static content" system (photos/descriptions synced from suppliers) — this used to also power destination/hotel-name autocomplete suggestions
- A handful of supplier-only data-sync scripts

**One thing worth knowing:** the real codebase uses two small SQLite files (`reference.db`, `content.db`) alongside the main Postgres database, only for autocomplete suggestions and that hotel-content system above. **Those SQLite files are not included here.** You don't need them, and you should **never** add a SQLite file for the car module. Any data your car module needs — car types, fleet quantities, bookings, seed/test data — goes in the **same Postgres database** as everything else, through Prisma, exactly like `HotelBooking` and `FlightBooking` already do. If your AI assistant ever suggests "let's add a small SQLite table for this," the answer is no — one Postgres database for everything.

---

## 3. Get it running (5 minutes)

You need two terminals — one for `backend/`, one for `frontend/`.

### Backend

```bash
cd backend
cp .env.example .env
```

Open `.env` and generate two secrets (run this command twice, paste each result in):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Paste the two outputs into `JWT_SECRET` and `PROVIDER_ENCRYPTION_KEY`. Everything else in `.env.example` — **including `DATABASE_URL`** — is already filled in with our shared dev database, so you don't need to install or configure Postgres yourself.

```bash
npm install
npx prisma db push      # syncs the schema to the shared database — run this once
npm run start:dev
```

You should see `Listening on http://localhost:4000` and no red `ERROR` lines. If you see one, stop and ask (or paste it to your AI — it's a working codebase, so a real error here means something about your local setup, not the code).

> ⚠️ **Never run** `prisma migrate reset`, `prisma db push --accept-data-loss`, or anything with `--force` against this database without asking first — it's shared. Adding new tables/columns (which is all Car Rental needs) is always safe; wiping or rewriting existing ones is not.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`. Log in with:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@travelsota.com` | `demoadmin` |
| Customer | `customer@travelsota.com` | `democustomer` |

(These demo accounts are created automatically the first time the backend boots.)

---

## 4. Explore before you build — read these files in this order

Don't start coding yet. Spend an hour reading these six files, in order. Everything about your task is a variation on this pattern.

1. `backend/src/modules/hotels/manual/manual-hotel.provider.ts` — the shortest file, shows how a "manual" thing plugs into the search system.
2. `backend/src/modules/hotels/manual/application/services/manual-hotels.service.ts` — the CRUD + search logic for manual hotels. This is 80% of what your car service will look like.
3. `backend/src/modules/hotels/manual/api/manual-hotels-public.controller.ts` and `manual-hotels.controller.ts` — the two controllers: one for customers (public), one for admins.
4. `backend/src/modules/hotels/application/services/hotel-booking.service.ts` — the real booking flow: creates a booking, calls the payment system, applies promo codes, sends notifications. This is what you plug your car bookings into — **don't rebuild payments, notifications, or promo codes, call the same services this file calls.**
5. `frontend/src/features/hotels/components/hotel-search-form.tsx` — the search form pattern.
6. `frontend/src/app/(public)/hotels/` — the search results page and how it calls the API.

Also skim, just to see the shape:
- `backend/src/shared/booking/booking-state-machine.ts` — every booking in the system (flight, hotel, and soon car) moves through the same status states (`pending` → `confirmed` → `cancelled`, etc.). Reuse this, don't invent new statuses.
- `frontend/src/config/admin-nav.tsx` — how the admin sidebar is defined. You'll add one entry here.

---

## 5. The architecture, briefly

Same hexagonal layers as your standalone demo, just applied consistently across a much bigger app:

| Layer | Contains | Example (hotels) |
|---|---|---|
| `api/` | Controllers, DTOs — validates input, calls one service | `manual-hotels.controller.ts` |
| `application/` | Services — the actual logic, calls ports (interfaces) for anything external | `manual-hotels.service.ts`, `hotel-booking.service.ts` |
| `domain/` | Plain TypeScript — entities, types, no NestJS/Prisma | `domain/interfaces/hotel-provider.interface.ts` |
| `infrastructure/` | Real implementations — Prisma repositories | `infrastructure/repositories/prisma-hotel-booking.repository.ts` |
| `*.module.ts` | Wires providers/controllers together for NestJS DI | `hotels.module.ts` |

One extra piece hotels/flights have that a brand-new module like yours doesn't strictly need: a **provider registry** (`HotelsProviderRegistryService`), which lets multiple suppliers (manual + real ones) register themselves and be looked up by key. Since Car Rental has **no external supplier at all**, you can skip the registry — just build `CarsService` directly and wire it straight into `cars.module.ts`. Simpler is correct here.

---

## 6. Your task: Car Rental (rental + transfer, combined)

### 6.1 The business idea

One module, two service types, sharing the same fleet:

- **`rental`** — customer picks a pickup date, a drop-off date, and a car type. Priced per day.
- **`transfer`** — customer picks a pickup point and a drop-off point (e.g. airport → hotel), one-way, for a fixed price. No return date.

Both use the same underlying `CarFleet` — you're not tracking individual physical cars (no VINs, no license plates). You're tracking **car types with a quantity**, the same way a hotel tracks room *types* with a quantity of rooms, not individual physical rooms. Example:

| Car type | Category | Quantity available | Price/day (rental) | Price (transfer, flat) |
|---|---|---|---|---|
| Toyota Corolla or similar | Economy | 5 | $35 | $25 |
| Toyota Camry or similar | Standard | 3 | $55 | $40 |
| GMC Yukon or similar | SUV | 2 | $90 | $60 |

When a booking is made, you decrement available quantity for that car type over that date range (for rentals) or just record the transfer (no date-range overlap check needed for a one-way trip — treat it as instantly fulfilled/scheduled).

### 6.2 Backend — step by step

Build a new module at `backend/src/modules/cars/`, following the **same folder shape as `modules/hotels/manual/`**:

```
modules/cars/
├── cars.module.ts
├── api/
│   ├── dto/
│   │   ├── create-car.dto.ts          # admin: create a car type
│   │   ├── update-car.dto.ts
│   │   ├── car-search.dto.ts          # customer: search params
│   │   └── car-booking.dto.ts         # customer: booking payload
│   ├── cars.controller.ts             # admin CRUD for car types
│   ├── cars-public.controller.ts      # customer: search, get details, book
├── application/
│   └── services/
│       ├── cars.service.ts            # CRUD + search + availability logic
│       └── car-booking.service.ts     # booking flow (mirrors hotel-booking.service.ts)
├── domain/
│   └── entities/
│       └── car-booking.entity.ts
└── infrastructure/
    └── repositories/
        └── prisma-car-booking.repository.ts
```

Steps, in order:

1. **Prisma schema** (`backend/prisma/schema.prisma`) — add two models: `CarFleet` (the car type + quantity + pricing) and `CarBooking` (mirrors `HotelBooking`'s shape: id, publicRef, status, userId, dates or route, price, currency, payment link). Run `npx prisma db push` after.
2. **`CarsService`** — CRUD for `CarFleet` (admin) and a `search()` method (customer: filter by dates/location/category, return only types with quantity > 0 for that range).
3. **`CarBookingService`** — modeled directly on `hotel-booking.service.ts`. Reuse, don't rebuild:
   - `CreatePaymentIntentUseCase` (from `modules/payment/application/use-cases/create-payment-intent.use-case.ts`) for payment
   - The shared `BookingStatus` state machine (`shared/booking/booking-state-machine.ts`)
   - `NotificationService` for booking-confirmed notifications (same `outboxWriter.writeSafe()` + `notifications.notifyDirect()` pattern used everywhere else — check `AGENTS.md` at the repo root for the exact rule)
   - `InvoiceService` if you want an invoice generated on confirm (optional, hotels do this)
4. **Controllers** — one public (search, get details, checkout, book), one admin (CRUD car types, list all bookings). Gate the admin controller the same way `admin-flights.controller.ts` is gated (`@RequirePermission`, permission codes) — ask if you're not sure which permission code to reuse or add.
5. **Register the module** in `app.module.ts` the same way `HotelsModule`/`FlightsModule` are registered.

### 6.3 Frontend — step by step

This is the exact list you were given — do it in this order:

1. **A separate search form for cars.** New component, e.g. `frontend/src/features/cars/components/car-search-form.tsx`, modeled on `hotel-search-form.tsx`. Fields: pickup location, drop-off location (only relevant for `transfer`), pickup date, drop-off date (only for `rental`), a toggle/tabs for rental vs transfer. Make it actually submit and navigate to the results page with query params — don't leave it as a static form.
2. **A separate page for car search results/listing.** `frontend/src/app/(public)/cars/page.tsx`, modeled on the hotel results page. Calls your new `GET /cars/search` endpoint, renders a list of available car types as cards (reuse `hotel-result-card.tsx` as a starting layout, swap the fields).
3. **Adapt the "offer snapshot" / details page pattern for car details.** Hotels have a details + checkout flow under `frontend/src/features/hotels/components/checkout/` and `frontend/src/app/(public)/booking/hotels/`. Build the equivalent: a car details page (or step) showing the selected car type, dates/route, and price breakdown before checkout — same idea as a "snapshot" of the offer the customer is about to book, so the price can't silently change between search and checkout.
4. **Payment methods + confirm booking.** Reuse the existing payment UI — `frontend/src/components/payment/stripe-payment-form.tsx` and `paypal-payment-button.tsx` — the same components hotels/flights use. Don't build new payment UI.
5. **Display it in the admin dashboard.** Add a "Cars" entry to the **Inventory** section of `frontend/src/config/admin-nav.tsx` (next to Hotels and Flights), then build the admin pages under `frontend/src/app/admin/cars/` — a list page and a create/edit page, modeled on `frontend/src/app/admin/hotels/manual/`.

**Do not touch the agent dashboard** (`frontend/src/app/admin/agents/`, or any agent-specific pricing/booking flow) — that's out of scope for this task.

### 6.4 Seed / test data

No SQLite. Add a script `backend/src/scripts/seed-cars.ts` (modeled on `seed-hotel-destinations.ts` in the same folder) that inserts a handful of `CarFleet` rows straight into Postgres via Prisma, for you to test search/booking against. Add an npm script for it in `package.json`, same pattern as `"seed:hotel-destinations": "ts-node --transpile-only src/scripts/seed-hotel-destinations.ts"`.

---

## 7. If you get stuck

- Re-read section 4's file list — almost every question ("how do I...") has an answer in one of those six files, just for hotels instead of cars.
- Check the root `AGENTS.md` for cross-cutting rules (notifications, money handling, response envelope shape) — these apply to your module too.
- If something in the *shared* systems (payments, auth, notifications) seems to be missing a feature you need, don't work around it — ask. Those are shared with the real site; changes there need a second pair of eyes.
- If you genuinely need to run something destructive against the shared database (a migration that changes an existing column, for example), ask first.
