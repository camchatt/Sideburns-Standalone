// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { BURNING_MAN_2025_ART_RECORDS } from "@/data/sample/burningMan2025Projects";
import { SIDEQUESTER_2025_RECORDS } from "@/data/sample/sidequester2025";
import type { PlayaMapRecord } from "@/features/map/types/mapRecord";
import {
  ensureOverlaysAndSyncRecords,
  selectRecordFromMapClick,
  shouldUseDomRecordMarker,
} from "@/features/map/components/PlayaMap";

type SourceState = { setData: ReturnType<typeof vi.fn> };

function createMapMock() {
  const sources = new Map<string, SourceState>();
  const layers = new Map<string, Record<string, unknown>>();
  const images = new Set<string>();
  const map = {
    addSource: vi.fn((id: string) => sources.set(id, { setData: vi.fn() })),
    getSource: vi.fn((id: string) => sources.get(id)),
    addLayer: vi.fn((layer: Record<string, unknown>) => layers.set(layer.id as string, layer)),
    getLayer: vi.fn((id: string) => layers.get(id)),
    moveLayer: vi.fn(),
    hasImage: vi.fn((id: string) => images.has(id)),
    addImage: vi.fn((id: string) => images.add(id)),
  };
  return { map: map as unknown as MapLibreMap, sources, layers };
}

function installCanvasMock() {
  return vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(28 * 28 * 4), width: 28, height: 28 })),
  } as unknown as CanvasRenderingContext2D);
}

afterEach(() => vi.restoreAllMocks());

describe("PlayaMap record overlays", () => {
  it("publishes all projects alongside existing non-art records", () => {
    installCanvasMock();
    const { map, sources, layers } = createMapMock();
    const existing = SIDEQUESTER_2025_RECORDS[0];
    const records = [...BURNING_MAN_2025_ART_RECORDS, existing];

    ensureOverlaysAndSyncRecords(map, records, null);

    expect(BURNING_MAN_2025_ART_RECORDS).toHaveLength(303);
    expect(layers.get("records-circle")).toMatchObject({
      type: "circle",
      filter: ["==", ["get", "recordKind"], "art"],
      paint: {
        "circle-color": ["case", ["==", ["get", "selected"], true], expect.any(String), "#a83223"],
        "circle-stroke-color": "#f4e7c8",
      },
    });
    expect(layers.has("records-art-icons")).toBe(false);
    const published = sources.get("sideburn-records")?.setData.mock.calls[0]?.[0];
    expect(published.features).toHaveLength(304);
    expect(published.features.filter((feature: { properties: { recordKind: string } }) => feature.properties.recordKind === "art")).toHaveLength(303);
    expect(published.features.some((feature: { properties: { id: string } }) => feature.properties.id === existing.id)).toBe(true);
  });

  it("recreates sources and republishes records after a style replacement", () => {
    installCanvasMock();
    const first = createMapMock();
    ensureOverlaysAndSyncRecords(first.map, BURNING_MAN_2025_ART_RECORDS, null);

    const replacement = createMapMock();
    ensureOverlaysAndSyncRecords(replacement.map, BURNING_MAN_2025_ART_RECORDS, null);

    expect(replacement.sources.has("sideburn-records")).toBe(true);
    expect(replacement.layers.has("records-circle")).toBe(true);
    expect(replacement.sources.get("sideburn-records")?.setData).toHaveBeenCalledTimes(1);
  });

  it("repairs an individually missing project layer without replacing the source", () => {
    installCanvasMock();
    const state = createMapMock();
    ensureOverlaysAndSyncRecords(state.map, BURNING_MAN_2025_ART_RECORDS, null);
    const originalSource = state.sources.get("sideburn-records");
    state.layers.delete("records-circle");

    ensureOverlaysAndSyncRecords(state.map, BURNING_MAN_2025_ART_RECORDS, null);

    expect(state.sources.get("sideburn-records")).toBe(originalSource);
    expect(state.layers.has("records-circle")).toBe(true);
    expect(originalSource?.setData).toHaveBeenCalledTimes(2);
  });

  it("keeps ordinary projects out of DOM markers but permits a selected project chip", () => {
    const project = BURNING_MAN_2025_ART_RECORDS[0];
    expect(shouldUseDomRecordMarker(project, null)).toBe(false);
    expect(shouldUseDomRecordMarker(project, project)).toBe(true);
    expect(shouldUseDomRecordMarker(SIDEQUESTER_2025_RECORDS[0], null)).toBe(true);
  });

  it("selects the project represented by a MapLibre feature", () => {
    const project = BURNING_MAN_2025_ART_RECORDS[0];
    const onSelect = vi.fn();
    selectRecordFromMapClick(
      { features: [{ properties: { id: project.id } }] } as never,
      { current: [project] as PlayaMapRecord[] },
      { current: onSelect },
    );
    expect(onSelect).toHaveBeenCalledWith(project);
  });
});
