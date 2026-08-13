import { describe, expect, it } from "vitest";
import { resolveMapCameraIntent } from "@/features/map/utils/mapCamera";

describe("resolveMapCameraIntent", () => {
  it("focuses the selected record with sheet-aware bottom padding", () => {
    expect(
      resolveMapCameraIntent({
        selected: true,
        followUser: false,
        hasUserCoordinates: false,
        recordsLength: 10,
        playaOverlay: true,
        initialFitDone: true,
        sheetBottomPadding: 280,
      }),
    ).toEqual({
      type: "focus-selected",
      padding: { top: 80, bottom: 280, left: 40, right: 40 },
    });
  });

  it("preserves camera when selection clears after initial fit", () => {
    expect(
      resolveMapCameraIntent({
        selected: false,
        followUser: false,
        hasUserCoordinates: false,
        recordsLength: 10,
        playaOverlay: true,
        initialFitDone: true,
      }),
    ).toEqual({ type: "preserve" });
  });

  it("fits bounds only once before any selection", () => {
    expect(
      resolveMapCameraIntent({
        selected: false,
        followUser: false,
        hasUserCoordinates: false,
        recordsLength: 10,
        playaOverlay: true,
        initialFitDone: false,
      }),
    ).toEqual({ type: "initial-fit" });
  });
});
