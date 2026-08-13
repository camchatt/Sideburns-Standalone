import L from "leaflet";

/** Matches Sideburns Sets layer accent — acid lime. */
export const SET_PIN_COLOR = "#c8ff00";

const iconCache = new Map<string, L.DivIcon>();

/** Same visual mass as sidequest / food CircleMarkers (~20px). */
export function setPinSizeForZoom(_zoom: number): number {
  return 20;
}

/**
 * Leaflet divIcon for live set pins — solid color disc (paint only).
 * Taps are handled by MapTapRouter, not the icon.
 */
export function createSetPinIcon(
  selected = false,
  size = 20,
  markerKey = "set",
): L.DivIcon {
  const cacheKey = `set:${markerKey}:${selected ? "1" : "0"}:${size}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const icon = L.divIcon({
    className: "playa-set-pin-wrap",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
    html: `
      <span class="playa-set-shape ${selected ? "is-selected" : ""}"
        style="--pin-size:${size}px;--pin-color:${SET_PIN_COLOR}"
        title="Live set">
        <span class="playa-set-shape__face" aria-hidden="true"></span>
      </span>
    `,
  });

  iconCache.set(cacheKey, icon);
  return icon;
}
