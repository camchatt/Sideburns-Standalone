/** Product identity for SIDEBURNS. Prefer this over hard-coded brand strings. */
export const PRODUCT_NAME = "SIDEBURNS";
export const PRODUCT_NAME_DISPLAY = "SIDEBURNS";
export const PRODUCT_TAGLINE = "Offline-first field app for Burning Man sidequests.";
export const PACKAGE_NAME = "sideburn";

/**
 * IndexedDB database name. Still `artelier-playa` for forward-safe continuity of local
 * sidequests/interactions. Do not rename casually — see docs/architecture.md
 * “Local database naming”. Future rename target: `sideburn`.
 */
export const LEGACY_INDEXED_DB_NAME = "artelier-playa";

/** Public URL for the SIDEBURNS mark used in the field shell and welcome screen. */
export const BRAND_LOGO_SRC = "/images/sideburn-logo.png";

/** Small PNG favicon derived from the brand mark. */
export const BRAND_FAVICON_SRC = "/images/sideburn-favicon.png";

/** Canonical brand image assets under `public/` (plus root source `Logo.png`). */
export const BRAND_ASSETS = [
  "Logo.png",
  "public/images/sideburn-logo.png",
  "public/images/sideburn-favicon.png",
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/icon-192-maskable.png",
  "public/icons/icon-512-maskable.png",
  "public/icons/apple-touch-icon.png",
] as const;
