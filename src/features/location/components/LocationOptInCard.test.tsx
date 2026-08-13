import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocationOptInCard } from "@/features/location/components/LocationOptInCard";

describe("LocationOptInCard", () => {
  it("explains remembered denial, preserves browsing, and offers retry", () => {
    const retry = vi.fn();
    render(
      <LocationOptInCard
        optedIn
        state="denied"
        onEnable={vi.fn()}
        onRetry={retry}
        onDisable={vi.fn()}
      />,
    );

    expect(screen.getByText(/browsing stays available/i)).toBeInTheDocument();
    expect(screen.getByText(/Windows Settings/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry location" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("explains the HTTPS or localhost requirement", () => {
    render(
      <LocationOptInCard
        optedIn
        state="insecure"
        onEnable={vi.fn()}
        onRetry={vi.fn()}
        onDisable={vi.fn()}
      />,
    );
    expect(screen.getByText(/HTTPS or localhost/i)).toBeInTheDocument();
  });
});
