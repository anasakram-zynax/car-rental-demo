# Car Rental Demo

A full-stack car rental application with a public booking experience and an administration workspace. Customers can browse the active fleet, inspect vehicle details, create and retrieve bookings, and cancel eligible reservations. Administrators can manage cars, review all bookings, and advance payment statuses through the supported workflow.

This is a demo application and intentionally has no authentication layer.

## Tech stack

### Frontend

- Next.js 16 with the App Router
- React 19 and TypeScript
- Tailwind CSS 4
- TanStack React Query
- Motion for React
- Lucide React
- Radix UI Slider
- OGL-powered visual backgrounds

### Backend

- NestJS 12 and TypeScript
- Prisma ORM 7
- PostgreSQL
- Class Validator and Class Transformer
- Vitest
- Cloudinary Node SDK for the car-image import utility
- Layered API, application, domain, and infrastructure architecture

## Project structure

```text
car-rental-demo/
├── car-rental-backend/   # NestJS API, Prisma schema, migrations and seed tools
└── car-rental-frontend/  # Next.js application and feature-based UI
```

The backend groups the car catalog and booking domains under `src/modules/cars`, with separate API, application, domain, and infrastructure layers. The frontend keeps route entries under `src/app`, generic UI under `src/components`, infrastructure under `src/lib`, and car/booking functionality under `src/features/cars`.

## Application routes

### Customer routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/cars` | Active-car catalog with location and price filters |
| `/cars/[id]` | Car details and image gallery |
| `/cars/[id]/book` | Customer booking form |
| `/my-bookings` | Saved bookings and manual reference lookup |

### Admin routes

| Route | Purpose |
| --- | --- |
| `/admin` | Admin workspace |
| `/admin/cars` | Fleet list, pagination, activation and deactivation |
| `/admin/cars/new` | Create a car |
| `/admin/cars/[id]/edit` | Edit an existing car |
| `/admin/bookings` | Booking list and client-side search |
| `/admin/bookings/[reference]` | Booking details and valid payment-status action |

## API routes

All backend routes use the `/api` prefix. Successful and failed responses use a common `{ success, message, data }` envelope.

### Public API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/cars` | Search active cars; supports `city`, `carTypeId`, `minPrice`, `maxPrice`, `page`, and `limit` |
| `GET` | `/api/cars/:id` | Get an active car |
| `POST` | `/api/car-bookings` | Create a booking |
| `GET` | `/api/car-bookings/:reference` | Retrieve a booking by reference |
| `PATCH` | `/api/car-bookings/:reference/cancel` | Cancel an eligible booking |

### Admin API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/cars` | List active and inactive cars with pagination |
| `POST` | `/api/admin/cars` | Create a car |
| `GET` | `/api/admin/cars/:id` | Get any car for administration |
| `PATCH` | `/api/admin/cars/:id` | Update a car or its status |
| `DELETE` | `/api/admin/cars/:id` | Soft-deactivate a car |
| `GET` | `/api/admin/car-bookings` | List all bookings |
| `GET` | `/api/admin/car-bookings/:reference` | Get admin booking details |
| `PATCH` | `/api/admin/car-bookings/:reference/payment-status` | Advance payment status (`unpaid → paid → refunded`) |

## Local setup

Requirements:

- Node.js and npm
- PostgreSQL
- A Cloudinary account only when running the real car-image importer

Install dependencies separately because the repository does not use a root workspace package:

```bash
cd car-rental-backend
npm install

cd ../car-rental-frontend
npm install
```

### Backend configuration

Copy `car-rental-backend/.env.example` to `car-rental-backend/.env` and provide the required values:

```env
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_URL=your-cloudinary-url
```

`DATABASE_URL` is used by the running application. Prisma CLI configuration reads `DIRECT_URL`. Never commit real credentials.

Prepare the database and start the API:

```bash
cd car-rental-backend
npx prisma generate
npx prisma migrate dev
npm run seed
npm run start:dev
```

The backend runs at `http://localhost:4000`, and its API base is `http://localhost:4000/api`.

### Frontend configuration

Copy `car-rental-frontend/.env.example` to `car-rental-frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

Start the frontend in a second terminal:

```bash
cd car-rental-frontend
npm run dev
```

The frontend runs at `http://localhost:3000`.

## Build and validation commands

### Backend

Run from `car-rental-backend`:

```bash
npm run lint
npm test
npm run build
```

Build and run the production server:

```bash
npm run build
npm run start:prod
```

Additional backend commands:

```bash
npm run test:e2e
npm run test:cov
npm run seed
npm run import:car-images -- --dry-run
npm run import:car-images -- --test-upload
```

The real image import is intentionally not included in normal setup. Review its dry-run and Cloudinary configuration before running it without a diagnostic flag.

### Frontend

Run from `car-rental-frontend`:

```bash
npm run lint
npm run build
```

Run the production frontend after building:

```bash
npm run start
```

## Core behavior

- Only active cars appear in the public catalog; the admin fleet shows active and inactive cars.
- Car deletion is implemented as soft deactivation.
- Booking cancellation follows the backend cancellation policy.
- Booking status and payment status are independent.
- Admin payment transitions are limited to `unpaid → paid → refunded`.
- Car images are served from Cloudinary; image upload management is not part of the frontend.

## Database models

The Prisma schema contains four main models:

- `CarType`
- `Car`
- `CarImage`
- `CarBooking`
