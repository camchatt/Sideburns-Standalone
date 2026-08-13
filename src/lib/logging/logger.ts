type LogLevel = "debug" | "info" | "warn" | "error";

export function log(level: LogLevel, message: string, detail?: unknown) {
  const prefix = `[sideburn:${level}]`;
  if (detail !== undefined) {
    console[level === "debug" ? "log" : level](prefix, message, detail);
    return;
  }
  console[level === "debug" ? "log" : level](prefix, message);
}
