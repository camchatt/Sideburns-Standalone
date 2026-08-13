# Sidequester iOS (Capacitor)

Native iOS shell around the existing Vite + React app.

## Prerequisites

1. **Xcode** from the Mac App Store (Command Line Tools alone are not enough)
2. Apple Developer account (for device / TestFlight / App Store)
3. From repo root: `npm install`

This machine currently only has Command Line Tools — install full Xcode before opening the project.

## First run

```bash
cd sidequester
npm run ios
```

That builds the web app, syncs into `ios/`, and opens Xcode.

Or step by step:

```bash
npm run cap:sync   # build + sync
npm run cap:open   # open Xcode
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities** → your Team
2. Pick an iPhone simulator or device
3. Press Run

## What was configured

| Item | Value |
|------|--------|
| Bundle ID | `app.sideburns.sidequester` |
| Display name | Sidequester |
| Location | `NSLocationWhenInUseUsageDescription` |
| Compass / motion | `NSMotionUsageDescription` |
| Web dir | `sidequester/dist` |

## Workflow after UI changes

```bash
cd sidequester
npm run cap:sync
# then Run again in Xcode (or keep it open — re-run)
```

## App Store checklist (still on you)

- [ ] Replace default Capacitor icons / splash in Xcode asset catalogs
- [ ] Host `/privacy` at a public HTTPS URL and paste into App Store Connect
- [ ] Add a real support email on the Privacy page
- [ ] Confirm Esri imagery licensing for shipped apps
- [ ] Archive → Distribute → TestFlight
- [ ] App Privacy nutrition labels (Location = optional, used for Locate Me)

## Disable demo pins for store builds

```bash
VITE_INCLUDE_DEMO_BEACONS=false npm run cap:sync
```
