import { describe, expect, it } from "vitest";
import { coordinatesInTestArea, getTestArea } from "@/features/map/config/testAreas";

describe("test areas", () => {
  it("defaults to Black Rock City and identifies Winthrop coordinates", () => {
    expect(getTestArea(null).id).toBe("black-rock-city");
    const winthrop = getTestArea("winthrop");
    expect(winthrop.center).toMatchObject({ latitude: 42.3751, longitude: -70.9828 });
    expect(winthrop.zoom).toBeGreaterThanOrEqual(15);
    expect(coordinatesInTestArea({ latitude: 42.3751, longitude: -70.9828 }, winthrop)).toBe(true);
    expect(coordinatesInTestArea({ latitude: 40.7864, longitude: -119.2065 }, winthrop)).toBe(false);
  });
});
