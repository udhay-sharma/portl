# Portl — Evaluator-Optimized Architecture

## 0. How an AI code evaluator actually scores you

Before the architecture, the operating theory this whole doc is built on:

An AI reviewer doesn't "feel" quality — it **traces**. It picks a claim (e.g. "resident can approve visitor") and walks the call graph: UI → API call → route handler → validation → service → DB → response → socket emit → UI update. Every hop that's missing, mocked, or inconsistent is a penalty. Every hop that's real, typed, and enforced at the *correct layer* is a reward.

So the meta-strategy is: **fewer features, each traceable end-to-end with defense-in-depth**, beats many features that are UI-only or backend-only. Everything below is chosen to survive a trace.

---

## 1. Tech stack — exact decisions

| Layer | Choice | Why the evaluator rewards it |
|---|---|---|
| Mobile | Expo (SDK 51+), Expo Router, TypeScript strict mode | Matches spec requirement; strict mode = type-safety signal that's checkable by grepping `tsconfig.json` |
| State | Zustand (client/UI state) + TanStack Query (server state) | Separating server-cache state from UI state is a *known senior-engineer pattern*. Evaluators are trained on production codebases where this separation exists — Redux-for-everything reads as junior |
| Backend | Node.js + Fastify (not Express) | Fastify has built-in JSON schema validation, faster, signals you picked a tool deliberately rather than defaulting. Mention this explicitly in README |
| DB | PostgreSQL + Prisma | Relational integrity for RBAC/flats/towers is not optional here — a NoSQL choice for a permissions-heavy domain is an evaluator red flag. Prisma generates types the frontend can share |
| Realtime | Socket.IO with Redis adapter | Redis adapter signals "I understand horizontal scaling," not just "I used sockets" |
| Auth | JWT (short-lived access + refresh) via httpOnly-equivalent secure storage (Expo SecureStore) | Refresh rotation is a defense-in-depth signal |
| Validation | Zod, defined ONCE in `packages/shared`, imported by both API and app | This is the single highest-leverage decision in the whole project — see §5 |
| Monorepo | Turborepo, `apps/mobile`, `apps/api`, `packages/shared` | Directly answers "are shared packages actually imported" — you can literally grep import counts |
| Cache | Redis (also doubles as socket adapter + lock manager) | One tool, three jobs — efficiency signal |
| Queue | BullMQ (Redis-backed) for notifications | Decouples "visitor approved" from "push notification sent" — resilience signal |

**Signal this sends:** every tool choice has a one-line justification you can say out loud in a demo. Evaluators reward people who can defend decisions, not just list frameworks.

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
      types/           # Inferred from schemas via z.infer<>
      permissions/     # RBAC matrix + guard functions
      constants/       # visitor status enums, roles, etc.
```

**The trap:** most teams create a `shared` package, put one type in it, import it once, and the evaluator's static check finds 90% dead code. 

**The fix — concrete rule:** every Zod schema in `packages/shared/schemas` MUST be imported in at least 3 places:
1. API route (`fastify.post('/visitors', { schema: zodToJsonSchema(CreateVisitorSchema) })`)
2. Service layer validation before DB write (`CreateVisitorSchema.parse(input)`)
3. Mobile form (`zodResolver(CreateVisitorSchema)` in react-hook-form)

This single rule is what turns "shared package" from decoration into infrastructure. If you only do one thing from this doc, do this — it's the cheapest, highest-signal move available.

---

## 3. Data model (the backbone of RBAC + visitor flow)

Core entities, deliberately relational so enforcement can live at the DB layer:

```
Society (1) → Tower (N) → Flat (N) → ResidentProfile (N, one flat can have multiple residents)
User (1) → Role (Resident | Guard | Admin) → scoped to Society (+ Flat for Resident, + Gate for Guard)
Visitor (1) → VisitorRequest (state machine) → ApprovalDecision (audit trail, not overwritten)
Notice, Poll, PollVote, Complaint, Amenity, AmenityBooking, ServiceProvider
```

**Key decision — VisitorRequest is a state machine, not a boolean.**

```
PENDING → APPROVED → CHECKED_IN → CHECKED_OUT
        → REJECTED
        → EXPIRED (auto, via BullMQ delayed job)
```

Why this matters to an evaluator: a boolean `isApproved` field is a hardcoded-validation smell. A state machine with an explicit transition table that's enforced server-side (not just in UI conditionals) is exactly the "dynamic vs hardcoded" distinction the brief calls out. Implement the transition table as a pure function in `packages/shared`:

```ts
const ALLOWED_TRANSITIONS: Record<VisitorStatus, VisitorStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'EXPIRED'],
  APPROVED: ['CHECKED_IN', 'EXPIRED'],
  CHECKED_IN: ['CHECKED_OUT'],
  REJECTED: [],
  CHECKED_OUT: [],
  EXPIRED: [],
};
```

Every service-layer mutation calls `assertValidTransition(current, next)` before touching the DB. This one function, imported everywhere, is a concrete artifact an evaluator can point to as "enforcement is real."

---

## 4. Auth & RBAC — enforced at three layers, not one

The spec explicitly says residents/guards/admins "should only be able to access their own dashboards." Most hackathon teams enforce this only in the UI (hide the button). That's a guaranteed penalty under "backend enforcement matches UI claims."

**Layer 1 — JWT claims:** `{ userId, role, societyId, flatId?, gateId? }` signed server-side, never trust client-sent role.

**Layer 2 — Fastify preHandler guard**, generic and reusable:
```ts
function requireRole(...roles: Role[]) {
  return async (req, reply) => {
    if (!roles.includes(req.user.role)) throw new ForbiddenError();
  };
}
// usage: fastify.post('/notices', { preHandler: requireRole('ADMIN') }, handler)
```

**Layer 3 — Row-level scoping in the service/query layer**, not just route-level:
```ts
// A resident fetching visitor requests can ONLY see their own flat's, 
// even if they guess another flat's ID in the URL
const requests = await prisma.visitorRequest.findMany({
  where: { flatId: req.user.flatId, /* NOT req.query.flatId */ }
});
```

This third layer is the one almost nobody implements, and it's exactly what "visibility/security logic enforced at the DB/service layer" is testing for. Add a test file `rbac.test.ts` that specifically tries to fetch another flat's data with a valid-but-wrong-scope token and asserts 403/empty — this is a cheap, extremely high-signal artifact for an AI reviewer scanning your test directory.

---

## 5. The visitor approval flow — your flagship traceable feature

This is the feature to make bulletproof, since it's the one the evaluator will trace first (it's the headline use case in the brief).

**End-to-end path:**

1. Guard scans/enters visitor at gate → `POST /visitor-requests` (Zod-validated, rate-limited per gate device)
2. Service layer creates row with `status: PENDING`, then:
   - Acquires a **Redis distributed lock** keyed on `flatId` (`SET lock:flat:{id} NX PX 5000`) — prevents duplicate simultaneous requests for the same flat causing race conditions in notification fan-out
   - Emits `socket.to(flatRoom).emit('visitor:new', payload)` for instant resident notification
   - Enqueues a BullMQ push-notification job (fallback if resident's socket isn't connected — proves you understand sockets aren't sufficient alone, which is real production thinking)
   - Enqueues a delayed job: auto-EXPIRE after N minutes if no decision (visible, demoable "operational sophistication")
3. Resident approves/rejects → `PATCH /visitor-requests/:id` — service layer calls `assertValidTransition`, writes an **immutable `ApprovalDecision` audit row** (never mutate-and-forget; append-only trail = "transactional integrity" + "operational thinking" signal), then emits `socket.to(gateRoom).emit('visitor:decided', payload)`
4. Guard's screen updates in real time, marks CHECKED_IN on physical entry → another state transition, another audit row
5. **Replay protection:** each PATCH carries an `idempotencyKey` (client-generated UUID stored in a Redis set with short TTL) — if the guard's spotty gate wifi causes a retry, the second request is a no-op, not a duplicate DB write. This single mechanism directly answers "deduplication" and "replay protection" from the brief.

**Why to spend disproportionate time here:** one deep, fully-instrumented flow beats ten shallow ones. If an evaluator traces this one feature and finds locking, idempotency, audit trail, socket + queue fallback, and RBAC scoping all real and wired together, that single trace can carry the whole project's "production maturity" score.

---

## 6. Runtime schema validation, done right (not decorative)

"Whether validations are dynamic or hardcoded" — concretely means: don't hand-write duplicate `if (!name) return error` checks in both frontend and backend. Instead:

- Zod schema is the **only** definition of what a valid `CreateVisitorRequest` looks like.
- API generates its OpenAPI/JSON-schema docs from the same Zod schema (`zod-to-json-schema`) — so your API docs, runtime validation, and TS types are provably the same source. This is checkable: an evaluator can diff your OpenAPI output against your Zod file and see they match, because they're generated, not hand-duplicated.
- Mobile forms use `zodResolver` — same schema, same file, imported from `packages/shared`.

This is what "runtime schema generation" in the brief is pointing at — schemas that generate behavior (validation + docs + types) rather than being copy-pasted three times.

---

## 7. Concurrency, locking, caching — concrete, demoable instances

Don't implement these abstractly — attach each to a real user-visible scenario so you can demo it in 10 seconds:

| Mechanism | Concrete scenario | Demo line |
|---|---|---|
| Distributed lock (Redis) | Two family members' devices both try to approve/reject the same visitor within milliseconds | "Second request sees the lock, gets a clean 409, no double-processing" |
| Idempotency key | Guard's flaky gate-side connection retries a check-in POST | "Same key, same result, no duplicate audit row" |
| Optimistic locking (Prisma `version` column) | Admin editing amenity booking rules while a resident is mid-booking | "Version mismatch → 409 Conflict → client refetches" |
| Redis cache | Society notice board (read-heavy, write-rare) | "Notices cached 60s, cache-busted on admin write" |
| Delayed queue job | Auto-expiring stale visitor requests | "Runs even if no one opens the app" |

Each of these is small to implement (a few hours) but individually maps to one line item the brief explicitly says is "strongly rewarded." That ratio — small implementation effort, direct line-item match — is what "score-per-hour efficiency" means in practice.

---

## 8. Module-by-module: backend enforcement checklist

For every feature, the rule is the same: **if the UI can do it, the API must independently refuse it when done "wrong."** Build this table into your test suite, not just your head:

- **Visitor approval** — resident token from a *different* flat cannot approve → 403 (row-level scope, §4)
- **Notices** — only ADMIN role can POST; GET is scoped to `societyId` from JWT, not query param
- **Polls** — `PollVote` has a unique constraint `(pollId, userId)` at the DB level, not just a UI "already voted" state — this is the cheapest possible "hardcoded vs enforced" win, it's one line in your Prisma schema
- **Complaints** — status transitions (`OPEN → IN_PROGRESS → RESOLVED`) follow the same shared-transition-table pattern as visitors — reuse the pattern, don't reinvent it (consistency signal)
- **Amenity booking** — double-booking prevented by a DB-level exclusion constraint or a transaction that checks-then-inserts inside a single `prisma.$transaction`, not a client-side "slot looks free" check
- **Guard entry/exit log** — append-only table, never updated, only inserted — audit-trail-by-design

---

## 9. What NOT to build (protect your score-per-hour)

Explicitly cut, and say so in your README as a "scoping decision" (evaluators reward honest scoping over silent gaps):

- Payment gateway integration for maintenance dues — **stub it** with a clearly-labeled mock provider behind the same interface a real one would use (`PaymentProvider` interface with a `MockRazorpayProvider` implementation) — this shows you understand the abstraction without burning a day on Razorpay sandbox setup
- Staff/service-provider directory — CRUD only, no ratings/reviews system
- Notifications — implement push for the visitor flow deeply; for notices/polls, in-app + queued push is enough, don't build a full notification-preferences center

---

## 10. Repo, README, demo — closing the loop for the evaluator

Since the evaluator is AI-based and likely reads the repo directly:

- **README** should state, per module, "Enforced at: UI / API route / Service layer / DB constraint" — literally give the evaluator the trace table so it doesn't have to reconstruct it (reduces false negatives from the evaluator missing something real)
- Include a `docs/architecture.md` with one diagram: request → Fastify preHandler (auth) → Zod validation → service (business rules + lock) → Prisma (DB constraint) → socket/queue emit
- Seed script with demo credentials for all three roles, plus a pre-seeded PENDING visitor request so the reviewer can test the approval flow within 60 seconds of installing
- A short "known limitations" section — explicitly listing what's stubbed (payments) reads as engineering maturity, not weakness

---

## 11. Suggested time allocation (solo builder, 5-day hackathon)

Solo changes the calculus: there's no parallelism, so sequencing and cutting scope matter more than in a team plan. Treat each day as a checkpoint with a working, demoable state at the end of it — never leave the app in a broken middle state overnight.

- **Day 1 (~7–8 hrs)** — monorepo scaffold, Prisma schema (all entities up front, even if unused modules come later), shared Zod schemas for the 2–3 core flows, auth + RBAC (§4) end-to-end for one role first (Resident), then extend to Guard/Admin. This day is pure foundation — nothing user-facing yet, which is normal and fine
- **Day 2 (~8 hrs)** — visitor approval flow end-to-end (§5), fully instrumented: state machine, distributed lock, socket emit, idempotency key. This is your demo centerpiece and the single highest-value day — don't let it slip into Day 3
- **Day 3 (~8 hrs)** — queue fallback (BullMQ push + auto-expire job), audit trail polish, RBAC tests (§4) proving row-level scoping — these are cheap relative to Day 2 because they reuse patterns you already built, and they're what separates "it works" from "it's enforced"
- **Day 4 (~8 hrs)** — remaining modules (notices, polls, complaints, amenities) using the *same* shared-schema + state-machine + service-scoping patterns from Days 1–3. Build only as many of these as fit in the day — cut from §9's list before rushing this, since a shallow fifth module hurts more than a missing one
- **Day 5 (~5–6 hrs)** — README with the enforcement trace table, architecture diagram, seed script with demo credentials + a pre-seeded PENDING visitor request, demo video, final pass on error/loading/empty states. Stop building features by midday and switch fully to packaging — an evaluator that can't get the seed data running loses trust regardless of what's in the code

Solo-specific advice: resist the pull to start Day 4's modules early by shortchanging Day 2–3's depth. As a single builder your entire score rests on the evaluator being able to trace *one* flow flawlessly — breadth is the first thing to sacrifice, not the last.
