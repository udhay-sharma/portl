# Portl — Day 5 & 6 Completion Plan

**Context:** Pivoting from Demo Role Switcher to real Auth + Role-Based Navigation, closing rubric gaps, and shipping a production-ready APK/AAB.

**Time available:** Today (remaining) + Tomorrow from 3:30 PM onward + night.

---

## Priority Legend
- 🔴 **Non-negotiable** — must ship
- 🟡 **High-value** — do if at all possible
- 🟢 **Nice-to-have** — cut first if time runs short

---

## DAY 5 (Today)

### Task 1 — Fix known bug: doubled socket room prefix 🔴
**1.1** Reproduce the doubled prefix, locate where the room name is constructed
**1.2** Fix and verify with real terminal logs (never trust assumed/AI-summarized output)
**1.3** Re-test all Socket.IO live-update flows (visitor approval, notices) after the fix

### Task 2 — Finish Amenity booking (double-booking prevention) 🔴
**2.1** Confirm booking conflict logic (time-slot overlap check) at the DB/query level, not just UI
**2.2** Wire up booking UI states: available / booked / your-booking
**2.3** Test concurrent booking attempts to confirm the lock actually prevents double-booking, not just the happy path

### Task 3 — Push notification reality check 🔴
**3.1** Check whether existing BullMQ fallback code calls Expo's real push API with a device push token, or just retries a socket emit
**3.2** If not real push, scope it into Task 7 below

### Task 4 — Install nav/auth dependencies + prebuild check 🔴
**4.1** Install `@react-navigation/native`, `@react-navigation/bottom-tabs`, `react-native-screens`, `react-native-safe-area-context`, `expo-secure-store`, `lucide-react-native`
**4.2** Run prebuild/dev-client rebuild, confirm app still boots with zero new code
**4.3** Commit this as its own checkpoint before writing any new logic

*If time runs out today, stop after Task 4 — tomorrow starts from a stable, dependency-ready base.*

---

## DAY 6 (Tomorrow, 3:30 PM onward + night)

### Task 5 — AuthContext + SecureStore 🔴
**5.1** Build `AuthContext` — check `SecureStore` on launch, hit `GET /me` if token exists
**5.2** Build a loading/splash gate so there's no flash-of-LoginScreen for already-logged-in users
**5.3** Handle 401 globally — any API call returning 401 clears token, resets context, bounces to LoginScreen

### Task 6 — Real Login Screen 🔴
**6.1** Build `LoginScreen.tsx` — email/password inputs, calls `POST /auth/login`
**6.2** On success: save token to `SecureStore`, update context
**6.3** Finalize `seed.ts` — confirm all three demo accounts log in with `password123`
**6.4** Manually test all three logins end-to-end

### Task 7 — Real push notifications (Expo push service) 🟡
**7.1** Add `expo-notifications`, request permission, generate Expo push token on login
**7.2** Store push token against user record (tie into Task 6's login flow)
**7.3** Backend: on visitor approval request / notice post, send via Expo push API
**7.4** Test on the real device used for APK testing — background the app, trigger an event, confirm notification arrives

### Task 8 — Root navigation structure 🔴
**8.1** Build `RootStack` (Stack Navigator) wrapping a conditionally-mounted Tab Navigator based on role
**8.2** Build `ResidentNavigator` (Visitors, Notices, Polls, Complaints, Amenities), test in isolation
**8.3** Build `AdminNavigator` (Notices, Complaints), test in isolation
**8.4** Build `GuardNavigator` (Visitors / single flow), test in isolation
**8.5** Wire `App.tsx`: `!token` → LoginScreen, else role-based navigator mount

### Task 9 — Settings screen (shared, header-icon access) 🔴
**9.1** Build `SettingsScreen.tsx` — profile info, logout button
**9.2** Add a shared `headerRight` gear icon across all three navigators → pushes `SettingsScreen` via `RootStack`
**9.3** Logout: clear `SecureStore`, reset context, back to LoginScreen

### Task 10 — Staff & Service Provider Directory 🟡
**10.1** Confirm/add backend model + endpoints (staff name, role, contact, category)
**10.2** Admin: CRUD screens to manage staff/providers
**10.3** Resident: read-only directory view, maybe call/contact action
**10.4** Seed a few realistic entries

### Task 11 — Admin stat cards 🟢
**11.1** Add 3-4 stat cards to admin home: today's visitors, open complaints, active polls turnout, upcoming amenity bookings
**11.2** Pull from existing endpoints/aggregation — likely no new backend logic needed

### Task 12 — Regression pass 🔴
**12.1** Re-test Amenity booking + socket fix inside the new nav shell (headers/safe-area/socket re-mounts can break)
**12.2** Test all three roles end-to-end: login → correct navigator → correct tabs → settings → logout
**12.3** Rebuild APK (or AAB), install on real device, full walkthrough

### Task 13 — Docs & submission assets 🔴
**13.1** README: setup instructions, demo credentials, feature list
**13.2** Screenshots — one per role, key screens
**13.3** Demo video script — plan the flow before recording

---

## If Tomorrow Night Runs Short
1. 🔴 Tasks 5, 6, 8, 9 — the full nav/auth pivot (cannot half-ship this)
2. 🟡 Task 7 (push notifications), Task 10 (staff directory — closes a real rubric gap)
3. 🟢 Task 11 (stat cards) — cut first if squeezed
4. 🔴 Tasks 12, 13 — never skip regression testing or submission docs, even under time pressure

---

## Testing Discipline (apply to every task)
- Test each piece in isolation before wiring it into the rest of the app (e.g. verify `AuthContext` works before building the navigators on top of it)
- After each task, confirm the *rest* of the app still works — not just the new piece — before moving to the next task
- Commit at each stable checkpoint, so a broken step can be rolled back without losing earlier working progress
- Always verify with real terminal/device output, never assume something works because the code "looks right"
