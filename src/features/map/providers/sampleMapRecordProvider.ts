import { SAMPLE_SIDEQUESTS } from "@/data/sample/sidequests";
import { SIDEQUESTER_2025_RECORDS } from "@/data/sample/sidequester2025";
import { BURNING_MAN_2025_ART_RECORDS } from "@/data/sample/burningMan2025Projects";
import type { MapRecordProvider, PlayaMapRecord } from "@/features/map/types/mapRecord";
import { sidequestToMapRecord } from "@/features/map/services/loadMapRecordsWithLocalSidequests";

const APPROXIMATE_SAMPLES: PlayaMapRecord[] = [
  {
    id: "sq_sample_approx_temple_haze",
    slug: "sq_sample_approx_temple_haze",
    title: "Temple Haze Walk",
    description: "Fictional approximate placement: wander toward reported temple-side glow after dusk.",
    location: { latitude: 40.7882, longitude: -119.2095 },
    placementKind: "approximate",
    placementLabel: "Approx · 10:00 & 3000'",
    placementConfidence: 0.45,
    eventYear: 2026,
    heroImageUrl: null,
    artistName: "Sample Collective",
    radiusMeters: 80,
    detailUrl: null,
    recordKind: "sidequest",
    category: "explore",
  },
  {
    id: "sq_sample_approx_deep_playa",
    slug: "sq_sample_approx_deep_playa",
    title: "Deep Playa Mirage",
    description: "Fictional approximate placement beyond the trash fence rumors.",
    location: { latitude: 40.7915, longitude: -119.201 },
    placementKind: "approximate",
    placementLabel: "Approx · deep playa",
    placementConfidence: 0.3,
    eventYear: 2026,
    heroImageUrl: null,
    artistName: null,
    radiusMeters: 120,
    detailUrl: null,
    recordKind: "sidequest",
    category: "explore",
  },
];

export function createSampleMapRecordProvider(): MapRecordProvider {
  const records: PlayaMapRecord[] = [
    ...BURNING_MAN_2025_ART_RECORDS,
    ...SIDEQUESTER_2025_RECORDS,
    ...SAMPLE_SIDEQUESTS.map((quest) => sidequestToMapRecord(quest)),
    ...APPROXIMATE_SAMPLES,
  ];
  return {
    source: "sample",
    async list(options = {}) {
      const q = options.query?.trim().toLowerCase();
      return records
        .filter(
          (record) =>
            (!options.years?.length || options.years.includes(record.eventYear)) &&
            (!q ||
              `${record.title} ${record.artistName ?? ""} ${record.description}`
                .toLowerCase()
                .includes(q)),
        )
        .map((record) => ({
          ...record,
          location: { ...record.location },
        }));
    },
  };
}
