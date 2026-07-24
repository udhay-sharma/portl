# Frontend Pivot Context (Post-Step 5.1)

## Background & The Trigger
After completing Step 5.1 (wiring up Loading, Empty, and Error states for all screens), we reviewed the app's visual state. While the individual screens (Notices, Complaints, Amenities, Visitors, Polls) functioned perfectly with real-time WebSockets, idempotency, and robust error handling, the **app shell and navigation** felt like a backend tester rather than a real consumer product.

## User's Core Frustrations & Feedback
The user explicitly called out that the app did **not** feel like a real society management app. Specifically:
1. **The "Demo Role Switcher"**: The top of the screen had a hardcoded tab bar (`Guard | Resident | Admin`) that simply swapped components. This felt like a testing sandbox, not a real app.
2. **No Real Authentication UI**: There was no Login Screen. The app relied on hardcoded JWT tokens injected into the app state at runtime.
3. **No Native Navigation**: There were no standard Bottom Tabs with icons (like what you'd see in WhatsApp, Instagram, or MyGate).
4. **Overall Presentation**: The user felt they could not confidently submit this to a hackathon or upload it to the Play Store because it looked like a developer tool, not a finished mobile product.

## The Explanation
The AI explained that the "Demo Role Switcher" was originally designed as a "hackathon cheat code." In a 3-minute demo video, logging in and out of different accounts (Guard → Resident → Guard) takes too much time and ruins the momentum of showing off real-time WebSocket communication. The switcher was meant to bypass the login flow purely to speed up the presentation.

## The Agreed Pivot: Moving to a "Real App" Experience
The user rejected the "demo cheat code" approach and insisted on building a true, production-ready frontend shell. We agreed to rip out the Demo Role Switcher and implement a genuine authentication and navigation flow. 

**Here is exactly what we agreed to build to fix this:**

### 1. Real Dependencies
- Install standard Expo/React Native routing and storage libraries:
  - `@react-navigation/native`
  - `@react-navigation/bottom-tabs`
  - `react-native-screens` & `react-native-safe-area-context`
  - `expo-secure-store` (for secure JWT storage)
  - `lucide-react-native` (for premium tab icons)

### 2. Authentication Flow & Context
- Create an `AuthContext` (`src/lib/auth.ts`) to manage the global logged-in state.
- On app launch, check `SecureStore` for an existing `accessToken`.
- If a token exists, silently hit the `GET /me` endpoint to retrieve the user's role and details.
- If no token exists (or it is invalid), show the Login Screen.

### 3. Real Login Screen
- Build `src/screens/LoginScreen.tsx`.
- The screen will have standard email and password inputs.
- It will hit the existing `POST /auth/login` backend endpoint.
- On success, it will save the returned `accessToken` to `SecureStore` and update the `AuthContext`.

### 4. Role-Based Native Bottom Tabs
Remove the top "Demo Role Switcher" entirely. Once a user logs in, the `AuthContext` will read their role and mount a native Bottom Tab Navigator specific to that role:

- **ResidentNavigator**: 
  - Tabs: *Visitors*, *Notices*, *Polls*, *Complaints*, *Amenities*.
- **AdminNavigator**: 
  - Tabs: *Notices*, *Complaints*.
- **GuardNavigator**: 
  - Tabs: *Visitors* (or a single full-screen flow).

### 5. Finalizing Demo Data (Step 5.2 Integration)
To make the Login Screen usable, the database must contain real, known accounts.
- We will finalize the backend seed script (`apps/api/prisma/seed.ts`).
- It will ensure standard accounts exist (e.g., `resident@portl.dev`, `admin@portl.dev`, `guard@portl.dev`) with a known password (e.g., `password123`).
- This allows anyone cloning the repo to immediately test the Login Screen and see the real app.

## Goal
By executing this pivot, the app will retain all its advanced backend features (WebSockets, Zod validation, locking) while finally wrapping them in a premium, Play Store-ready mobile UI.
