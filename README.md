# Portl

**Society gate management and community operations — in one app.**

Portl replaces the fragmented combination of WhatsApp groups, paper registers, and manual phone calls that most residential societies use today. Guards log visitors digitally, residents approve or reject entry from their phone, and admins manage notices, polls, complaints, amenities, and staff from a single dashboard. Everything is scoped by society and role — no data bleeds across tenants.

---

## Table of Contents

1. [Quick Start (APK Download)](#quick-start-apk-download)
2. [Tech Stack](#tech-stack)
3. [Architecture Overview](#architecture-overview)
4. [Setup & Local Development](#setup--local-development)
5. [Demo Credentials](#demo-credentials)
6. [Feature List](#feature-list)
7. [Engineering Highlights](#engineering-highlights)
8. [Known Limitations](#known-limitations)

---

## Quick Start (APK Download)

Want to test Portl immediately without setting up a development environment? 

**[Download the Standalone Android APK](https://expo.dev/artifacts/eas/iH-Pw8ufwIyKALYM1svZZw3X6sSWCJxurBYCTC65dqA.apk)**

*Note: This is a standalone production build pointing directly to the live Railway backend. You can install it on any Android device. See the [Demo Credentials](#demo-credentials) section for test accounts.*

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Monorepo** | [Turborepo](https://turbo.build) + npm workspaces |
| **Mobile** | [Expo](https://expo.dev) / React Native 0.86, [NativeWind](https://www.nativewind.dev) (TailwindCSS) |
| **Navigation** | React Navigation 7 (native stack + bottom tabs) |
| **API** | [Fastify](https://fastify.dev) 5 on Node.js 22 |
| **Database** | PostgreSQL 16 via [Prisma](https://www.prisma.io) ORM |
| **Auth** | JWT (access token), bcrypt password hashing |
| **Real-time** | [Socket.IO](https://socket.io) 4 (visitor status push) |
| **Background Jobs** | [BullMQ](https://bullmq.io) + Redis — visitor expiry worker, push notification worker |
| **Push Notifications** | Expo Push Notification SDK + infrastructure (worker, token storage) |
| **Validation** | [Zod](https://zod.dev) schemas in `@portl/shared` package, shared between API and mobile |
| **Production** | [Railway](https://railway.app) (API + PostgreSQL + Redis) |
| **Build** | [EAS Build](https://expo.dev/eas) — `preview` profile outputs a standalone APK |

---

## Architecture Overview

```
portl/
├── apps/
│   ├── api/          # Fastify REST API + Socket.IO + BullMQ workers
│   └── mobile/       # Expo React Native app (Android + iOS)
├── packages/
│   └── shared/       # Zod schemas, TypeScript types shared across apps
├── turbo.json
└── package.json
```

The `@portl/shared` package ensures that request/response validation schemas are defined once and consumed by both the API (runtime validation) and the mobile app (TypeScript types). There is no type drift between client and server.

---

## Setup & Local Development

### Prerequisites

- Node.js ≥ 22
- npm ≥ 11
- PostgreSQL 16 (local or remote)
- Redis 7 (local — required for BullMQ background workers)
- [EAS CLI](https://docs.expo.dev/eas/) for building the APK (`npm install -g eas-cli`)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure the API

Create `apps/api/.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/portl"
JWT_SECRET="your-secret-key-here"
REDIS_URL="redis://localhost:6379"
```

### 3. Run Migrations and Seed

```bash
cd apps/api

# Apply all migrations
npx prisma migrate deploy

# Seed with demo society, users, amenities, and staff
npx prisma db seed
```

### 4. Start the API

```bash
cd apps/api
npm run dev
```

The API will start on `http://localhost:3000`.

### 5. Configure and Start the Mobile App

Create `apps/mobile/.env`:

```env
# For local development, leave this unset — the app auto-detects your LAN IP via Expo
# For production builds, set this to the Railway URL:
# EXPO_PUBLIC_API_URL=https://portlapi-production.up.railway.app
```

Then start the Expo dev server:

```bash
cd apps/mobile
npx expo start --clear
```

Scan the QR code with Expo Go on your device, or press `a` to open in an Android emulator.

### 6. Run the Test Suite

```bash
cd apps/api
npm test
```

This runs 15 test files covering auth, RBAC, seed integrity, visitor state machine, double-booking lock, Socket.IO events, idempotency, and all domain routes.

---

## Demo Credentials

All three roles belong to the same seeded society ("Portl Seed Society") and share a single password:

| Role | Email | Password |
|---|---|---|
| **Resident** | `resident@portl.dev` | `password123` |
| **Guard** | `guard@portl.dev` | `password123` |
| **Admin** | `admin@portl.dev` | `password123` |

The production Railway database is pre-seeded with these credentials.

---

## Feature List

### 🏠 Resident

- **Visitor approvals** — Approve or reject pending visitor requests in real time; status updates are pushed via Socket.IO without requiring a manual refresh
- **Visitor history** — Full log of all approved, rejected, checked-in, and checked-out visitors for the resident's flat
- **Polls** — Vote on active community polls; results update live with vote-count progress bars; voted polls are tracked client-side to prevent duplicate submissions
- **Notices** — Read society-wide announcements published by Admin
- **Complaints** — Submit complaints with title and description; track status (Open → In Progress → Resolved)
- **Amenity booking** — Browse available amenities, view time-slot availability for a given date, and book a slot (double-booking is prevented at the database transaction layer)
- **My Bookings** — View all upcoming and past amenity bookings
- **Staff directory** — Read-only access to the society's service provider directory
- **Tab badges** — Unread counts on visitor requests, notices, polls, and complaints automatically refresh on focus

### 🛡️ Guard

- **Create visitor requests** — Search for a resident's flat by flat number or tower, select it, and log a visitor with name, purpose, and visitor type
- **Visitor history** — Full log of all visitor requests created by the guard's gate, including current status
- **Mark exit** — One-tap "Mark Exit" to transition approved/checked-in visitors to `CHECKED_OUT`
- **My gate** — All guard actions are scoped to the guard's assigned gate

### 👑 Admin

- **Notices** — Create and publish society-wide notices; all residents see them immediately
- **Polls** — Create polls with up to 10 options; edit question and options; end a poll to declare the result (winning option highlighted); view the full voter breakdown (who voted for what); delete polls
- **Complaints** — View all complaints from all flats; update status from Open → In Progress → Resolved; unread complaint badge on the tab
- **Amenities** — Full CRUD: create amenities with name, description, and slot duration; edit and delete existing amenities
- **Staff directory** — Full CRUD: add, edit, and remove service providers (plumbers, electricians, cleaners, etc.)
- **Settings** — Access to app settings from a gear icon in every screen header

### 🔐 Shared / Auth

- **JWT authentication** — All API routes are protected; tokens are stored in Expo SecureStore and cleared on logout
- **Role-based access control** — RESIDENT, GUARD, and ADMIN roles enforced at the API middleware layer; role-scoped navigation trees in the app
- **Auto-login** — Token persisted across app restarts; redirects to the correct tab navigator for the user's role on resume
- **Real-time updates** — Socket.IO room scoped by `societyId`; visitor status changes are broadcast to connected residents without polling
- **Background workers** — BullMQ + Redis runs two workers:
  - **Expiry worker**: automatically marks stale `PENDING` visitor requests as `EXPIRED` after 5 minutes
  - **Push worker**: delivers push notifications to residents when a visitor request is created for their flat
- **Expo push notification infrastructure** — Push tokens are registered and stored per-user; the server-side worker dispatches notifications via the Expo Push API

---

## Engineering Highlights

**Database-level concurrency constraints, not application-level.**  
Amenity double-booking is prevented inside a `prisma.$transaction` with a `SELECT FOR UPDATE` lock — not with a pre-check query that would lose a race condition. The `PollVote` table has a `@@unique([pollId, userId])` constraint enforced by the database, so the "one vote per user per poll" rule holds even under concurrent requests.

**Idempotency on visitor status transitions.**  
The `PATCH /visitor-requests/:id` endpoint accepts an optional `idempotencyKey`. If the same key is submitted twice, the second request returns the same result as the first without creating duplicate state transitions. The audit trail (`ApprovalDecision` table) is append-only — each status change creates a new row recording who changed what and when, never updating in place.

**Zod schemas are the single source of truth.**  
Validation schemas in `@portl/shared` are referenced by both the Fastify route handlers (runtime validation) and the mobile app (TypeScript types). Adding a field to a schema surfaces type errors in both apps at compile time.

**15 automated test files.**  
The API test suite covers: seed integrity, login flows, RBAC enforcement for all three roles, visitor creation, the full visitor state machine, optimistic lock behaviour, Socket.IO event emission, idempotency, and all domain routes (notices, polls, complaints, amenities, flats, staff). Tests run against a real local PostgreSQL instance using deterministic seed IDs.

**Production deployment on Railway.**  
The API, PostgreSQL, and Redis are deployed to Railway. EAS Build produces a standalone APK pointed at the Railway backend — the APK requires no dev server or local machine to function after installation.

**Audit trail by design.**  
The `ApprovalDecision` model is append-only. The decision to never update a row means the full history of every visitor's status transitions is preserved and queryable, with the deciding user recorded on each row.

---

## Known Limitations

**Society/tower/flat/user management is seed-only.**  
The Admin UI provides CRUD for notices, polls, complaints, amenities, and staff. Adding new towers, flats, or user accounts to a society requires running the seed script or making direct database changes. An Admin management UI for the society hierarchy is a natural next scope.

**Push notifications require Firebase/FCM configuration.**  
The full push infrastructure is implemented and running (token storage, BullMQ worker, Expo Push API calls). On Android, Expo's push service routes notifications through Firebase Cloud Messaging, which requires a `google-services.json` file and a configured FCM project. This has not been set up for this build. The worker runs, tokens are stored, and the Expo API is called — notifications will deliver correctly once FCM is configured.

**Guest pre-approval and delivery-specific flows use the generic visitor flow.**  
There is a single visitor type field on each request. Residents cannot pre-approve a guest with a time window before the visitor arrives. Delivery-specific workflows (one-time OTP, automatic expiry on first check-in) are not differentiated from general visitor visits. Both are deliberate scope boundaries for this build.

**Amenity booking's "today" filter has a UTC/IST timezone boundary edge case.**  
Slot availability is computed by filtering bookings where `date` matches today. The `date` field is stored as a UTC timestamp. Between midnight IST (18:30 UTC the previous day) and midnight UTC, the "today" filter can return stale results. The fix — storing dates as `YYYY-MM-DD` strings or applying a timezone offset at query time — is straightforward and is the only known data edge case.

---

## Project Links

- **Live API:** https://portlapi-production.up.railway.app/health
- **GitHub:** https://github.com/udhay-sharma/portl
