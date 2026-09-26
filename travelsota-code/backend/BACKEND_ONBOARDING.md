# TravelsOTA Backend — Onboarding Guide for Junior Developers

Hey! Welcome to the team. This doc will get you from "I know MERN" to "I understand our backend" in about 20 minutes. Grab a coffee.

---

## Table of Contents

1. [The Big Picture: What We're Building](#1-the-big-picture-what-were-building)
2. [MERN vs Our Stack: Why We Left MERN Behind](#2-mern-vs-our-stack-why-we-left-mern-behind)
3. [Our Tech Stack: What, Why, and Where to Learn More](#3-our-tech-stack-what-why-and-where-to-learn-more)
4. [Folder Structure Walkthrough](#4-folder-structure-walkthrough)
5. [How a Request Flows Through the System](#5-how-a-request-flows-through-the-system)
6. [Key Architectural Patterns You'll Use Daily](#6-key-architectural-patterns-youll-use-daily)
7. [How We Scale](#7-how-we-scale)

---

## 1. The Big Picture: What We're Building

TravelsOTA sells flights and hotels online. Three types of users:

- **Customers** (B2C) — search, book, pay (Stripe/PayPal)
- **Agents** (B2B) — book on behalf of customers, earn commission, pay via wallet credit
- **Admins/Staff** — run the platform, manage providers, view analytics

We don't own flights or hotels. We connect to **third-party providers** — multiple flight APIs (NDC, GDS, and modern REST APIs), multiple hotel APIs, and payment gateways. Each speaks a different format (JSON, XML, proprietary).

Our job: unify these providers behind one API so the frontend doesn't care who the provider is.

---

## 2. MERN vs Our Stack: Why We Left MERN Behind

If you've built apps with **MongoDB + Express + React + Node.js**, you know the pattern: route → controller → MongoDB query → JSON response. It works for simple apps. Here's why it breaks at our scale:

### Problem 1: Provider Chaos
In MERN, each provider would get its own route or a giant if/else in the controller. When one API returns XML and another returns JSON, you'd end up with spaghetti code parsing formats everywhere.

**Our solution**: Each provider is an **adapter** that implements a shared interface (a "port"). The rest of the app only talks to the interface. Add a new provider = write one new adapter class. Zero changes to business logic.

### Problem 2: Business Logic in the Wrong Place
In Express, business logic ends up in route handlers, then gets copied when you need it elsewhere. 800-line controller files. Impossible to test in isolation.

**Our solution**: Business logic lives in **application services** and **use cases** — plain TypeScript classes with no HTTP or database knowledge. Controllers are thin (validate input → call service → return). Testable without starting the server.

### Problem 3: Database Lock-In
MERN apps couple directly to Mongoose models. Switching from MongoDB to PostgreSQL means rewriting everything.

**Our solution**: **Repository pattern** — domain code talks to an interface (`FlightBookingRepoPort`), not to Prisma or SQL. Tests mock the interface. Switch databases = write one new repository implementation.

### Problem 4: Scaling Beyond One Process
Express + MongoDB runs as one process. When you need background jobs, cron tasks, and real-time notifications, you either bloat the API process or hack together a separate worker with Redis queues.

**Our solution**: **Two process roles** built in:
- `APP_ROLE=api` — handles HTTP requests only
- `APP_ROLE=worker` — handles cron jobs, email dispatch, outbox relay, content sync

Both share the same codebase. One runs on port 4000, the other never opens a port. Scale the API horizontally behind a load balancer; run one worker with advisory locks.

### Quick Comparison Table

| Concern | MERN (Express) | Our Stack (NestJS + Hexagonal) |
|---------|---------------|-------------------------------|
| Code organization | By technical role (routes/, models/, controllers/) | By business domain (flights/, hotels/, payment/) |
| Business logic location | Scattered across routes + models | Isolated in application/ services |
| Adding a provider | Find all the if/else blocks, modify everywhere | Write one adapter class, register it |
| Testing | Need full server + DB | Unit test services in isolation |
| Database | Direct Mongoose calls everywhere | Repository interface → Prisma implementation |
| Background jobs | Separate script or queue | Same codebase, APP_ROLE=worker |
| Dependency injection | Manual require() or import | Automatic via NestJS DI container |
| Request validation | Manual checks or express-validator | Declarative DTOs with class-validator decorators |

---

## 3. Our Tech Stack: What, Why, and Where to Learn More

### Core Framework

| Tech | Why We Use It | Learning Resources |
|------|--------------|-------------------|
| **NestJS 11** | Modular architecture with dependency injection out-of-the-box. Decorators for routes, guards, pipes, interceptors. TypeScript-first. Built on Express (or Fastify), so your Express knowledge still applies. | [NestJS Docs](https://docs.nestjs.com/) — read "Overview" + "Fundamentals" + "Techniques" |
| **TypeScript 6** | Type safety across a 30+ module codebase. Interfaces for ports. Enums for statuses. Never wonder what shape a response has. | [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) |

### Database

| Tech | Why We Use It | Learning Resources |
|------|--------------|-------------------|
| **PostgreSQL 16** | Relational guarantees. ACID transactions for bookings + payments. JSONB for flexible provider data. Row-level security option. | [PostgreSQL Tutorial](https://www.postgresqltutorial.com/) |
| **Prisma 7** | Type-safe database client generated from schema. Migrations built in. Multi-schema support (we use `public` + `hotel_content`). Not an ORM that hides SQL — you still think in terms of tables. | [Prisma Docs](https://www.prisma.io/docs) — focus on "Schema" + "Client" + "Migrations" |

> **Heads up**: We use `@prisma/adapter-pg` to bypass Prisma's default connection pooler. We manage connections ourselves for multi-role workloads.

### Validation & Transformation

| Tech | Why We Use It | Learning Resources |
|------|--------------|-------------------|
| **class-validator** | Decorator-based validation on DTO classes. `@IsString()`, `@IsEnum()`, `@IsInt()`, `@ValidateNested()` — declarative, not imperative. | [class-validator docs](https://github.com/typestack/class-validator) |
| **class-transformer** | Transforms plain JSON into typed class instances. `@Type(() => NestedDto)` for nested objects. | [class-transformer docs](https://github.com/typestack/class-transformer) |

### Authentication & Security

| Tech | Why We Use It | Learning Resources |
|------|--------------|-------------------|
| **Passport.js** | Industry standard for Node.js auth. Strategy-based — our `JwtStrategy` handles JWT, `GoogleStrategy` handles OAuth. | [Passport docs](https://www.passportjs.org/) + [NestJS Auth](https://docs.nestjs.com/security/authentication) |
| **bcrypt** | Password hashing. Not just "hash" — it's slow by design, making brute-force attacks impractical. | Standard library, pick any tutorial |
| **AES-256-GCM** | Encrypts provider credentials in the database. Even if the DB leaks, credentials are unreadable without the encryption key. | Built-in Node.js `crypto` — [Node.js Crypto docs](https://nodejs.org/api/crypto.html) |
| **Helmet** | Sets security headers (CSP, HSTS, X-Content-Type-Options). Express middleware, just works. | [Helmet docs](https://helmetjs.github.io/) |

### Payments

| Tech | Why We Use It | Learning Resources |
|------|--------------|-------------------|
| **Stripe SDK** | Payment intents, webhooks, idempotency built in. Handles PCI compliance. | [Stripe Node.js Docs](https://docs.stripe.com/api?lang=node) |
| **PayPal SDK** | PayPal checkout flow. Less mature than Stripe but necessary for our markets. | [PayPal Checkout Docs](https://developer.paypal.com/docs/checkout/) |

### Background Processing & Realtime

| Tech | Why We Use It | Learning Resources |
|------|--------------|-------------------|
| **Outbox Pattern** (custom, not a library) | Writes events to DB in same transaction as the business change. A relay worker picks them up and dispatches. Guarantees no lost events. | [Microservices.io: Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html) |
| **Socket.IO** | Real-time push to frontend. Notifications appear instantly. | [Socket.IO docs](https://socket.io/docs/v4/) |
| **SSE** (Server-Sent Events) | Unidirectional streaming for search progress. Simpler than WebSocket for one-way data. | [MDN: SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) |
| **@nestjs/schedule** | Cron jobs within NestJS: payment expiry, content sync, dead-letter recovery. | [NestJS Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling) |

### Cache & Performance

| Tech | Why We Use It | Learning Resources |
|------|--------------|-------------------|
| **Redis / Upstash** | Caches search results (90s for flights, 300s for hotels), search sessions (15 min). Serverless-friendly via Upstash REST API. | [Redis Docs](https://redis.io/docs/latest/develop/) |
| **Advisory Locks** (PostgreSQL) | Prevents duplicate cron execution when multiple worker instances run. Database-level locking, no external dependency. | [PostgreSQL Advisory Locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS) |

### Email & Documents

| Tech | Why We Use It | Learning Resources |
|------|--------------|-------------------|
| **Nodemailer** | Sends emails via SMTP. Runs only in the worker process. | [Nodemailer docs](https://nodemailer.com/about/) |
| **PDFKit** | Generates invoice and voucher PDFs server-side. | [PDFKit docs](https://pdfkit.org/) |

### Testing

| Tech | Why We Use It | Learning Resources |
|------|--------------|-------------------|
| **Jest** | Unit tests (`*.spec.ts` co-located with source). Mock providers via DI — swap real adapter with fake in test modules. | [Jest docs](https://jestjs.io/docs/getting-started) |
| **Supertest** | E2E tests spin up the full NestJS app with test DB. | [Supertest](https://github.com/ladjs/supertest) |

---

## 4. Folder Structure Walkthrough

```
backend-travelsOTA/
├── prisma/
│   ├── schema.prisma              # Database schema (1472 lines, 2 DB schemas)
│   └── migrations/                # Migration history
│
├── src/
│   ├── main.ts                    # App bootstrap: Helmet, CORS, pipes, listen
│   ├── app.module.ts              # Root module — imports all 23+ modules
│   │
│   ├── generated/                 # Prisma client (auto-generated, never edit)
│   │
│   ├── shared/                    # Cross-cutting infrastructure
│   │   ├── cache/                 # Redis/Upstash cache service
│   │   ├── crypto/                # AES-256-GCM encryption
│   │   ├── guards/                # Global guards (auth, user types, rate limit)
│   │   ├── interceptors/          # Standard response envelope interceptor
│   │   ├── filters/               # Global exception filter
│   │   ├── locks/                 # PostgreSQL advisory locks
│   │   ├── middleware/            # Request ID, SSE anti-buffer
│   │   ├── outbox/                # Transactional outbox (write → relay → dispatch)
│   │   ├── pipes/                 # Validation pipe config
│   │   └── email/                 # Nodemailer transport config
│   │
│   └── modules/                   # Business domain modules
│       │
│       ├── flights/               # ✈️ Flight search + booking
│       │   ├── api/               #   Controllers + DTOs (HTTP layer)
│       │   ├── application/       #   Use cases + ports (business logic)
│       │   │   ├── ports/         #   Interfaces (provider contracts, repo ports)
│       │   │   └── services/      #   Application services (aggregator, checkout, workflow)
│       │   ├── domain/            #   Entities, enums, value objects
│       │   │   └── entities/      #   FlightBookingEntity, NormalizedFlightOffer
│       │   └── infrastructure/    #   Adapters (provider clients, Prisma repos)
│       │       ├── providers/     #   Third-party provider implementations
│       │       └── repositories/  #   PrismaFlightBookingRepository
│       │
│       ├── hotels/                # 🏨 Hotel search + booking (same hexagonal structure)
│       ├── payment/               # 💳 Stripe + PayPal payment processing
│       ├── bookings/              # 📋 Shared booking utilities + state machine
│       ├── auth/                  # 🔐 JWT + Google OAuth + refresh tokens
│       ├── settings/              # ⚙️ Provider credentials, payment gateway config
│       ├── currency/              # 💱 Multi-currency support
│       ├── markup/                # 📊 Agent price markup rules
│       ├── commission/            # 💰 Agent commission tracking
│       ├── wallet/                # 👛 Agent credit wallet
│       ├── invoices/              # 🧾 PDF invoice generation
│       ├── documents/             # 📄 Voucher generation
│       ├── notifications/         # 🔔 Real-time notification dispatch
│       ├── search-job/            # 🔍 Multi-provider search session management
│       ├── autocomplete/          # ⌨️ Airport/hotel name autocomplete
│       ├── promo-codes/           # 🏷️ Promotional code validation
│       ├── access-control/        # 🛡️ RBAC: roles + permissions
│       ├── refund/                # ↩️ Refund request management
│       ├── email/                 # ✉️ Email template rendering + sending
│       ├── admin-booking/         # 👨‍💼 Admin booking management endpoints
│       ├── agent-booking/         # 🤝 Agent booking endpoints
│       ├── agent-panel/           # 🖥️ Agent portal data endpoints
│       ├── dashboard/             # 📈 Admin dashboard aggregations
│       ├── cars/                  # 🚗 (scaffold — not built yet)
│       ├── stays/                 # 🏠 (scaffold — not built yet)
│       ├── umrah/                 # 🕋 (scaffold — not built yet)
│       └── cancellation/          # ❌ (scaffold — not built yet)
│
├── test/                          # E2E tests
├── scripts/                       # DB seed scripts
├── docker-compose.yml             # PostgreSQL 16 container
├── package.json
├── tsconfig.json
├── nest-cli.json
└── .env.example                   # Template for environment variables
```

### The Hexagonal Folder Anatomy

For any module with `api/` + `application/` + `domain/` + `infrastructure/` folders:

| Layer | Purpose | Depends On | Example |
|-------|---------|-----------|---------|
| **api/** | HTTP concerns — controllers, DTOs, route decorators | application layer | `FlightsController` receives request, validates DTO, calls service |
| **application/** | Business logic — services, use cases, ports (interfaces) | domain layer | `FlightSearchAggregatorService` calls providers in parallel, merges results |
| **application/ports/** | Interface contracts — "what" not "how" | nothing | `SearchProvider` interface with `search(dto)` method |
| **domain/** | Pure business concepts — entities, enums, types | nothing | `BookingEntity`, `PaymentStatus` enum |
| **infrastructure/** | Concrete implementations — adapters to external systems | ports from application layer | `ProviderAService` implements `SearchProvider` |

The golden rule: **dependencies point inward**. Infrastructure knows about domain. Domain knows about nothing.

---

## 5. How a Request Flows Through the System

Let's trace a promo-code validation request. This touches every layer without getting tangled in provider-specific complexity:

```
Browser → POST /api/v1/promo-codes/validate
│
▼ api/
│ PromoCodesController.validate()
│ ├─ @Body() dto: ValidatePromoCodeDto    ← class-validator checks code is string, order amount is number
│ ├─ @UserTypes('public')                 ← UserTypesGuard: is user type allowed here?
│ └─ Calls promoCodeService.validate(dto.code, dto.orderAmount, dto.currency)
│
▼ application/services/
│ PromoCodeService.validate()
│ ├─ Validates business rules:
│ │  ├─ Is the promo code active?         ← Pure domain logic
│ │  ├─ Has it expired?                   ← Checks entity.expiresAt < now
│ │  ├─ Is minimum order amount met?      ← Compares amount against rule
│ │  └─ Has usage limit been reached?     ← Queries redemption count
│ ├─ Computes discount:
│ │  ├─ Flat discount? $50 off            ← Domain value object: DiscountAmount
│ │  ├─ Percentage? 10% of $200 = $20     ← Domain value object: DiscountPercentage
│ │  └─ Caps at max discount if set       ← Business rule: Math.min(discount, maxDiscount)
│ └─ Returns validation result + discount breakdown
│
▼ infrastructure/repositories/
│ PromoCodeRepository.findByCode()
│ ├─ Queries PostgreSQL via Prisma        ← WHERE code = ? AND isActive = true
│ └─ Maps row → PromoCodeEntity            ← Raw data → domain entity
│
▼ api/ (back in controller)
│ Controller receives result, returns it
│
▼ shared/interceptors/
│ StandardResponseInterceptor wraps it:
│ { success: true, statusCode: 200, message: "OK", data: { valid: true, discount: {...} } }
│
▼ Browser receives standardized JSON response
```

Now compare this to what happens when the user actually **applies** the promo code during checkout:

```
POST /api/v1/promo-codes/apply
│
▼ PromoCodeService.apply()
│ ├─ Calls validate() again (idempotency — never trust a stale validation)
│ ├─ Opens a DB transaction                   ← ACID boundary
│ │  ├─ Inserts PromoRedemption record        ← "User X used code Y at time Z"
│ │  ├─ Increments usage counter on PromoCode ← "code now used 5 out of 100 times"
│ │  └─ Writes outbox event: "promo.used"     ← Same transaction! Guaranteed delivery.
│ └─ Commits transaction
│
▼ OutboxRelayService (worker process, async)
│ ├─ Polls OutboxEvent table every 5 seconds
│ ├─ Finds unprocessed "promo.used" events
│ ├─ Dispatches to PromoCodeEventListener
│ └─ Listener: updates analytics, sends notification
```

**What you just saw:**
- Controller = thin. Just validates input and calls a service.
- Service = all business rules. No HTTP, no DB queries directly.
- Repository = one job: map DB rows to domain entities.
- Outbox = events fire reliably. Even if the worker is down, the event sits in the DB until processed.
- Every layer has one responsibility. No spaghetti.

---

## 6. Key Architectural Patterns You'll Use Daily

### 6.1 Dependency Injection (NestJS DI)

```typescript
// Define a token (string identifier)
export const BookingRepoPortToken = 'BOOKING_REPO_PORT';

// Declare the interface (the "port")
export interface BookingRepoPort {
  create(booking: CreateBookingInput): Promise<BookingEntity>;
  findById(id: string): Promise<BookingEntity | null>;
}

// Implement (the "adapter")
@Injectable()
export class PrismaBookingRepository implements BookingRepoPort {
  constructor(private readonly prisma: PrismaService) {}
  
  async create(booking: CreateBookingInput): Promise<BookingEntity> {
    return this.prisma.booking.create({ data: booking });
  }
}

// Wire in the module
@Module({
  providers: [
    { provide: BookingRepoPortToken, useClass: PrismaBookingRepository },
  ],
})
export class BookingsModule {}

// Use in a service
@Injectable()
export class SomeService {
  constructor(
    @Inject(BookingRepoPortToken)  // ← DI container injects the real implementation
    private readonly bookingRepo: BookingRepoPort,
  ) {}
}
```

This is the core pattern. Learn it first.

### 6.2 Provider Registry (Strategy Pattern)

```typescript
// Registry holds all providers implementing a shared interface
@Injectable()
export class ProviderRegistryService {
  private providers = new Map<string, SearchProvider>();
  
  register(name: string, provider: SearchProvider) {
    this.providers.set(name, provider);
  }
  
  get(name: string): SearchProvider {
    return this.providers.get(name);
  }
}

// Each provider registers itself on module init
onModuleInit() {
  this.registry.register('providerA', this.providerAService);
  this.registry.register('providerB', this.providerBService);
}
```

Add a new provider = write a class implementing `SearchProvider` + one `register()` call.

### 6.3 Booking State Machine

All bookings (flights + hotels) follow a centralized state machine:

```
PENDING → HOLD_APPLIED → PAYMENT_PENDING → PAYMENT_PROCESSING → TICKETED
  ↓            ↓               ↓                  ↓
CANCELLED   HOLD_EXPIRED   PAYMENT_FAILED    PAYMENT_FAILED
```

240 lines in `booking-state-machine.ts`. 21 statuses. 60+ valid transitions. Both flights and hotels share it. Never write `if (status === 'paid') { status = 'ticketed' }` manually — call `stateMachine.transition(booking, 'TICKETED')`.

### 6.4 Outbox Pattern

Problem: "Save booking AND send confirmation email" — if email fails, is the booking saved? If yes, email is lost.

Solution: Write to two tables in ONE database transaction:

```typescript
await this.prisma.$transaction(async (tx) => {
  await tx.booking.create({ data: booking });
  await this.outboxWriter.writeSafe({
    eventType: 'booking.created',
    aggregateId: booking.id,
    payload: { bookingId: booking.id },
  }, tx);  // ← same transaction
});
// Transaction commits → both saved or neither saved
// OutboxRelayService (worker) reads the outbox later and fires the email
```

### 6.5 Response Envelope

Every API response looks like:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Flights retrieved successfully",
  "timestamp": "2026-08-01T12:00:00.000Z",
  "path": "/api/v1/promo-codes/validate",
  "requestId": "uuid-v4",
  "data": { /* actual payload */ }
}
```

This is handled automatically by `StandardResponseInterceptor`. Your controllers just return the data object. Never format the envelope manually.

### 6.6 Money Handling

Never use `number` or `float` for money. Use our currency helpers:

```typescript
// Store in smallest unit (cents/satangs/halalas)
amount: 19999  // = $199.99

// Format for display
formatPrice(19999, 'USD')  // → "$199.99"
formatPrice(19999, 'BHD')  // → "BHD 19.999" (3 decimal places)
```

`lib/utils/currency.ts` knows every currency's decimal places.

---

## 7. How We Scale

### 7.1 Process Role Separation

```
┌─────────────────┐     ┌─────────────────┐
│   API Instance   │     │  Worker Instance │
│   (APP_ROLE=api) │     │ (APP_ROLE=worker)│
│                  │     │                  │
  │  • HTTP requests │  │  • Outbox relay  │
  │  • Auth          │  │  • Email dispatch│
  │  • Business logic│  │  • Background sync│
  │  • Data serving  │  │  • Cron jobs     │
│                  │     │  • Cleanup       │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         └────────┬───────────────┘
                  │
         ┌───────┴───────┐
         │  PostgreSQL 16 │
         └───────────────┘
```

Same codebase. Same Docker image. Different `APP_ROLE` env var. Worker never opens an HTTP port.

### 7.2 Horizontal Scaling

```
         Load Balancer
         ┌──────────┐
         │  Nginx / │
         │  K8s Ingress│
         └────┬─────┘
     ┌────────┼────────┐
     ▼        ▼        ▼
┌─────────┐┌─────────┐┌─────────┐
│ API #1  ││ API #2  ││ API #3  │  ← Stateless. Scale to N.
└────┬─────┘└────┬─────┘└────┬─────┘
     └───────────┼───────────┘
                 ▼
         ┌──────────────┐
         │ PostgreSQL 16 │  ← Handles concurrent connections
         └──────────────┘
```

APIs are stateless (no in-memory session, no file storage). Scale horizontally freely.

Worker uses **advisory locks** to prevent duplicate cron execution. Only one worker runs a given cron at a time, even if you run N worker instances for redundancy.

### 7.3 Caching Layers

```
Request → Cache check (Redis) → Hit? Return cached
                               → Miss? Query providers → Cache → Return
```

- Search results: short TTL (60–300s based on data type)
- Reference data: long TTL (15 min to 24 hours)
- Session data: moderate TTL (15 min)

### 7.4 Rate Limiting

`RateLimitGuard` uses an in-memory sliding window per IP. Tiered by user type:
- Anonymous: most restrictive (e.g. 30 requests/min)
- Authenticated customer: moderate
- Agent/Admin: generous

### 7.5 Database Connection Pooling

We manually manage Prisma connection pools:
- API process: 3 connections (handles concurrent HTTP requests)
- Worker process: 1 connection (sequential cron jobs)
- Migrations: uses `DATABASE_DIRECT_URL` to bypass pooler

Why not Prisma's default pooler? It doesn't support prepared statements and adds latency. Direct pg connections are faster and we control capacity.

---

## Key Files to Read First (Suggested Order)

1. `src/main.ts` — see how the app boots
2. `src/app.module.ts` — see all modules and global guards
3. `src/shared/interceptors/standard-response.interceptor.ts` — understand the envelope
4. `src/modules/flights/` — the most complete hexagonal example (every layer present)
5. `src/modules/bookings/booking-state-machine.ts` — booking lifecycle
6. `src/shared/outbox/` — event reliability
7. `prisma/schema.prisma` — data model (warning: 1472 lines, skim it)

---

## Questions Before Our Meeting?

Write them down. We'll walk through:
- A live debugging session (pick any real bug)
- Adding a small feature end-to-end
- The PR review process
- How to read the test suite

You've got this. NestJS feels weird at first (decorators everywhere, modules, providers...), but after your first feature, you'll see why the structure exists. It's not ceremony — it's a safety net when you're shipping to real users.

See you at the meeting!
