# Using the Portl design tokens

## Setup (Day 1, alongside project scaffold)
```bash
npx expo install nativewind tailwindcss
npx tailwindcss init
```
Drop `tailwind.config.js` (provided) into your Expo project root, replacing the generated one. Follow NativeWind's `babel.config.js` + `metro.config.js` setup steps from their docs (one-time, ~5 min).

## Role accents — apply at the screen/header level
```jsx
// Guard's create-visitor screen
<View className="flex-1 bg-bg">
  <View className="bg-guard p-md">
    <Text className="text-white font-bold">Register Visitor</Text>
  </View>
  ...
</View>

// Resident's incoming-request screen
<View className="bg-resident-bg border border-resident rounded-card p-sm">
  <Text className="text-resident font-semibold">New visitor waiting</Text>
</View>
```

## Status colors — for the visitor state machine badge
```jsx
const STATUS_STYLES = {
  PENDING:    "bg-status-pending",
  APPROVED:   "bg-status-approved",
  CHECKED_IN: "bg-status-checkedin",
  CHECKED_OUT:"bg-status-checkedout",
  REJECTED:   "bg-status-rejected",
  EXPIRED:    "bg-status-expired",
};

<View className={`rounded-pill px-sm py-1 ${STATUS_STYLES[request.status]}`}>
  <Text className="text-white text-caption font-semibold">{request.status}</Text>
</View>
```
Reusing this one map across every screen that shows a visitor request status (Guard's list, Resident's list, Admin's log) keeps the state machine visually legible everywhere without restyling per screen.

## Suggested shared components to build once (Day 1–2), reuse everywhere
Keep these dumb and small — one file each in `components/ui/`:
- `Button.tsx` — `variant: "primary" | "secondary"`, uses role color via prop, not hardcoded
- `Card.tsx` — `rounded-card border border-border bg-surface p-sm`
- `StatusBadge.tsx` — wraps the status-color logic above so you write it once
- `EmptyState.tsx` — icon/text/action slot, used for Day 5's empty-state pass
- `Input.tsx` — `rounded-control border border-border`, focus state, error state

Building these 5 early means every later screen (notices, polls, complaints, amenities on Day 4) is assembly, not new styling decisions — which is the actual time-saver, more than the token file itself.

## What NOT to spend time on
- Custom fonts (system font stack looks native on-device and costs zero setup)
- Icon set beyond one library (use `@expo/vector-icons`, already bundled with Expo — don't add a second icon package)
- Animations beyond default screen transitions and maybe one Reanimated fade/slide, if time allows on Day 5
