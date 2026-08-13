export type MapCameraPadding = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type MapCameraIntent =
  | { type: "follow-user" }
  | { type: "focus-selected"; padding: MapCameraPadding }
  | { type: "initial-fit" }
  | { type: "preserve" };

/**
 * Decide camera motion for map updates.
 * Closing a selection must preserve pan/zoom (no fitBounds reset).
 */
export function resolveMapCameraIntent(input: {
  selected: boolean;
  followUser: boolean;
  hasUserCoordinates: boolean;
  recordsLength: number;
  playaOverlay: boolean;
  initialFitDone: boolean;
  sheetBottomPadding?: number;
}): MapCameraIntent {
  if (input.followUser && input.hasUserCoordinates) {
    return { type: "follow-user" };
  }
  if (input.selected) {
    const bottom = input.sheetBottomPadding ?? 160;
    return {
      type: "focus-selected",
      padding: { top: 80, bottom, left: 40, right: 40 },
    };
  }
  if (!input.initialFitDone && input.recordsLength > 0 && input.playaOverlay) {
    return { type: "initial-fit" };
  }
  return { type: "preserve" };
}
