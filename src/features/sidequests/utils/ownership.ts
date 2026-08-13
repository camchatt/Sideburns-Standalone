import type { PlayaMapRecord } from "@/features/map/types/mapRecord";
import type { Sidequest } from "@/features/sidequests/types/sidequest";

/** Creator-only remove: require an explicit creatorId match. Legacy rows without creatorId are not owned. */
export function canRemoveBeacon(
  record: Pick<PlayaMapRecord, "creatorId"> | Pick<Sidequest, "creatorId">,
  localUserId: string | null | undefined,
): boolean {
  if (!localUserId) return false;
  const creatorId = record.creatorId ?? null;
  if (!creatorId) return false;
  return creatorId === localUserId;
}

export function presentedByLabel(
  record: Pick<PlayaMapRecord, "creatorDisplayName" | "presenter" | "artistName">,
): string {
  const name =
    record.creatorDisplayName?.trim() ||
    record.presenter?.trim() ||
    record.artistName?.trim() ||
    "";
  return name || "ANONYMOUS BURNER";
}

/** Post age applies to user-generated Sideburns and community beacons. */
export function shouldShowPostAge(record: Pick<PlayaMapRecord, "contentOrigin" | "recordKind" | "markerKind">): boolean {
  if (record.contentOrigin !== "user") return false;
  if (record.recordKind === "sidequest") return true;
  if (record.recordKind === "beacon") return true;
  return false;
}
