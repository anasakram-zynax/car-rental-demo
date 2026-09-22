# Car Rental Demo

A practice full-stack car rental application built with a structured backend and feature-based frontend architecture.

## Tech Stack

### Backend

* NestJS
* TypeScript
* Prisma ORM
* PostgreSQL
* Hexagonal Architecture

### Frontend

* Next.js
* TypeScript
* Tailwind CSS
* React Query
* Feature-based architecture

## Project Structure

```text
car-rental-demo/
├── car-rental-backend/
└── car-rental-frontend/
```

The backend is organized using hexagonal architecture with separate API, application, domain, and infrastructure layers.

The frontend is organized by feature, keeping route files separate from feature logic, API functions, hooks, and components.

## Backend Setup

Move into the backend directory:

```bash
cd car-rental-backend
```

Install dependencies:

```bash
npm install
```

Create a `.env` file and add:

```env
DATABASE_URL=
PORT=3000
```

Run the Prisma migrations:

```bash
npx prisma migrate dev
```

Generate the Prisma Client:

```bash
npx prisma generate
```

Start the development server:

```bash
npm run start:dev
```

## Frontend Setup

Move into the frontend directory:

```bash
cd car-rental-frontend
```

Install dependencies:

```bash
npm install
```

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

Start the development server:

```bash
npm run dev
```

## Database

The demo currently uses four main tables:

* `car_type`
* `car`
* `car_image`
* `car_booking`

The database is managed through Prisma and PostgreSQL.

## Current Scope

The application will support car management, public car search, booking creation, booking retrieval, customer cancellation according to the cancellation policy, and admin-managed payment status.
