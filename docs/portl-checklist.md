# Portl — Build Checklist

Track three things per step: **Built** (code written), **Tested** (the doc's specific test actually run and passed), **Committed** (git commit made — your rollback point).

---

## DAY 1 — Foundation

### Step 1.1 — Scaffold the monorepo
- [ ] Built — Turborepo scaffold, `apps/api` (plain Node+TS), `apps/mobile` (Expo)
- [ ] Tested — `npx tsc --noEmit` in `packages/shared` (0 errors) · Expo default screen loads · `curl localhost:3000/health` returns `{ status: "ok" }`
- [ ] Committed

### Step 1.2 — Database schema (all entities)
- [ ] Built — `schema.prisma`: Society, Tower, Flat, User, VisitorRequest, ApprovalDecision, Notice, Poll, PollVote, Complaint, Amenity, AmenityBooking, ServiceProvider + `PollVote` unique `(pollId, userId)`
- [ ] Tested — `npx prisma migrate dev --name init` runs clean · Prisma Studio shows all tables/columns · manually insert Society→Tower→Flat, relations click through correctly
- [ ] Committed

### Step 1.3 — First shared Zod schema
- [ ] Built — `auth.schema.ts` with `LoginSchema`, `RegisterSchema`, inferred types
- [ ] Tested — throwaway test: `.parse()` throws on invalid, passes on valid · imports cleanly from `apps/api` (`@portl/shared`)
- [ ] Committed

### Step 1.4 — Auth: register + login (Resident only)
- [ ] Built — `POST /auth/register`, `POST /auth/login`, bcrypt hashing, JWT with `{ userId, role, societyId, flatId }`
- [ ] Tested — register → 201, row in Prisma Studio, password hashed · login → access token · decode at jwt.io, confirm payload · wrong password → 401
- [ ] Committed

### Step 1.5 — RBAC: three-lock system
- [ ] Built — `requireRole()` preHandler (Lock 2) on `GET /me` · row-level scoping query (Lock 3) e.g. `GET /visitor-requests` filtered by `req.user.flatId`
- [ ] Tested — `GET /me` no token → 401 · valid token → 200 · Resident A can't fetch Resident B's data by guessing flat ID · `rbac.test.ts` written as real automated test
- [ ] Committed

### Step 1.6 — Extend auth to Guard and Admin
- [ ] Built — `seed.ts` with one Resident, one Guard, one Admin (known passwords)
- [ ] Tested — `npx prisma db seed` → all 3 users exist with correct roles · each login has correct role/scope (`flatId`/`gateId`/none) · admin-only route with Resident token → 403
- [ ] Committed

**Day 1 checkpoint:** ☐ three working logins, real DB with relations, one shared schema pattern working, passing RBAC test

---

## DAY 2 — Visitor approval flow (flagship, most important day)

### Step 2.1 — Visitor request schema + create endpoint
- [ ] Built — `VisitorRequestSchema` (name, purpose, visitorType, flatId, photoUrl optional) · `POST /visitor-requests` (Guard-only, status: PENDING)
- [ ] Tested — valid POST as Guard → 201, row in Prisma Studio · missing field → 400 not 500 · same POST as Resident → 403
- [ ] Committed

### Step 2.2 — Status state machine
- [ ] Built — `ALLOWED_TRANSITIONS` + `assertValidTransition()` in `packages/shared/permissions` · `PATCH /visitor-requests/:id` calls it
- [ ] Tested — PENDING→APPROVED succeeds · APPROVED→PENDING rejected cleanly · PENDING→CHECKED_IN (skipping APPROVED) rejected
- [ ] Committed

### Step 2.3 — Row-level scoping on visitor endpoints
- [ ] Built — `GET /visitor-requests` scoped to `req.user.flatId` · `PATCH` rejects if request isn't caller's
- [ ] Tested — Resident A PATCH on Resident B's request → 403 · Resident A's GET never includes B's requests · added to `rbac.test.ts`
- [ ] Committed

### Step 2.4 — Redis distributed lock
- [ ] Built — `SET lock:flat:{flatId} NX PX 5000` before creating row on `POST /visitor-requests`; released after
- [ ] Tested — two simultaneous POSTs for same flat → one succeeds, one gets clean 409 (no dup row/crash) · single normal request still works
- [ ] Committed

### Step 2.5 — Socket.IO real-time updates
- [ ] Built — server-side Socket.IO · `visitor:new` emitted to flat room on POST · `visitor:decided` emitted to guard room on PATCH
- [ ] Tested — plain HTML/socket.io-client test client receives `visitor:new` with correct payload on POST (before touching mobile) · same for `visitor:decided`
- [ ] Committed

### Step 2.6 — Idempotency key
- [ ] Built — `idempotencyKey` required on PATCH; recent keys stored in Redis with short TTL; repeat key returns original response
- [ ] Tested — same PATCH + same key twice → only 1 `ApprovalDecision` row, matching responses · same PATCH + 2 different keys → second correctly rejected as invalid transition
- [ ] Committed

### Step 2.7 — Wire the mobile app
- [ ] Built — Guard's "create visitor" screen + Resident's "incoming request" screen, wired to real endpoints/sockets
- [ ] Tested — Guard creates → Resident's screen updates live (no refresh) · Resident approves → Guard's screen updates live · kill/reopen Resident app mid-flow → pending request still shows on reload
- [ ] Committed

**Day 2 checkpoint:** ☐ flagship feature works end-to-end on real devices — locking, state machine, scoping, replay protection, live updates all together

---

## DAY 3 — Strengthen (reliability + proof)

### Step 3.1 — BullMQ push notification fallback
- [ ] Built — delayed push job on visitor request creation, skipped if resident already responded
- [ ] Tested — no response → push arrives on device after delay · immediate approval via socket → queued push safely skipped (check logs)
- [ ] Committed

### Step 3.2 — Auto-expire delayed job
- [ ] Built — delayed BullMQ job → transitions to `EXPIRED` if still PENDING when it runs
- [ ] Tested — shortened delay (15s) → confirm flips to EXPIRED, Guard screen reflects via socket · approve before delay fires → expire job does nothing · **delay reverted back to realistic value**
- [ ] Committed

### Step 3.3 — Audit trail immutability check
- [ ] Built — confirm every status change writes a new `ApprovalDecision` row (not overwriting)
- [ ] Tested — full lifecycle (PENDING→APPROVED→CHECKED_IN→CHECKED_OUT) → 4 distinct `ApprovalDecision` rows in Prisma Studio · `VisitorRequest.status` matches latest `ApprovalDecision` (cross-check query run manually)
- [ ] Committed

### Step 3.4 — Formalize RBAC + state-machine tests
- [ ] Built — automated test suite (vitest/jest): auth, RBAC scoping (generic + visitor-specific), state transitions, idempotency
- [ ] Tested — `npm test` passes clean from fresh checkout (`npm install` + seed only) · deliberately break one check (e.g. comment out `requireRole`) → confirm relevant test fails
- [ ] Committed

**Day 3 checkpoint:** ☐ flagship feature resilient (offline/retry-safe), fully audited, provably tested

---

## DAY 4 — Remaining modules (reuse, don't reinvent)

### Step 4.1 — Notices
- [ ] Built — `NoticeSchema` · `POST /notices` (Admin only) · `GET /notices` (scoped to `societyId`, Redis-cached ~60s)
- [ ] Tested — Admin creates, Resident → 403 on create · Resident's GET only shows own society (seed 2nd society to verify) · cache busts correctly on new notice (no stale wait)
- [ ] Committed

### Step 4.2 — Polls
- [ ] Built — `PollSchema`, `PollVoteSchema` · `POST /polls` (Admin) · `POST /polls/:id/vote` (Resident)
- [ ] Tested — resident votes once → succeeds · same resident votes again → fails via DB unique constraint (not app check — try back-to-back calls to confirm) · results endpoint tallies correctly
- [ ] Committed

### Step 4.3 — Complaints
- [ ] Built — `ComplaintSchema` · OPEN→IN_PROGRESS→RESOLVED transition table (reused pattern) · `POST /complaints` (Resident) · `PATCH /complaints/:id` (Admin)
- [ ] Tested — Resident creates, scoped correctly on read · Admin valid transitions work, invalid ones rejected · Resident PATCH attempt → 403
- [ ] Committed

### Step 4.4 — Amenity booking
- [ ] Built — `AmenitySchema`, `AmenityBookingSchema` · `POST /amenities/:id/book` wrapped in `prisma.$transaction` (check-then-insert)
- [ ] Tested — single booking succeeds · two simultaneous bookings for same slot → only 1 succeeds, other gets clean conflict · different slot same time → succeeds (not over-blocking)
- [ ] Committed

### Step 4.5 — Wire remaining mobile screens
- [ ] Built — Notices list/create, Polls list/vote, Complaints list/create/status, Amenities browse/book
- [ ] Tested — walk each screen as each relevant role on real device · empty states tested (no data yet) · error states tested (invalid form submit)
- [ ] Committed

**Day 4 checkpoint:** ☐ every module has a working screen backed by real enforcement — better 3 solid than 4 half-working

---

## DAY 5 — Polish and package

### Step 5.1 — Loading, empty, error states
- [ ] Built — loading skeleton/spinner, empty state message, visible error message on every screen
- [ ] Tested — airplane mode mid-action → real error shown, not infinite spinner/crash · cleared seed data per role → sensible empty states, not blank screens
- [ ] Committed

### Step 5.2 — Seed script for demo
- [ ] Built — final `seed.ts`: demo credentials for all 3 roles + 1 pre-seeded PENDING visitor request
- [ ] Tested — `npx prisma migrate reset` (full wipe) → migrate + seed from scratch → all 3 logins work, pending request exists · **repeated on a clean clone if possible**
- [ ] Committed

### Step 5.3 — README with enforcement trace table
- [ ] Built — per-module "Enforced at: App / API route / Service layer / DB constraint" table
- [ ] Tested — read it as a first-time stranger — setup instructions alone (clone, install, migrate, seed, run) work with zero tribal knowledge
- [ ] Committed

### Step 5.4 — Architecture diagram + known limitations
- [ ] Built — one diagram: request → auth check → validation → service logic (+lock) → DB constraint → socket/queue emit · honest "known limitations" section (mock payments, etc.)
- [ ] Tested — diagram matches what was actually built, not the original Day 1 plan
- [ ] Committed

### Step 5.5 — Demo video
- [ ] Built — walkthrough: Guard creates request → Resident approves live → Guard checks in → show one small-feature moment (double-approval blocked / auto-expire / double-booking blocked)
- [ ] Tested — watched back full length, audio/screen captured cleanly, live-update moment clearly visible
- [ ] Committed

**Day 5 checkpoint:** ☐ clean repo, working seed, honest README, one diagram, demo video showing flagship flow live end-to-end. **Stop — no new features after this.**
