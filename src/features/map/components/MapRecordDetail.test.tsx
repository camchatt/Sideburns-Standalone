import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, createTestAppServices } from "@/app/providers";
import { MapRecordDetail } from "@/features/map/components/MapRecordDetail";
import type { PlayaMapRecord } from "@/features/map/types/mapRecord";
import { closePlayaDatabaseForTests } from "@/lib/storage/playaDatabase";
import { SIDEQUESTER_2025_RECORDS } from "@/data/sample/sidequester2025";

const baseRecord: PlayaMapRecord = {
  id: "sq_local_test",
  slug: "sq_local_test",
  title: "Carry a lit lantern",
  description: "Hand it to a stranger when you arrive at the Temple.",
  location: { latitude: 40.78, longitude: -119.2 },
  placementKind: "exact",
  placementLabel: "Local sidequest",
  placementConfidence: 1,
  eventYear: 2026,
  heroImageUrl: null,
  artistName: null,
  radiusMeters: 30,
  detailUrl: null,
  recordKind: "sidequest",
  category: "explore",
  origin: "local",
  contentOrigin: "user",
  createdAt: new Date(Date.now() - 8 * 60_000).toISOString(),
  creatorId: "11111111-1111-4111-8111-111111111111",
  creatorDisplayName: "Camp Questionable",
  reward: "Patch + cold drink",
};

function renderDetail(record: PlayaMapRecord, services = createTestAppServices()) {
  return render(
    <MemoryRouter>
      <AppProviders services={services}>
        <MapRecordDetail
          record={record}
          onClose={vi.fn()}
          onCompletionChange={vi.fn()}
          onDeleted={vi.fn()}
        />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe("MapRecordDetail", () => {
  beforeEach(async () => {
    await closePlayaDatabaseForTests();
    indexedDB.deleteDatabase("artelier-playa");
  });

  it("shows post age and presented-by for user-generated sidequests", async () => {
    renderDetail(baseRecord);
    expect(await screen.findByTestId("presented-by")).toHaveTextContent(/Camp Questionable/i);
    expect(screen.getByTestId("post-age")).toHaveTextContent(/POSTED/i);
    expect(screen.getByTestId("record-reward")).toHaveTextContent(/Patch/i);
  });

  it("hides post age for infrastructure content", async () => {
    renderDetail({
      ...baseRecord,
      id: "sq_sample_1",
      origin: "sample",
      contentOrigin: "infrastructure",
      creatorId: null,
      creatorDisplayName: null,
    });
    await screen.findByTestId("presented-by");
    expect(screen.queryByTestId("post-age")).toBeNull();
  });

  it("omits age when user content has no timestamp", async () => {
    renderDetail({ ...baseRecord, createdAt: null });
    await screen.findByTestId("presented-by");
    expect(screen.queryByTestId("post-age")).toBeNull();
  });

  it("shows remove only for the matching creator", async () => {
    const services = createTestAppServices();
    await services.localIdentity.create("Camp Questionable");
    const identity = await services.localIdentity.get();
    renderDetail({ ...baseRecord, creatorId: identity!.id }, services);
    expect(await screen.findByTestId("remove-local-beacon")).toBeInTheDocument();
  });

  it("does not render remove for non-creators or legacy rows without creatorId", async () => {
    const services = createTestAppServices();
    await services.localIdentity.create("Other Burner");
    const { unmount } = renderDetail(baseRecord, services);
    await screen.findByTestId("presented-by");
    expect(screen.queryByTestId("remove-local-beacon")).toBeNull();
    unmount();

    renderDetail({ ...baseRecord, creatorId: null, creatorDisplayName: null }, services);
    await screen.findByTestId("presented-by");
    expect(screen.queryByTestId("remove-local-beacon")).toBeNull();
  });

  it("closes detail via the accessible close control", async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <AppProviders>
          <MapRecordDetail
            record={baseRecord}
            onClose={onClose}
            onCompletionChange={vi.fn()}
            onDeleted={vi.fn()}
          />
        </AppProviders>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByLabelText("Close detail"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows post age for user food beacons", async () => {
    renderDetail({
      ...baseRecord,
      recordKind: "beacon",
      markerKind: "food",
      title: "Grilled cheese",
    });
    expect(await screen.findByTestId("post-age")).toHaveTextContent(/POSTED/i);
  });

  it("shows Track it for a catalog Sideburn but not for a service beacon", async () => {
    const portraitExchange = SIDEQUESTER_2025_RECORDS.find(
      (record) => record.id === "bm2025_07_portrait-exchange",
    );
    const pizza = SIDEQUESTER_2025_RECORDS.find(
      (record) => record.id === "bm2025_01_leftover-pizza",
    );
    expect(portraitExchange).toBeDefined();
    expect(pizza).toBeDefined();

    const { unmount } = renderDetail(portraitExchange!);
    expect(await screen.findByTestId("sidequest-track")).toHaveTextContent(/Track it/i);
    unmount();

    renderDetail(pizza!);
    await screen.findByTestId("presented-by");
    expect(screen.queryByTestId("sidequest-track")).toBeNull();
  });
});
