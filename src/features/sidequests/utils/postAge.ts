/**
 * Concise relative post age for user-generated content.
 * Returns null when `createdAt` is missing or unparseable (legacy-safe).
 */
export function formatPostAge(createdAt: string | null | undefined, now = new Date()): string | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;

  const diffMs = Math.max(0, now.getTime() - created.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "POSTED JUST NOW";
  if (minutes < 60) return `POSTED ${minutes} MIN AGO`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `POSTED ${hours} HOUR${hours === 1 ? "" : "S"} AGO`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "POSTED YESTERDAY";
  if (days < 30) return `POSTED ${days} DAYS AGO`;

  const months = Math.floor(days / 30);
  if (months < 12) return `POSTED ${months} MONTH${months === 1 ? "" : "S"} AGO`;

  const years = Math.floor(days / 365);
  return `POSTED ${years} YEAR${years === 1 ? "" : "S"} AGO`;
}
