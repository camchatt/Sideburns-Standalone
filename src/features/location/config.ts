/**
 * Documented GPS quality and watch options for SIDEBURNS foreground location.
 *
 * Battery notes (mobile PWA):
 * - `enableHighAccuracy: true` uses GNSS when available (better playa fixes; higher drain).
 * - `maximumAge: 10_000` reuses a recent fix instead of forcing a new GNSS lock every tick.
 * - `timeout: 15_000` avoids hanging forever when GPS is weak under canopy / dust.
 * - Callers must start `watchPosition` only while relevant UI is opted-in and active,
 *   and always `clearWatch` on teardown. `ForegroundLocationProvider` also pauses the
 *   watch while `document.hidden` (tab switch / app background) and resumes on visible.
 * - A normal PWA cannot claim reliable background GPS; iOS does not provide persistent
 *   background tracking for installed web apps.
 */
export const LOCATION_GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 15_000,
};

/** Readings with horizontal accuracy worse than this are `inaccurate` and must not drive proximity. */
export const LOCATION_MAX_USABLE_ACCURACY_METERS = 100;

/** Readings older than this (vs wall clock) are `stale` and must not drive proximity. */
export const LOCATION_STALE_READING_MS = 60_000;

/** Default search radius for Nearby distance listing (meters). */
export const NEARBY_DEFAULT_RADIUS_METERS = 2_500;

/**
 * Sidequest / map placements whose reported accuracy exceeds this are treated as
 * approximate (listed separately; not ranked as precise distance hits).
 */
export const PRECISE_LOCATION_MAX_ACCURACY_METERS = 75;
