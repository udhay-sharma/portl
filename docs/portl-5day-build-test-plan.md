# Portl — 5-Day Build Plan (build → test → move on)

**How to use this document:** each step has three parts — what to build, how to check it actually works, and a stop rule. Don't move to the next step until the current one passes its check. Skipping the check is how bugs pile up and eat your Day 5.

Keep a terminal split into two: one running your backend, one for commands. Keep Postman (or the Thunder Client VS Code extension — lighter weight) open the whole time for manual API testing before you ever touch the mobile app.

---

# DAY 1 — Foundation (nothing user-facing yet, and that's fine)

### Step 1.1 — Scaffold the monorepo

**Build:**
```bash
npx create-turbo@latest portl
cd portl
mkdir -p apps/api packages/shared/schemas packages/shared/types packages/shared/permissions packages/shared/constants
```
Set up `apps/api` as a plain Node + TypeScript project (not one of the turbo templates — you want full control). Set up `apps/mobile` with `npx create-expo-app@latest`.

**Test before moving on:**
- Run `npx tsc --noEmit` inside `packages/shared` — should complete with zero errors on an empty file
- Run the Expo app (`npx expo start`) and confirm the default screen loads on your phone/simulator
- Run your API's placeholder server (`GET /health` returning `{ status: "ok" }`) and hit it with curl: `curl localhost:3000/health`

**Stop rule:** don't write a single schema or route until both apps boot cleanly and `/health` responds. If either has a broken setup, every hour after this compounds the pain.

---

### Step 1.2 — Database schema (all entities, even ones you'll build later)

**Build:**
Install Prisma (`npx prisma init`), write your full `schema.prisma`: `Society`, `Tower`, `Flat`, `User`, `VisitorRequest`, `ApprovalDecision`, `Notice`, `Poll`, `PollVote`, `Complaint`, `Amenity`, `AmenityBooking`, `ServiceProvider`. Add the `PollVote` unique constraint `(pollId, userId)` now while you remember — it's one line and easy to forget later.

**Test before moving on:**
- `npx prisma migrate dev --name init` — should run without errors and create real tables
- `npx prisma studio` — open it, manually confirm every table exists with the columns you expect
- Manually insert one `Society`, one `Tower`, one `Flat` through Prisma Studio, and confirm the relations actually link (click through from Society → Tower → Flat in the UI)

**Stop rule:** if Prisma Studio can't show you connected data across the relations you designed, your schema has a mistake — fix it now. Changing the schema later, after real data and code depend on it, costs 3x more.

---

### Step 1.3 — First shared Zod schema + the "3 places" habit

**Build:**
In `packages/shared/schemas`, write `auth.schema.ts` with a `LoginSchema` (email/phone + password) and `RegisterSchema`. Export inferred types via `z.infer<typeof LoginSchema>`.

**Test before moving on:**
- Write a throwaway test file that imports `LoginSchema` and runs `.parse()` against both valid and invalid input — confirm it throws on invalid input, passes on valid
- Confirm `packages/shared` builds and can be imported from `apps/api` (`import { LoginSchema } from '@portl/shared'`) without a module resolution error

**Stop rule:** if you can't cleanly import from `packages/shared` into `apps/api` right now, fix your workspace config before writing more schemas — this exact wiring is what your whole "shared package" story depends on.

---

### Step 1.4 — Auth: register + login (Resident role only, for now)

**Build:**
API routes: `POST /auth/register`, `POST /auth/login`. Use `LoginSchema`/`RegisterSchema` for validation (this is "use #2" of your habit from 1.3). Hash passwords with bcrypt. On login, issue a JWT with `{ userId, role, societyId, flatId }`.

**Test before moving on:**
- In Postman: register a test resident → should return 201 and a user record (check Prisma Studio, confirm the row exists, confirm the password is hashed not plaintext)
- Log in with that user → should return an access token
- Decode the token at [jwt.io](https://jwt.io) and manually confirm the payload has the right `role` and `flatId` — this is worth doing by eye once so you trust it going forward
- Try logging in with a wrong password → should get 401, not 200

**Stop rule:** don't build the RBAC middleware until login reliably returns a correct, decodable token. Everything else depends on this token being right.

---

### Step 1.5 — RBAC: the three-lock system (Resident first, then extend)

**Build:**
Write the `requireRole()` preHandler (Lock 2) and apply it to a test protected route like `GET /me`. Write one query that demonstrates Lock 3 — row-level scoping — e.g. `GET /visitor-requests` filtered by `req.user.flatId`, even though there's no real data yet.

**Test before moving on:**
- Call `GET /me` with no token → 401
- Call `GET /me` with a valid Resident token → 200, correct user data
- Manually create a second Flat + second Resident user in Prisma Studio. Log in as Resident A, try to fetch Resident B's flat data by guessing/hardcoding their flat ID in a query param — confirm it's ignored and only A's own data comes back
- Write this exact test as an actual test file (`rbac.test.ts`) now, not just a manual Postman check — you'll reuse this pattern constantly, and having it automated from Day 1 pays off every day after

**Stop rule:** if a resident can see another flat's data by guessing an ID, do not proceed to Day 2. This is the single most important security property in the whole app.

---

### Step 1.6 — Extend auth to Guard and Admin roles

**Build:**
Add `role` selection to registration (or seed Guard/Admin accounts directly via a seed script — more realistic, since guards/admins are usually created by an admin, not self-registered). Write `apps/api/prisma/seed.ts` with one Resident, one Guard, one Admin, all with known passwords.

**Test before moving on:**
- Run `npx prisma db seed`, confirm all three users exist in Prisma Studio with correct roles
- Log in as each of the three and confirm each token has the correct role and scope (`flatId` for Resident, `gateId` for Guard, nothing extra for Admin)
- Hit an admin-only test route with a Resident token → confirm 403

**End of Day 1 checkpoint:** you should have three working logins, a real database with relations, one working shared schema pattern, and a passing RBAC test. Nothing looks impressive in the app yet — that's expected and correct.

---

# DAY 2 — The visitor approval flow, fully wired

This is the most important day. Don't let it slip.

### Step 2.1 — Visitor request schema + create endpoint

**Build:**
`VisitorRequestSchema` in shared (name, purpose, visitorType, flatId, photoUrl optional). `POST /visitor-requests`, Guard-only (`requireRole('GUARD')`), validated against the schema, creates a row with `status: PENDING`.

**Test before moving on:**
- Postman: as Guard, POST a valid visitor request → 201, row appears in Prisma Studio with status PENDING
- POST with a missing required field → 400, not a 500 crash (this proves your Zod validation is actually wired, not just present in a file)
- Try the same POST as a Resident token → 403 (RBAC is enforced here too, not just on reads)

**Stop rule:** don't add real-time or locking yet — first prove the plain CRUD path is solid.

---

### Step 2.2 — The status state machine (transition table)

**Build:**
Write `ALLOWED_TRANSITIONS` and `assertValidTransition()` in `packages/shared/permissions`. Add `PATCH /visitor-requests/:id` that calls this function before updating status.

**Test before moving on:**
- PATCH a PENDING request to APPROVED → succeeds
- PATCH that same now-APPROVED request straight to PENDING → should be rejected (invalid transition), confirm you get a clean error, not a silent success
- PATCH to CHECKED_IN directly from PENDING (skipping APPROVED) → should be rejected

**Stop rule:** if any invalid transition silently succeeds, fix this before adding sockets — a real-time bug on top of a broken state machine is much harder to debug than a broken state machine alone.

---

### Step 2.3 — Row-level scoping on the visitor endpoints

**Build:**
`GET /visitor-requests` for Residents should only return requests where `flatId === req.user.flatId`. `PATCH` should reject if a Resident tries to approve a request that isn't theirs.

**Test before moving on:**
- Resident A tries to PATCH (approve) a visitor request belonging to Resident B's flat → 403
- Resident A's `GET /visitor-requests` never includes Resident B's requests, even though both exist in the DB
- Add these two cases to your `rbac.test.ts` from Day 1 — same pattern, new endpoint

**Stop rule:** this is Lock 3 again, now on your flagship feature specifically — don't skip re-verifying it here even though you tested the pattern generically on Day 1.

---

### Step 2.4 — Redis distributed lock

**Build:**
Install Redis locally (or use a free hosted instance — Upstash is easy for hackathons). On `POST /visitor-requests`, acquire `SET lock:flat:{flatId} NX PX 5000` before creating the row; release after.

**Test before moving on:**
- Fire two POST requests for the *same* flat within milliseconds of each other (use Postman's runner, or a tiny script with `Promise.all`) — confirm one succeeds and the other gets a clean 409, not a duplicate row or a crash
- Confirm a normal single request (no race) still works exactly as before — this proves the lock isn't accidentally blocking legitimate traffic

**Stop rule:** if legitimate single requests start failing after adding the lock, your `PX` (lock expiry) or release logic is wrong — fix before continuing, don't work around it in the mobile app.

---

### Step 2.5 — Socket.IO real-time updates

**Build:**
Wire Socket.IO server-side. On successful `POST /visitor-requests`, emit `socket.to(flatRoom).emit('visitor:new', payload)`. On `PATCH` (decision), emit to the guard's room.

**Test before moving on:**
- Use a simple Socket.IO test client (a plain HTML file with the socket.io-client script is enough) connected to the flat's room. Trigger a POST via Postman, confirm the test client receives the `visitor:new` event with correct payload — before touching the mobile app at all
- Repeat for the `visitor:decided` event on PATCH

**Stop rule:** confirm sockets work with a plain test client first. Debugging sockets *and* React Native navigation *and* your backend all at once is how a whole day disappears — isolate the variable.

---

### Step 2.6 — Idempotency key (replay protection)

**Build:**
Require an `idempotencyKey` (client-generated UUID) on the `PATCH` decision endpoint. Store recently-seen keys in Redis with a short TTL; if a key's been seen, return the original response instead of reprocessing.

**Test before moving on:**
- Send the exact same PATCH twice with the same `idempotencyKey` → confirm only one `ApprovalDecision` row is created, and the second response matches the first
- Send it twice with two *different* keys → confirm this correctly creates a rejection (invalid transition, since it's no longer PENDING) — this proves the key isn't accidentally suppressing legitimate different requests

**Stop rule:** none — this one's quick and low-risk, but do run both checks above before considering it done.

---

### Step 2.7 — Wire the mobile app to this flow (finally)

**Build:**
Now — and only now — build the Guard's "create visitor" screen and the Resident's "incoming request" screen, connected to the real endpoints and socket events from above.

**Test before moving on:**
- On a real device (or two simulators), log in as Guard on one, Resident on the other. Create a visitor request from the Guard screen, confirm the Resident's screen updates live within a second or two, with no manual refresh
- Approve from the Resident screen, confirm the Guard's screen updates live
- Kill and reopen the Resident's app mid-flow, confirm the pending request still shows correctly on reload (i.e. it's not relying purely on the socket event and forgetting to also fetch on load)

**End of Day 2 checkpoint:** the entire flagship feature works end-to-end on real devices, with locking, state machine enforcement, scoping, replay protection, and live updates all functioning together. This is your demo centerpiece — it should feel solid before you move on.

---

# DAY 3 — Strengthen what you built (reliability + proof)

### Step 3.1 — BullMQ push notification fallback

**Build:**
On visitor request creation, enqueue a BullMQ job that sends a push notification (Expo push tokens are easiest here — no native FCM setup needed) after a short delay, *only if* the resident hasn't already responded.

**Test before moving on:**
- Create a visitor request, don't touch the Resident app at all (simulate them not looking at their phone) → confirm the push notification actually arrives on the device a few seconds later
- Create a request and immediately approve it from within the socket-connected app → confirm the queued push job either doesn't fire or is safely skipped (check your queue logs) — this proves you're not spamming decided requests

**Stop rule:** if pushes fire even after a decision's been made, fix the job's "still pending?" check before moving on — this is exactly the kind of inconsistency an evaluator would flag.

---

### Step 3.2 — Auto-expire delayed job

**Build:**
On creation, also enqueue a delayed BullMQ job (e.g. 5 minutes out) that transitions the request to `EXPIRED` if it's still `PENDING` when the job runs.

**Test before moving on:**
- Temporarily shorten the delay to 15 seconds for testing, create a request, don't respond, confirm it flips to EXPIRED in the DB and the Guard's screen reflects it via socket
- Create a request and approve it well before the delay fires → confirm the expire job correctly does nothing (checks current status before acting, doesn't blindly overwrite)
- Set the delay back to something realistic (a few minutes) once confirmed

**Stop rule:** none, but don't forget to revert your testing delay value — shipping a 15-second expiry would break your own demo.

---

### Step 3.3 — Audit trail (ApprovalDecision) — verify it's actually immutable

**Build:**
If you haven't already, confirm every status change writes a new `ApprovalDecision` row (who, what, when) rather than just updating a field on `VisitorRequest`.

**Test before moving on:**
- Take one visitor request through its full lifecycle (PENDING → APPROVED → CHECKED_IN → CHECKED_OUT) and confirm in Prisma Studio that you have four distinct `ApprovalDecision` rows, not one row being overwritten
- Confirm the `VisitorRequest.status` field always matches the *latest* `ApprovalDecision` — write one query that cross-checks this and run it manually

**Stop rule:** if you find status drift between the two tables, fix the write logic now — an inconsistent audit trail is worse than no audit trail, because it looks real but lies.

---

### Step 3.4 — Formalize your RBAC + state-machine tests

**Build:**
Turn all the manual Postman checks from Days 1–2 into a real automated test suite (`vitest` or `jest`): auth, RBAC scoping (both generic and visitor-specific), state transitions, idempotency.

**Test before moving on:**
- Run the full suite (`npm test`) from a clean checkout — confirm everything passes with no manual setup steps beyond `npm install` and a seed
- Deliberately break one thing (e.g. comment out the `requireRole` check on one route) and confirm the relevant test actually fails — this proves your tests are catching real problems, not just passing regardless

**End of Day 3 checkpoint:** your flagship feature is now resilient (works even if a phone is offline or a request retries), fully audited, and provably tested — not just "seems to work when I click through it."

---

# DAY 4 — Remaining modules (reuse, don't reinvent)

For each module below, follow the same build → test → move-on rhythm. The good news: because you built solid patterns on Days 1–3, each of these should be noticeably faster than the visitor flow was.

### Step 4.1 — Notices (Admin creates, Residents read)

**Build:** `NoticeSchema`, `POST /notices` (Admin only), `GET /notices` (scoped to `societyId` from the token, cached in Redis for ~60s).

**Test:**
- Admin can create, Resident gets 403 trying to create
- Resident's GET only shows their own society's notices, not another society's (seed a second society to actually test this, don't just assume it)
- Confirm the cache busts correctly: create a new notice, confirm it shows up on the next GET without waiting for the full cache TTL

**Stop rule:** don't move on if a stale cache is hiding a brand-new notice — that's a visible, embarrassing bug in a live demo.

---

### Step 4.2 — Polls (with the DB-level unique-vote constraint)

**Build:** `PollSchema`, `PollVoteSchema`, `POST /polls` (Admin), `POST /polls/:id/vote` (Resident).

**Test:**
- A resident votes once → succeeds
- The same resident tries to vote again on the same poll → should fail because of the DB unique constraint (`(pollId, userId)`), not because of an app-level "already voted" check — deliberately try to bypass any app-level check (e.g. call the endpoint twice back-to-back) to confirm the DB itself is what's stopping it
- Poll results endpoint correctly tallies votes

**Stop rule:** if you can vote twice by racing two requests, your constraint isn't actually enforced at the DB level — check your Prisma schema and migration.

---

### Step 4.3 — Complaints (reuse the state-machine pattern)

**Build:** `ComplaintSchema`, `OPEN → IN_PROGRESS → RESOLVED` transition table (copy the pattern from Step 2.2, don't rewrite it from scratch), `POST /complaints` (Resident), `PATCH /complaints/:id` (Admin).

**Test:**
- Resident creates a complaint, confirm it's scoped to their flat/society on read
- Admin transitions it through valid stages, confirm invalid transitions (e.g. RESOLVED back to OPEN) are rejected exactly like the visitor flow was
- Resident tries to PATCH the status themselves → 403 (only Admin should move complaint status)

**Stop rule:** none if the pattern reuse goes smoothly — this should be your fastest module.

---

### Step 4.4 — Amenity booking (double-booking prevention)

**Build:** `AmenitySchema`, `AmenityBookingSchema`, `POST /amenities/:id/book` — wrap the "check slot is free, then insert" logic in a single `prisma.$transaction`.

**Test:**
- Book a slot → succeeds
- Fire two booking requests for the *exact same slot* at the same time (same technique as your Redis lock test on Day 2) → confirm only one succeeds, the other gets a clean conflict response, and you never end up with two bookings for one slot
- Book a *different* slot on the same amenity at the same time as an existing booking → confirm this correctly succeeds (proves you're not over-blocking)

**Stop rule:** if double-booking is possible under a race, this is a real bug worth fixing even under time pressure — it directly maps to a "transactional integrity" line item in the brief.

---

### Step 4.5 — Wire remaining mobile screens

**Build:** Notices list/create, Polls list/vote, Complaints list/create/status, Amenities browse/book — reusing your card and screen patterns from Day 2.

**Test:**
- Walk through each screen as each relevant role, on a real device, exactly like you did for the visitor flow
- Specifically test empty states (no notices yet, no complaints yet) and error states (submit an invalid form) — don't just test the happy path

**End of Day 4 checkpoint:** every module in the brief has a working screen, backed by the same enforcement patterns as your flagship feature. If you're short on time, it's better to have 3 of these fully solid than all 4 half-working — cut here, not on testing rigor.

---

# DAY 5 — Polish and package (stop building features by midday)

### Step 5.1 — Loading, empty, and error states pass (morning, ~2 hrs)

**Build:** Go screen by screen and add/fix: a loading skeleton or spinner, an empty state with a clear message, and a visible error message on failed requests (not a silent failure).

**Test:**
- Turn on airplane mode mid-session and try an action — confirm the app shows a real error, not an infinite spinner or a crash
- Clear your seed data for one role and confirm every list screen shows a sensible empty state, not a blank white screen

**Stop rule:** don't skip this even though it feels like it's "just polish" — the brief explicitly names loading/empty/error states as scored items, and they're the cheapest points on the table.

---

### Step 5.2 — Seed script for demo (1 hr)

**Build:** Finalize `seed.ts` with demo credentials for all three roles, and pre-seed one PENDING visitor request so a reviewer can test the approval flow within a minute of setup, without having to manually create data first.

**Test:**
- Wipe your database completely, run migration + seed from scratch (`npx prisma migrate reset`), confirm all three demo logins work and the pending visitor request is there
- Do this exact process on a clean clone of your repo if you can — this is the closest simulation of what the evaluator will actually do

**Stop rule:** if a clean clone + seed doesn't work first try, this is the single highest-priority fix left — an evaluator who can't get your demo running won't get far enough to see your good engineering.

---

### Step 5.3 — README with the enforcement trace table (1–1.5 hrs)

**Build:** Write the README section that states, per module, "Enforced at: App / API route / Service layer / DB constraint" — literally hand the evaluator the trace map from this whole plan.

**Test:**
- Read it once pretending you've never seen the project before — confirm setup instructions alone (clone, install, migrate, seed, run) are enough to get the app running with no tribal knowledge assumed

---

### Step 5.4 — Architecture diagram + known limitations section (~30 min)

**Build:** One diagram: request → auth check → validation → service logic (+ lock) → DB constraint → socket/queue emit. Plus a short, honest "known limitations" section (mock payments, etc.)

**Test:** none needed — just make sure the diagram matches what you actually built, not what you originally planned on Day 1 (plans drift, diagrams should reflect reality).

---

### Step 5.5 — Demo video (1–1.5 hrs)

**Build:** Record a walkthrough: log in as Guard, create a visitor request, switch to Resident, approve it live, switch back to Guard, check in the visitor. Briefly show one of the "small feature" moments (double-approval blocked, auto-expire, double-booking blocked) since these are cheap to show and high-signal.

**Test:**
- Watch it back once, full length — confirm audio/screen recording actually captured cleanly and the live-update moment (the socket update) is clearly visible, since that's your strongest proof point

**End of Day 5 checkpoint:** clean repo, working seed, honest README, one clear diagram, and a demo video that shows your flagship flow working live end-to-end. Stop here — don't add last-minute features after this point.
