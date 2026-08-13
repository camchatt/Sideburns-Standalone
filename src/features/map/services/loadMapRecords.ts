import type { MapRecordCache, MapRecordListOptions, MapRecordProvider, PlayaMapRecord } from "@/features/map/types/mapRecord";

export type LoadedMapRecords = { records: PlayaMapRecord[]; source: "live" | "cache" | "sample"; warning: string | null };

/** Forward-safe defaults for older IndexedDB cache rows missing kind/category. */
export function normalizeMapRecord(record: PlayaMapRecord): PlayaMapRecord {
  return {
    ...record,
    recordKind: record.recordKind ?? (record.id.startsWith("sq_") ? "sidequest" : "art"),
    category: record.category ?? null,
  };
}

export async function loadMapRecords(input: {
  primary: MapRecordProvider;
  sample: MapRecordProvider;
  cache: MapRecordCache;
  options?: MapRecordListOptions;
}): Promise<LoadedMapRecords> {
  try {
    const records = (await input.primary.list(input.options)).map(normalizeMapRecord);
    if (records.length) {
      await input.cache.write({
        key: "current",
        records,
        source: input.primary.source,
        fetchedAt: new Date().toISOString(),
        schemaVersion: 1,
      });
      return {
        records,
        source: input.primary.source === "supabase" ? "live" : "sample",
        warning: null,
      };
    }
  } catch (error) {
    const cached = await input.cache.read().catch(() => null);
    const sample = (await input.sample.list(input.options)).map(normalizeMapRecord);
    const cachedRecords = cached?.records.length ? filterRecords(cached.records, input.options) : [];
    const cachedArt = cachedRecords.filter((record) => record.recordKind === "art").length;
    const sampleArt = sample.filter((record) => record.recordKind === "art").length;
    // Prefer bundled sample when the IndexedDB snapshot predates Projects art.
    if (sampleArt > cachedArt) {
      await input.cache.write({
        key: "current",
        records: sample,
        source: "sample",
        fetchedAt: new Date().toISOString(),
        schemaVersion: 1,
      });
      return {
        records: sample,
        source: "sample",
        warning: error instanceof Error ? error.message : "Live map unavailable; showing bundled sample records.",
      };
    }
    if (cachedRecords.length) {
      return {
        records: cachedRecords,
        source: "cache",
        warning: error instanceof Error ? error.message : "Live map unavailable",
      };
    }
    return {
      records: sample,
      source: "sample",
      warning: "Live map unavailable; showing bundled sample records.",
    };
  }
  const cached = await input.cache.read().catch(() => null);
  if (cached?.records.length) {
    return {
      records: filterRecords(cached.records, input.options),
      source: "cache",
      warning: "No live placements matched; showing cached records.",
    };
  }
  return {
    records: (await input.sample.list(input.options)).map(normalizeMapRecord),
    source: "sample",
    warning: "No live placements matched; showing bundled sample records.",
  };
}

function filterRecords(records: PlayaMapRecord[], options?: MapRecordListOptions) {
  const q = options?.query?.trim().toLowerCase();
  return records
    .map(normalizeMapRecord)
    .filter(
      (record) =>
        (!options?.years?.length || options.years.includes(record.eventYear)) &&
        (!q ||
          `${record.title} ${record.artistName ?? ""} ${record.description}`.toLowerCase().includes(q)),
    );
}
