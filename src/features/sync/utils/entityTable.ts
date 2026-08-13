import type { SyncEntityTable, SyncOperationType } from "@/features/sync/types/sync";

export function entityTableForOperation(type: SyncOperationType): SyncEntityTable {
  switch (type) {
    case "sidequest.create":
    case "sidequest.update":
    case "sidequest.delete":
      return "shared_beacons";
    case "progress.upsert":
    case "progress.delete":
      return "user_sidequest_progress";
    case "completion.create":
    case "completion.delete":
      return "user_quest_completions";
    case "pack.download":
      return null;
  }
}

export function isRemoteSyncOperationType(
  type: SyncOperationType,
): type is Exclude<SyncOperationType, "pack.download"> {
  return type !== "pack.download";
}
