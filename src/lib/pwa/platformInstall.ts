export type InstallPlatform = "ios" | "android" | "desktop" | "unknown";

export type InstallGuidance = {
  platform: InstallPlatform;
  /** True when the app is already running as an installed / standalone display. */
  alreadyInstalled: boolean;
  /** Never claim installation is automatic. */
  automaticInstall: false;
  headline: string;
  steps: string[];
  note: string;
};

export function isStandaloneDisplay(
  standalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)),
): boolean {
  return Boolean(standalone);
}

export function detectInstallPlatform(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
): InstallPlatform {
  const ua = userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document);
  if (iOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Linux/i.test(ua)) return "desktop";
  return "unknown";
}

export function getInstallGuidance(
  platform: InstallPlatform = detectInstallPlatform(),
  options: { alreadyInstalled?: boolean } = {},
): InstallGuidance {
  const alreadyInstalled = options.alreadyInstalled ?? isStandaloneDisplay();
  const baseNote =
    "Installation is never automatic. You choose when to add SIDEBURNS to your home screen.";

  if (alreadyInstalled) {
    return {
      platform,
      alreadyInstalled: true,
      automaticInstall: false,
      headline: "SIDEBURNS is installed on this device",
      steps: [
        "You are already running from the home screen or as an installed app.",
        "Open Offline readiness to confirm playa packs and maps are available offline.",
        "When an update banner appears, apply it when ready — local quests and the sync outbox are kept.",
      ],
      note: baseNote,
    };
  }

  if (platform === "ios") {
    return {
      platform,
      alreadyInstalled: false,
      automaticInstall: false,
      headline: "Add SIDEBURNS to your iPhone home screen",
      steps: [
        "Open SIDEBURNS in Safari (not an in-app browser).",
        "Tap the Share button.",
        "Choose Add to Home Screen, then Add.",
      ],
      note: baseNote,
    };
  }

  if (platform === "android") {
    return {
      platform,
      alreadyInstalled: false,
      automaticInstall: false,
      headline: "Install SIDEBURNS on Android",
      steps: [
        "Open SIDEBURNS in Chrome (or another supported browser).",
        "Open the browser menu and look for Install app or Add to Home screen.",
        "Confirm Install. If no install option appears, use Add to Home screen.",
      ],
      note: baseNote,
    };
  }

  if (platform === "desktop") {
    return {
      platform,
      alreadyInstalled: false,
      automaticInstall: false,
      headline: "Install SIDEBURNS from a desktop browser",
      steps: [
        "Use a Chromium-based browser or Edge for the best install prompt support.",
        "Look for an install icon in the address bar, or use the browser menu Install app entry.",
        "On macOS Safari, use File → Add to Dock when available.",
      ],
      note: baseNote,
    };
  }

  return {
    platform: "unknown",
    alreadyInstalled: false,
    automaticInstall: false,
    headline: "Install SIDEBURNS on your device",
    steps: [
      "Open this site in a supported mobile browser.",
      "Use the browser Share or menu control to Add to Home Screen / Install app.",
      "On iPhone, this is Share → Add to Home Screen in Safari.",
    ],
    note: baseNote,
  };
}
