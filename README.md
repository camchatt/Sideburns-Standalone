# Sideburns

Standalone Sidequester — playa map for beacons, services, meetups, music sets, and user quests.

## Setup

```bash
npm install
npm run dev
```

App: http://localhost:8090

Privacy: http://localhost:8090/privacy

## iOS (Capacitor)

Requires full **Xcode** (not just Command Line Tools):

```bash
npm run ios
```

Details: [sidequester/IOS.md](sidequester/IOS.md)

## Store / review notes

- Demo service pins can be disabled with `VITE_INCLUDE_DEMO_BEACONS=false`
- First launch shows a not-affiliated legal ack
- Locate / compass show an in-app explanation before the system prompt
- Host `/privacy` (or the same copy) at a public URL for App Store metadata

## Layout

- `sidequester/` — Vite + React app + Capacitor `ios/`
- `packages/playa-core/` — shared map / placements / beacons / quest threads
