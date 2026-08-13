import { describe, expect, it } from "vitest";
import { SAMPLE_SIDEQUESTS } from "@/data/sample/sidequests";
import { sidequestSchema } from "@/features/sidequests/types/sidequest";

describe("sample sidequests", () => {
  it("validates every bundled sample sidequest", () => {
    expect(SAMPLE_SIDEQUESTS.length).toBeGreaterThanOrEqual(2);
    for (const quest of SAMPLE_SIDEQUESTS) {
      expect(() => sidequestSchema.parse(quest)).not.toThrow();
    }
  });
});
