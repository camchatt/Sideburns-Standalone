import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import type { IconType } from "react-icons";
import {
  FaBicycle,
  FaIdCard,
  FaKitMedical,
  FaRestroom,
  FaShieldHalved,
  FaWrench,
} from "react-icons/fa6";
import {
  beaconKindMeta,
  type ServiceLayerKind,
} from "./beacons";

/** Font Awesome 6 pictograms for user services and city infrastructure. */
const SERVICE_ICONS: Record<ServiceLayerKind, IconType> = {
  service: FaWrench,
  med_tent: FaKitMedical,
  ranger: FaShieldHalved,
  dmv: FaIdCard,
  bike_shop: FaBicycle,
  restroom: FaRestroom,
};

/** User-dropped generic service vs festival infrastructure pins. */
export function isUserServiceKind(kind: ServiceLayerKind): boolean {
  return kind === "service";
}

export function serviceIconForKind(kind: ServiceLayerKind): IconType {
  return SERVICE_ICONS[kind];
}

const iconCache = new Map<string, L.DivIcon>();

/** Shared size for non-city pins (matches sidequest CircleMarker mass). */
export function standardPinSizeForZoom(_zoom: number): number {
  return 20;
}

/** Festival City infrastructure pins stay larger and easier to spot. */
export function cityPinSizeForZoom(zoom: number): number {
  if (zoom <= 12) return 28;
  if (zoom <= 14) return 32;
  return 36;
}

/** Pixel size for service marks — city infra larger; camp services match standard pins. */
export function servicePinSizeForZoom(
  zoom: number,
  kind?: ServiceLayerKind,
): number {
  if (kind && isUserServiceKind(kind)) return standardPinSizeForZoom(zoom);
  return cityPinSizeForZoom(zoom);
}

function iconMarkup(Icon: IconType, glyphSize: number): string {
  return renderToStaticMarkup(
    createElement(Icon, {
      size: glyphSize,
      "aria-hidden": true,
    }) as ReactElement,
  );
}

/**
 * Leaflet divIcon for service beacons — circular mark + FA pictograms.
 */
export function createServicePinIcon(
  kind: ServiceLayerKind,
  selected = false,
  size = 20,
): L.DivIcon {
  const cacheKey = `fa6-round:${kind}:${selected ? "1" : "0"}:${size}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const meta = beaconKindMeta(kind);
  const glyphSize = Math.max(10, Math.round(size * 0.52));
  const glyph = iconMarkup(SERVICE_ICONS[kind], glyphSize);
  const tone = isUserServiceKind(kind) ? "is-user" : "is-festival";

  const icon = L.divIcon({
    className: "playa-service-pin-wrap",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
    html: `
      <span class="playa-service-shape ${tone} ${selected ? "is-selected" : ""}"
        style="--pin-size:${size}px"
        title="${meta.label}">
        <span class="playa-service-shape__outline" aria-hidden="true"></span>
        <span class="playa-service-shape__face">${glyph}</span>
      </span>
    `,
  });

  iconCache.set(cacheKey, icon);
  return icon;
}
