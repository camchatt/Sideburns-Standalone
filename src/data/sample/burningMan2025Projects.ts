import rawProjects from "@/data/sample/burningMan2025Projects.raw.json";
import { mapSupabaseRow } from "@/features/map/providers/supabaseMapRecordProvider";
import type { PlayaMapRecord } from "@/features/map/types/mapRecord";

/**
 * SIDEBURNS-owned 2025 Burning Man art inventory for the Projects layer.
 *
 * Snapshot of the public `burning_man_public_projects` placement shape (title,
 * artist, coords / clock placement, hero image). Bundled for offline sample
 * mode — runtime does not call Artelier Supabase. Records are year-scoped to
 * 2025 and only appear when the map year filter is 2025.
 */
export const BURNING_MAN_2025_ART_RECORDS: PlayaMapRecord[] = (() => {
  const records: PlayaMapRecord[] = [];
  for (const row of rawProjects) {
    try {
      const mapped = mapSupabaseRow(row);
      if (mapped.eventYear !== 2025) continue;
      records.push({
        ...mapped,
        origin: "sample",
        contentOrigin: "infrastructure",
      });
    } catch {
      /* Skip rows without usable coordinates — matches live provider behavior. */
    }
  }
  return records;
})();
