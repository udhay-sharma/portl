# Portl — Evaluator-Optimized Architecture

> **STATUS:** Sections 1–8 below describe the plan as designed AND as actually built through Day 2 — they've held up in practice, with a few concrete refinements noted inline. A new §12 documents the production deployment (Railway + EAS APK), which wasn't part of the original architecture but is now real, working infrastructure worth mentioning in your README and demo.

## 0. How an AI code evaluator actually scores you

Before the architecture, the operating theory this whole doc is built on:

An AI reviewer doesn't "feel" quality — it **traces**. It picks a claim (e.g. "resident can approve visitor") and walks the call graph: UI → API call → route handler → validation → service → DB → response → socket emit → UI update. Every hop that's missing, mocked, or inconsistent is a penalty. Every hop that's real, typed, and enforced at the *correct layer* is a reward.

So the meta-strategy is: **fewer features, each traceable end-to-end with defense-in-depth**, beats many features that are UI-only or backend-only. Everything below is chosen to survive a trace.

**Real update:** this traceability requirement turned out to matter for more than just the evaluator — it's also exactly what made the Railway/EAS deployment bugs findable. Each production failure (missing Prisma client, missing compiled shared package, missing env var) was diagnosable specifically *because* every layer was explicit and inspectable, not glued together with implicit assumptions. Defense-in-depth pays off in debugging, not just in scoring.

---

## 1. Tech stack — exact decisions

| Layer | Choice | Why the evaluator rewards it | Status |
|---|---|---|---|
| Mobile | Expo (SDK 51+), TypeScript strict mode | Matches spec requirement; strict mode = type-safety signal | ✅ Built, ✅ deployed as standalone APK via EAS |
| State | (as planned — client/UI state separate from server state) | Known senior-engineer pattern | — |
| Backend | Node.js + Fastify | Built-in schema validation, deliberate tool choice | ✅ Built, ✅ deployed live on Railway |
| DB | PostgreSQL + Prisma | Relational integrity for RBAC/flats/towers is not optional | ✅ Built (local via Docker), ✅ production instance provisioned on Railway |
| Realtime | Socket.IO with Redis adapter | Signals horizontal-scaling awareness | ✅ Built and verified live, both locally and against production |
| Auth | JWT (access token), bcrypt hashing | Standard, defensible | ✅ Built — refresh-token rotation not yet implemented (still just access tokens) |
| Validation | Zod, defined ONCE in `packages/shared` | Highest-leverage decision — see §5 | ✅ Built — **required a real compiled build step to actually work outside dev (`tsx`) environments, see §12 lessons** |
| Monorepo | Turborepo, `apps/mobile`, `apps/api`, `packages/shared` | Answers "are shared packages actually imported" | ✅ Built, confirmed working across 3 real environments (local, Railway, EAS) |
| Cache | Redis (also socket adapter + lock manager) | One tool, three jobs | ✅ Built and provisioned in production |
| Queue | BullMQ (Redis-backed) for notifications | Decouples approval from notification | ⏳ Not yet built — Day 3 |

---

## 2. Monorepo structure (the "dead shared package" trap)

```
portl/
  apps/
    mobile/          # Expo app
    api/              # Fastify server
  packages/
    shared/
      schemas/        # Zod schemas — SINGLE SOURCE OF TRUTH
      dist/           # ⚠️ compiled output — did NOT exist in the original plan, turned out to be required
```

**The trap, as originally written:** most teams create a `shared` package, put one type in it, import it once, and the evaluator's static check finds 90% dead code.

**A second trap, discovered in practice, not in the original doc:** even when a shared package IS genuinely imported in 3+ places (satisfying the rule below), it can still be silently broken in any environment that doesn't use `tsx`'s on-the-fly TypeScript transform. A `tsconfig.json` with `noEmit: true` means the package is *never actually compiled* — it works locally purely by coincidence of tooling, and breaks the moment something loads it with plain `node` (production) or Metro (EAS builds). **The fix:** a separate `tsconfig.build.json` (`noEmit: false`, real `outDir`), `package.json`'s `main`/`exports` pointing at compiled `dist/`, and a `postinstall` hook so the package rebuilds itself automatically on install in any environment — not something a developer has to remember to run manually.

**The original fix — concrete rule, still holds:** every Zod schema in `packages/shared/schemas` MUST be imported in at least 3 places:
1. API route
2. Service layer validation before DB write
3. Mobile form (`zodResolver`)

---

## 3. Data model (the backbone of RBAC + visitor flow)

Core entities — **as actually implemented**, refined slightly from the original sketch:

```
Society (1) → Tower (N) → Flat (N) → User (Resident, via nullable flatId FK)
Society (1) → Gate (N) → User (Guard, via nullable gateId FK)
User → Role (Resident | Guard | Admin)
VisitorRequest (state machine) → ApprovalDecision (audit trail, append-only)
Notice, Poll, PollVote, Complaint, Amenity, AmenityBooking, ServiceProvider
```

**Refinement from the original doc:** the original sketch mentioned a separate `ResidentProfile` entity. In practice, this was simplified to a nullable `flatId`/`gateId` directly on `User` — null for whichever role doesn't apply. This was a deliberate build-time tradeoff (less normalized, but far fewer joins, and the "required for this role" rule is enforced at the application/Zod layer instead of the DB layer) — worth noting as an explicit scoping decision in the README, same spirit as §9's "what NOT to build."

**State machine — implemented exactly as planned:**
```
PENDING → APPROVED → CHECKED_IN → CHECKED_OUT
        → REJECTED
        → EXPIRED (auto, via BullMQ — not yet built, Day 3)
```
`ALLOWED_TRANSITIONS` + `assertValidTransition()` are real, tested, and verified to reject invalid/skipped transitions.

---

## 4. Auth & RBAC — enforced at three layers, not one

**As built, all three layers confirmed working:**

**Layer 1 — JWT claims:** `{userId, role, societyId, flatId?, gateId?}`, signed server-side. ✅

**Layer 2 — Fastify preHandler guard** (`requireRole()`). ✅ Verified: no token → 401, valid token → 200, wrong role → 403.

**Layer 3 — Row-level scoping in the service/query layer.** ✅ This is the layer that actually caught something real during testing: a manual attempt to fetch/modify another flat's visitor request by ID was correctly blocked (403), confirmed by hand, not just assumed from a walkthrough summary. `rbac.test.ts` exists as a real automated test, extended to cover visitor-request-specific scoping in Step 2.3.

---

## 5. The visitor approval flow — your flagship traceable feature ✅ COMPLETE

**End-to-end path — fully built and personally verified, not just claimed:**

1. Guard creates visitor request → `POST /visitor-requests` (Zod-validated) ✅
2. Service layer creates row with `status: PENDING`:
   - Redis distributed lock on `flatId` ✅ — verified under real concurrent load (two simultaneous requests, one 409)
   - `socket.to(flatRoom).emit('visitor:new', ...)` ✅ — verified live, no refresh needed
   - BullMQ push fallback + auto-expire — ⏳ not yet built (Day 3, Steps 3.1/3.2)
3. Resident approves/rejects → `PATCH /visitor-requests/:id`, transition validated, immutable `ApprovalDecision` row written, `visitor:decided` emitted ✅
4. Guard's screen updates live ✅
5. Idempotency key on PATCH ✅ — verified with a real repeated-request test, confirmed only one audit row written

**This flow is now also verified running against the real production deployment** (Railway backend + standalone Android APK), not just localhost — a stronger proof point than the original plan anticipated having this early.

---

## 6. Runtime schema validation, done right (not decorative) ✅ AS PLANNED

No changes to this section's approach — Zod remains the single source of truth, consumed by API route validation, service-layer parsing, and mobile form resolution (`zodResolver`). The one addition worth noting: this only works correctly in *every* environment because of the `packages/shared` build-step fix described in §2 and §12 — the schema being "the single source of truth" was almost undermined by a packaging gap that had nothing to do with the schema's design itself.

---

## 7. Concurrency, locking, caching — concrete, demoable instances

| Mechanism | Status |
|---|---|
| Distributed lock (Redis) | ✅ Built, verified under real concurrency |
| Idempotency key | ✅ Built, verified with repeated requests |
| Optimistic locking (Prisma `version` column on Amenity) | ✅ Schema field exists, ⏳ enforcement logic not yet built (Day 4, Step 4.4) |
| Redis cache (Notices) | ⏳ Not yet built (Day 4, Step 4.1) |
| Delayed queue job (auto-expire) | ⏳ Not yet built (Day 3, Step 3.2) |

---

## 8. Module-by-module: backend enforcement checklist

Status unchanged from original plan for modules not yet built (Notices, Polls, Complaints, Amenities — all Day 4). Visitor approval enforcement (the one module built so far) is confirmed real per §5 above.

---

## 9. What NOT to build (protect your score-per-hour)

Unchanged from original — still the plan:
- Payment gateway — stub behind a `PaymentProvider` interface
- Service-provider directory — CRUD only, no ratings/reviews (confirmed in the actual schema — `ServiceProvider` has no rating/review fields)
- Notifications — deep push for visitor flow only, in-app + queued push elsewhere

---

## 10. Repo, README, demo — closing the loop for the evaluator

Unchanged in approach. **One addition worth making now that it's real:** the README's enforcement trace table and the architecture diagram (§5.4 of the build plan) should both mention the live Railway deployment and the installable APK — an evaluator (or judge) being able to install a real app, or hit a live API URL directly, is stronger evidence than a description of an architecture that only runs locally.

---

## 11. Suggested time allocation (solo builder, 5-day hackathon)

Original allocation held up well through Day 2 — if anything, Day 2 took real, substantial debugging effort (concurrency/idempotency testing legitimately takes time to do properly), consistent with the doc's own warning not to shortchange it. Days 3–4 remain as planned. Day 5's video/demo will now be recorded against the real deployed APK rather than Expo Go, which the original plan didn't anticipate having ready this early — a net positive, not a scope change.

---

## 12. NEW — Production deployment lessons (Railway + EAS)

*This section didn't exist in the original architecture doc — it's a record of what was actually learned getting the app running in real, non-local environments, since those lessons are worth understanding, not just having fixed.*

**The core lesson: "works locally" and "works everywhere" are different claims, and the gap between them is almost always about implicit tooling assumptions.**

Three separate production failures — on Railway (twice) and EAS (once) — traced back to the *same single root cause*: `packages/shared` was never actually compiled to real JavaScript. It worked locally purely because `tsx` (used for local dev) transforms TypeScript on the fly, silently masking the fact that the package had no real build output. The moment anything tried to load it without that transform — plain `node` in a Railway production container, or Metro's bundler during an EAS build — it broke, each time with a differently-worded error that looked unrelated until traced back to the same cause.

**Practical implication for the rest of this build:** any shared/internal package in a monorepo needs an explicit build step (with real output artifacts, not just type-checking) verified to work with a plain `node` invocation — not just verified via whatever dev-time tool happens to be transforming things invisibly.

**Other real fixes made along the way, each worth knowing about if similar symptoms reappear in Day 3–4 work:**
- Monorepo build tools (Railway's Railpack, in this case) sometimes need the **full workspace root** visible to correctly resolve internal workspace packages, even if the actual build/start commands are scoped to one specific app — scoping the build *context* too narrowly breaks workspace linking even though it looks like the "correct" isolation.
- Environment variables (`JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`) do not automatically carry over from a local `.env` file to a deployed environment — each one needs to be explicitly set in that platform's dashboard/config, and a missing one produces a generic 500 error rather than a clear "missing config" message, so this is worth checking early whenever a production environment throws an unexplained error.
- Mobile apps built as standalone binaries (EAS builds) don't have access to a local dev server's environment or `localhost` — they need their production API URL baked in explicitly at build time (`EXPO_PUBLIC_...` env vars declared in `eas.json`, not just a local `.env` file, since EAS builds run remotely and never see your local filesystem).
