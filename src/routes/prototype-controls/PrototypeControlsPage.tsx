import { useState } from "react";
import { Link } from "react-router-dom";
import { useAppServices } from "@/app/providers";
import { LocationPrivacyNote } from "@/features/location/components/LocationPrivacyNote";
import { LOCATION_TEST_PRESETS } from "@/features/location/config/locationTestPresets";
import { useForegroundLocation } from "@/features/location/hooks/useForegroundLocation";

export function PrototypeControlsPage() {
  const { config, data, location } = useAppServices();
  const locationSession = useForegroundLocation();
  const [latitude, setLatitude] = useState("40.7864");
  const [longitude, setLongitude] = useState("-119.2065");
  const [accuracy, setAccuracy] = useState("8");
  const [simNote, setSimNote] = useState<string | null>(null);

  if (!config.env.VITE_ENABLE_PROTOTYPE_CONTROLS && config.env.VITE_APP_ENV === "production") {
    return (
      <section className="space-y-3">
        <h1 className="font-display text-3xl tracking-[0.06em]">Prototype controls</h1>
        <p className="font-body text-sm text-muted-foreground">Disabled in this environment.</p>
      </section>
    );
  }

  const applySimulated = () => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const accuracyMeters = Number(accuracy);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setSimNote("Enter valid latitude and longitude.");
      return;
    }
    location.setSimulatedLocation({
      latitude: lat,
      longitude: lng,
      accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : 5,
    });
    locationSession.enable();
    setSimNote("Simulated location applied for this session.");
  };

  const applyPreset = (preset: (typeof LOCATION_TEST_PRESETS)[number]) => {
    setLatitude(String(preset.coordinates.latitude));
    setLongitude(String(preset.coordinates.longitude));
    setAccuracy(String(preset.coordinates.accuracyMeters ?? 8));
    location.setSimulatedLocation(preset.coordinates);
    locationSession.enable();
    setSimNote(`${preset.label} simulated for this session.`);
  };

  const clearSimulated = () => {
    location.setSimulatedLocation(null);
    if (locationSession.optedIn) locationSession.retry();
    setSimNote("Simulated location cleared.");
  };

  return (
    <section className="space-y-4">
      <h1 className="font-display text-3xl tracking-[0.06em]">Prototype controls</h1>
      <p className="font-body text-sm text-muted-foreground">
        Development aids for provider selection and simulated field state. Not a product surface.
      </p>
      <dl className="grid gap-2 font-body text-sm">
        <div>
          <dt className="text-muted-foreground">App env</dt>
          <dd>{config.env.VITE_APP_ENV}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Data provider</dt>
          <dd>{data.dataProviderId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Catalog source</dt>
          <dd>{data.catalogSource}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sync backend</dt>
          <dd>{data.syncBackend}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Map source</dt>
          <dd>{config.env.VITE_MAP_SOURCE}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Bluetooth experiment</dt>
          <dd>{config.env.VITE_ENABLE_BLUETOOTH_EXPERIMENT ? "enabled" : "disabled"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Shell version</dt>
          <dd>{config.shellVersion}</dd>
        </div>
      </dl>

      <div className="space-y-3 border border-border p-4">
        <h2 className="font-display text-xl tracking-[0.04em]">Simulated location</h2>
        <p className="font-body text-sm text-muted-foreground">
          Overrides device GPS while set. Keep behind prototype controls — never claim as live field GPS.
        </p>
        <div className="grid gap-2 sm:grid-cols-2" aria-label="Location test presets">
          {LOCATION_TEST_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="min-h-11 border border-border px-4 py-3 text-left font-body text-sm hover:bg-secondary"
              onClick={() => applyPreset(preset)}
              data-testid={`location-preset-${preset.id}`}
            >
              <span className="block font-medium">Simulate {preset.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{preset.description}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="font-body text-xs uppercase tracking-widest text-muted-foreground">
            Latitude
            <input
              className="mt-1 min-h-11 w-full border border-border bg-background px-3 font-body text-sm"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              data-testid="sim-latitude"
            />
          </label>
          <label className="font-body text-xs uppercase tracking-widest text-muted-foreground">
            Longitude
            <input
              className="mt-1 min-h-11 w-full border border-border bg-background px-3 font-body text-sm"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              data-testid="sim-longitude"
            />
          </label>
          <label className="font-body text-xs uppercase tracking-widest text-muted-foreground">
            Accuracy (m)
            <input
              className="mt-1 min-h-11 w-full border border-border bg-background px-3 font-body text-sm"
              value={accuracy}
              onChange={(e) => setAccuracy(e.target.value)}
              data-testid="sim-accuracy"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-11 bg-primary px-4 font-body text-sm text-primary-foreground"
            onClick={applySimulated}
            data-testid="apply-simulated-location"
          >
            Apply simulated location
          </button>
          <button
            type="button"
            className="min-h-11 border border-border px-4 font-body text-sm"
            onClick={clearSimulated}
            data-testid="clear-simulated-location"
          >
            Clear simulation
          </button>
        </div>
        {simNote ? <p className="font-body text-xs text-muted-foreground">{simNote}</p> : null}
        <p className="font-body text-xs text-muted-foreground" data-testid="prototype-location-state">
          Session location: {locationSession.stateLabel}
        </p>
        <LocationPrivacyNote />
      </div>

      <Link to="/sync-status" className="font-body text-sm underline">
        Open sync status
      </Link>
    </section>
  );
}
