# Portl — 5-Day Build Plan (build → test → move on)

> **STATUS AS OF NOW:** Day 1 ✅ complete · Day 2 ✅ complete (flagship feature, fully verified) · **Backend deployed to production (Railway) + standalone Android APK built via EAS — done ahead of schedule, not originally part of this plan** · Day 3 → not yet started.

**How to use this document:** each step has three parts — what to build, how to check it actually works, and a stop rule. Don't move to the next step until the current one passes its check. Skipping the check is how bugs pile up and eat your Day 5.

Keep a terminal split into two: one running your backend, one for commands. Keep Postman (or the Thunder Client VS Code extension — lighter weight) open the whole time for manual API testing before you ever touch the mobile app.

---

# DAY 1 — Foundation ✅ COMPLETE

### Step 1.1 — Scaffold the monorepo ✅ DONE
Turborepo + `apps/api` (Node+TS) + `apps/mobile` (Expo). Verified: `tsc --noEmit` clean, Expo default screen loaded, `/health` returned `{status:"ok"}`. No issues.

### Step 1.2 — Database schema (all 14 entities) ✅ DONE
Full `schema.prisma` written, including the extra design decisions locked in during the build (not in the original plan's exact wording):
- `flatId`/`gateId` nullable FKs directly on `User` (not a separate `ResidentProfile` table)
- Dedicated `Gate` entity, same relational pattern as `Flat`
- `ON DELETE`: Tower/Flat/Gate → parent = Cascade; User → Flat/Gate = `SetNull` (never cascade-delete a person's account)
- `ServiceProvider` kept minimal per §9 (no ratings/reviews)

**Bug found and fixed:** `id` fields were missing `@default(dbgenerated("gen_random_uuid()"))`, so Prisma Studio silently saved rows with empty IDs. Caught by manually testing the Society→Tower→Flat insert, not by trusting a walkthrough summary.

### Step 1.3 — First shared Zod schema + the "3 places" habit ✅ DONE
`LoginSchema`/`RegisterSchema` written and verified with real parse tests (6/6 passed).

**Bug found and fixed (significant):** `packages/shared`'s `tsconfig.json` had `noEmit: true` — it was only ever used for type-checking, never actually compiling `.ts` → real `.js`. This worked invisibly everywhere in dev (via `tsx`'s on-the-fly transform) but broke the moment anything tried to load it without `tsx` — which is exactly what happened later in both Railway (plain `node`) and EAS (Metro bundler) production environments. Fixed by adding a real `tsconfig.build.json`, pointing `package.json`'s `main`/`exports` at compiled `dist/` output, and — critically — adding a `postinstall` hook (`"postinstall": "npm run build"`) so `packages/shared` builds itself automatically in *any* fresh environment, not just when manually remembered.

### Step 1.4 — Auth: register + login ✅ DONE
JWT with `{userId, role, societyId, flatId}`, bcrypt hashing, verified via Postman + jwt.io payload check.

### Step 1.5 — RBAC: three-lock system ✅ DONE
`requireRole()` + row-level scoping verified with a real cross-flat access attempt (blocked correctly). `rbac.test.ts` written as an actual automated test.

### Step 1.6 — Extend auth to Guard and Admin ✅ DONE
Seed script created (`Society`, `Tower`, `Flat`, `Gate`, 3 role users — `resident@portl.dev`, `guard@portl.dev`, `admin@portl.dev`, password `password123`). All verified with correct role/scope per token.

**Day 1 checkpoint: ✅ met.** Three working logins, real DB with relations, shared schema pattern working, passing RBAC test.

---

# DAY 2 — The visitor approval flow, fully wired ✅ COMPLETE

### Step 2.1 — Visitor request schema + create endpoint ✅ DONE
`VisitorRequestSchema`, `POST /visitor-requests` (Guard-only, `PENDING`). Verified: valid POST, missing-field 400, Resident-token 403.

### Step 2.2 — Status state machine ✅ DONE
`ALLOWED_TRANSITIONS` + `assertValidTransition()`. Verified: valid transition succeeds, invalid/skipped transitions cleanly rejected.

### Step 2.3 — Row-level scoping on visitor endpoints ✅ DONE
Verified: Resident A blocked from PATCHing Resident B's request (403), A's GET excludes B's data.

### Step 2.4 — Redis distributed lock ✅ DONE
Verified with a real concurrency test — two near-simultaneous POSTs for the same flat, confirmed one succeeds and one gets a clean 409, no duplicate row.

### Step 2.5 — Socket.IO real-time updates ✅ DONE
`visitor:new` / `visitor:decided` events verified live, no manual refresh needed.

### Step 2.6 — Idempotency key ✅ DONE
Verified with a real repeat-request test — same key sent twice, confirmed only one `ApprovalDecision` row was created.

### Step 2.7 — Wire the mobile app ✅ DONE
Guard "create visitor" + Resident "incoming request" screens built, styled with the locked design tokens (terracotta/amber/slate role accents, status-color badges). Verified end-to-end on a real device: create → live update → approve → live update → force-quit/reopen still shows correct state.

**Day 2 checkpoint: ✅ met.** Flagship feature works end-to-end — locking, state machine, scoping, replay protection, live updates, real screens, all personally verified rather than trusted from a walkthrough.

---

# ⭐ UNPLANNED BUT COMPLETED — Production deployment + standalone APK

*Not part of the original 5-day plan — originally, deployment/APK work wasn't scheduled until informally "whenever," likely folded into Day 5 packaging. Done early instead, ahead of the plan, because it surfaced (and forced fixing) several real bugs that would have been much harder to debug later.*

**Backend deployed live on Railway** (`apps/api`), through three real build/runtime failures, each fixed properly rather than papered over:
1. Node version mismatch (Railway defaulting to Node 18; fixed via engines field + explicit override)
2. Monorepo root-directory misconfiguration — first scoped too narrow (broke `@portl/shared` resolution, 404 from npm registry trying to fetch a private local package), then corrected to repo root with `--workspace` flags scoping the actual build/start commands
3. Prisma client never generated before `tsc` ran in a fresh environment (`prisma generate && tsc` fix)
4. The Step 1.3 `packages/shared` compiled-output gap resurfacing at runtime in production (plain `node`, no `tsx`) — root-caused and fixed with the `tsconfig.build.json` + `postinstall` approach described above

**Production infrastructure wired:**
- Postgres + Redis provisioned on Railway, linked to the API service via variable references (not manually copy-pasted, so they stay in sync)
- Production database migrated (`prisma migrate deploy` against the public connection string) and seeded with real demo data
- Missing `JWT_SECRET` env var identified and added (root cause of an initial production login 500 error)

**Mobile app pointed at production:**
- `getApiBaseUrl()` in `apps/mobile/src/lib/api.ts` updated with an `EXPO_PUBLIC_API_URL` override that takes priority over all existing local-dev detection logic (LAN IP detection, Android emulator alias, localhost fallback) — zero regression to the existing dev workflow
- Socket connection required no separate fix, since it already derived its URL from the same shared constant

**Standalone Android APK built and verified:**
- EAS project configured, `eas.json` set up with `preview` (APK) and `production` (AAB, for later Play Store submission) build profiles, each with the Railway URL baked in via `env`
- Same `packages/shared` build-step bug surfaced a third time here (EAS's Metro bundler, same root cause as Railway) — fixed once, at the source, via the `postinstall` hook, which resolved it in all three environments simultaneously
- APK downloaded, sideloaded onto a real Android device, and confirmed working end-to-end against the live production backend (create visitor → live update → approve, all real, no Expo Go, no QR code)

**Why this matters for the rest of the plan:** the demo video (Step 5.5) can now show a real installed app instead of Expo Go, which is a stronger demo than originally planned. It also means Day 3–4's work should be tested against this same deployed instance periodically, not just localhost, to make sure nothing introduces a new environment-specific gap.

---

# DAY 3 — Strengthen (reliability + proof) — NOT YET STARTED

### Step 3.1 — BullMQ push notification fallback

**Build:**
Add a delayed push notification job (BullMQ) when a visitor request is created, that's skipped if the resident already responded via socket before the delay fires.

**Test before moving on:**
- No response within the delay → push notification arrives on device
- Immediate approval via socket → confirm the queued push job is safely skipped (check logs, not just "nothing bad happened")

**Stop rule:** don't move on until you've actually seen both branches (push-fires and push-skipped) happen, not just one of them.

---

### Step 3.2 — Auto-expire delayed job

**Build:**
A delayed BullMQ job that transitions a `VisitorRequest` to `EXPIRED` if it's still `PENDING` when the job runs.

**Test before moving on:**
- Temporarily shorten the delay (e.g. 15s) to confirm it actually flips to EXPIRED and the Guard's screen reflects it via socket
- Approve the request before the delay fires → confirm the expire job does nothing (no incorrect overwrite)
- **Revert the delay back to a realistic production value before moving on** — easy to forget

**Stop rule:** don't leave the shortened test delay in place — this is a classic "worked in testing, embarrassing in demo" trap.

---

### Step 3.3 — Audit trail immutability check

**Build:**
Confirm (don't just assume) that every status change writes a new `ApprovalDecision` row rather than overwriting the previous one.

**Test before moving on:**
- Run a request through its full lifecycle (PENDING→APPROVED→CHECKED_IN→CHECKED_OUT) and confirm 4 distinct rows exist in Prisma Studio
- Cross-check that `VisitorRequest.status` always matches the most recent `ApprovalDecision` row (run this as a manual query, not just a glance)

---

### Step 3.4 — Formalize RBAC + state-machine tests

**Build:**
A real automated test suite (vitest/jest or Node's built-in test runner) covering: auth, RBAC scoping (both generic and visitor-specific), state transitions, idempotency.

**Test before moving on:**
- `npm test` passes cleanly from a fresh checkout (`npm install` + seed only, nothing else)
- Deliberately break one check (e.g. comment out `requireRole` on a route) and confirm the relevant test actually fails — proves the suite catches real problems

**End of Day 3 checkpoint (target):** flagship feature resilient (works even if a phone is offline or a request retries), fully audited, provably tested.

---

# DAY 4 — Remaining modules (reuse, don't reinvent) — NOT YET STARTED

### Step 4.1 — Notices (Admin creates, Residents read)

**Build:** `NoticeSchema`, `POST /notices` (Admin only), `GET /notices` (scoped to `societyId` from the token, cached in Redis for ~60s).

**Test:**
- Admin can create, Resident gets 403 trying to create
- Resident's GET only shows their own society's notices (seed a second society to actually test this)
- Cache busts correctly on new notice — no stale wait

**Stop rule:** don't move on if a stale cache is hiding a brand-new notice.

---

### Step 4.2 — Polls (with the DB-level unique-vote constraint)

**Build:** `PollSchema`, `PollVoteSchema`, `POST /polls` (Admin), `POST /polls/:id/vote` (Resident).

**Test:**
- A resident votes once → succeeds
- Same resident votes again → fails via the DB unique constraint `(pollId, userId)`, not an app-level check — verify by calling the endpoint twice back-to-back
- Poll results endpoint correctly tallies votes

**Stop rule:** if you can vote twice by racing two requests, the constraint isn't actually enforced at the DB level.

---

### Step 4.3 — Complaints (reuse the state-machine pattern)

**Build:** `ComplaintSchema`, `OPEN → IN_PROGRESS → RESOLVED` transition table (reuse the Step 2.2 pattern, don't rewrite it), `POST /complaints` (Resident), `PATCH /complaints/:id` (Admin).

**Test:**
- Resident creates, scoped correctly on read
- Admin transitions valid/invalid stages correctly
- Resident tries to PATCH status themselves → 403

---

### Step 4.4 — Amenity booking (double-booking prevention)

**Build:** `AmenitySchema`, `AmenityBookingSchema`, `POST /amenities/:id/book` wrapped in `prisma.$transaction` (check-then-insert).

**Test:**
- Single booking succeeds
- Two simultaneous bookings for the exact same slot → only one succeeds, other gets a clean conflict
- Different slot, same time → succeeds (not over-blocking)

**Stop rule:** if double-booking is possible under a race, fix it even under time pressure.

---

### Step 4.5 — Wire remaining mobile screens

**Build:** Notices, Polls, Complaints, Amenities screens — reuse the card/screen patterns and design tokens from Day 2.

**Test:**
- Walk each screen as each relevant role, on a real device
- Test empty states and error states, not just the happy path

**End of Day 4 checkpoint (target):** every module has a working, enforced screen. Better 3 solid than 4 half-working.

---

# DAY 5 — Polish and package — NOT YET STARTED

### Step 5.1 — Loading, empty, and error states pass

**Build:** loading skeleton/spinner, empty state with clear message, visible error message on failed requests, on every screen.

**Test:** airplane mode mid-action → real error shown · cleared seed data → sensible empty states, not blank screens.

---

### Step 5.2 — Seed script for demo

**Build:** Finalize `seed.ts` with demo credentials for all 3 roles + one pre-seeded PENDING visitor request.

*Note: this already exists and has been run successfully against production once — this step now is really about finalizing/polishing it, not building from scratch.*

**Test:** wipe DB, migrate + seed from scratch, confirm all 3 logins work and the pending request exists. Do this on a clean clone if possible.

---

### Step 5.3 — README with the enforcement trace table

**Build:** per-module "Enforced at: App / API route / Service layer / DB constraint" table.

**Test:** read it as a first-time stranger — setup instructions alone should be enough.

---

### Step 5.4 — Architecture diagram + known limitations section

**Build:** one diagram of the request path, plus an honest "known limitations" section.

*Note: this diagram should now also reflect the production deployment topology (Railway + EAS), since that's real and demoable, not just the original local-dev architecture.*

---

### Step 5.5 — Demo video

**Build:** walkthrough — Guard creates → Resident approves live → Guard checks in → show one small-feature moment.

*Note: this can now be recorded using the actual installed APK on a real device, talking to the live production backend — stronger than the originally-planned Expo Go / QR-code demo.*

**Test:** watch back full length, confirm the live-update moment is clearly visible.

**End of Day 5 checkpoint (target):** clean repo, working seed, honest README, one diagram, demo video showing the flagship flow live end-to-end. Stop — no new features after this.
