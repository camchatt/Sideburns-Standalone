import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, createTestAppServices } from "@/app/providers";
import { SidequestLifecyclePanel } from "@/features/sidequests/components/SidequestLifecyclePanel";
import { SavedLibrary } from "@/features/sidequests/components/SavedLibrary";
import { closePlayaDatabaseForTests } from "@/lib/storage/playaDatabase";

describe("SidequestLifecyclePanel", () => {
  beforeEach(async () => {
    await closePlayaDatabaseForTests();
    indexedDB.deleteDatabase("artelier-playa");
  });

  it("supports begin and open completion without GPS", async () => {
    render(
      <AppProviders services={createTestAppServices()}>
        <MemoryRouter>
          <SidequestLifecyclePanel sidequestId="sq_sample_tea_stop" />
        </MemoryRouter>
      </AppProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sidequest-lifecycle-panel")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidequest-origin")).toHaveTextContent(/sample/i);
    expect(screen.getByTestId("sidequest-progress-phase")).toHaveTextContent(/not started/i);

    fireEvent.click(screen.getByTestId("sidequest-begin"));
    await waitFor(() => {
      expect(screen.getByTestId("sidequest-progress-phase")).toHaveTextContent(/in_progress/i);
    });

    fireEvent.change(screen.getByTestId("sidequest-completion-notes"), {
      target: { value: "Mint tea enjoyed" },
    });
    fireEvent.click(screen.getByTestId("sidequest-complete"));

    await waitFor(() => {
      expect(screen.getByTestId("sidequest-progress-phase")).toHaveTextContent(/completed/i);
    });
    expect(screen.getByTestId("sidequest-completed-notes")).toHaveTextContent(/Mint tea enjoyed/i);
  });

  it("shows proximity gate messaging for proximity quests without usable GPS", async () => {
    render(
      <AppProviders services={createTestAppServices()}>
        <MemoryRouter>
          <SidequestLifecyclePanel sidequestId="sq_sample_dust_compass" />
        </MemoryRouter>
      </AppProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sidequest-gate-message")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidequest-complete")).toBeDisabled();
  });

  it("map panel tracks then completes open quests with Track it / Mark complete", async () => {
    const services = createTestAppServices();
    await services.localIdentity.create("Dusty Tester");

    render(
      <AppProviders services={services}>
        <MemoryRouter>
          <SidequestLifecyclePanel
            sidequestId="sq_sample_tea_stop"
            variant="light"
            requireIdentity={async () => (await services.localIdentity.get())}
          />
        </MemoryRouter>
      </AppProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sidequest-track")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidequest-lifecycle-panel")).toHaveAttribute("data-tracking-state", "available");

    fireEvent.click(screen.getByTestId("sidequest-track"));
    await waitFor(() => {
      expect(screen.getByTestId("sidequest-complete")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidequest-stop-tracking")).toBeInTheDocument();
    expect(screen.getByTestId("sidequest-lifecycle-panel")).toHaveAttribute("data-tracking-state", "tracked");

    fireEvent.click(screen.getByTestId("sidequest-complete"));
    await waitFor(() => {
      expect(screen.getByTestId("sidequest-completed")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidequest-lifecycle-panel")).toHaveAttribute("data-tracking-state", "completed");
  });

  it("map panel flashes don't-cheat when completing a proximity quest out of range", async () => {
    const services = createTestAppServices();
    await services.localIdentity.create("Dusty Tester");
    await services.sidequestLifecycle.begin("sq_sample_dust_compass");

    const watch = vi.fn((onChange: (reading: import("@/features/location/types/location").LocationReading) => void) => {
      onChange({
        coordinates: { latitude: 40.0, longitude: -119.0, accuracyMeters: 10, altitudeMeters: null },
        timestamp: new Date().toISOString(),
        permission: "granted" as const,
        accuracyMeters: 10,
        error: null,
        source: "device" as const,
      });
      return { stop() {} };
    });
    const farLocation = {
      async getCurrent() {
        return {
          coordinates: { latitude: 40.0, longitude: -119.0, accuracyMeters: 10, altitudeMeters: null },
          timestamp: new Date().toISOString(),
          permission: "granted" as const,
          accuracyMeters: 10,
          error: null,
          source: "device" as const,
        };
      },
      watch,
      async getPermissionState() {
        return "granted" as const;
      },
      setSimulatedLocation() {},
    };
    services.location = farLocation;

    render(
      <AppProviders services={services}>
        <MemoryRouter>
          <SidequestLifecyclePanel
            sidequestId="sq_sample_dust_compass"
            variant="light"
            requireIdentity={async () => (await services.localIdentity.get())}
          />
        </MemoryRouter>
      </AppProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sidequest-complete")).toBeInTheDocument();
    });

    // Opt in so MARK COMPLETE can evaluate range instead of prompting for permission.
    fireEvent.click(screen.getByTestId("sidequest-complete"));
    await waitFor(() => {
      expect(watch).toHaveBeenCalled();
    });

    // The first click opts into foreground GPS; retry after its reading reaches the panel.
    fireEvent.click(screen.getByTestId("sidequest-complete"));
    await waitFor(() => {
      expect(screen.getByTestId("sidequest-tracking-flash")).toHaveTextContent(/Don't cheat/i);
    });
    expect(screen.getByTestId("sidequest-lifecycle-panel")).toHaveAttribute("data-tracking-state", "tracked");
  });
});

describe("SavedLibrary review", () => {
  beforeEach(async () => {
    await closePlayaDatabaseForTests();
    indexedDB.deleteDatabase("artelier-playa");
  });

  it("lists completed progress after lifecycle complete", async () => {
    const services = createTestAppServices();
    await services.sidequestLifecycle.complete({
      sidequestId: "sq_sample_tea_stop",
      notes: "Reviewed offline",
    });

    render(
      <AppProviders services={services}>
        <MemoryRouter>
          <SavedLibrary />
        </MemoryRouter>
      </AppProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-completed")).toHaveTextContent(/Mirage Tea Stop/i);
    });
    expect(screen.getByTestId("review-completed")).toHaveTextContent(/Reviewed offline/i);
  });
});
