/**
 * leaflet-rotate's ESM sources patch the global `L`. Assign it before the
 * plugin module evaluates (top-level await keeps PlayaMap from mounting early).
 */
import L from "leaflet";

(globalThis as typeof globalThis & { L: typeof L }).L = L;

await import("leaflet-rotate");
