import { describe, expect, it } from "vitest";
import { detectInstallPlatform, getInstallGuidance } from "@/lib/pwa/platformInstall";

describe("platformInstall", () => {
  it("detects iOS and returns Share → Add to Home Screen steps", () => {
    expect(detectInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(
      "ios",
    );
    const guidance = getInstallGuidance("ios", { alreadyInstalled: false });
    expect(guidance.automaticInstall).toBe(false);
    expect(guidance.alreadyInstalled).toBe(false);
    expect(guidance.steps.some((step) => /Add to Home Screen/i.test(step))).toBe(true);
    expect(guidance.note.toLowerCase()).toContain("never automatic");
  });

  it("detects Android install menu guidance without claiming automatic install", () => {
    expect(detectInstallPlatform("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    const guidance = getInstallGuidance("android", { alreadyInstalled: false });
    expect(guidance.automaticInstall).toBe(false);
    expect(guidance.steps.some((step) => /Install|Home screen/i.test(step))).toBe(true);
  });

  it("provides desktop guidance that does not claim automatic install", () => {
    const guidance = getInstallGuidance("desktop", { alreadyInstalled: false });
    expect(guidance.automaticInstall).toBe(false);
    expect(guidance.headline).toMatch(/desktop/i);
  });

  it("keeps OS platform when already installed instead of forcing desktop", () => {
    expect(detectInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(
      "ios",
    );
    const guidance = getInstallGuidance("ios", { alreadyInstalled: true });
    expect(guidance.platform).toBe("ios");
    expect(guidance.alreadyInstalled).toBe(true);
    expect(guidance.headline).toMatch(/installed/i);
    expect(guidance.automaticInstall).toBe(false);
  });
});
