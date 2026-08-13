import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAppServices } from "@/app/providers";
import { useLocalIdentity } from "@/features/identity/hooks/useLocalIdentity";
import { LocationPrivacyNote } from "@/features/location/components/LocationPrivacyNote";
import type {
  QuestAvailability,
  QuestCategory,
  QuestDifficulty,
  SidequestCompletionRule,
} from "@/features/sidequests/types/sidequest";
import { LocalPersistenceError } from "@/features/sidequests/utils/localPersistence";
import { BRC_MAP_BOUNDS } from "@/features/map/utils/playaGeo";
import {
  beaconKindLabel,
  CREATABLE_BEACON_KINDS,
  type CreatableBeaconKind,
} from "@/features/map/utils/beaconKinds";

const CATEGORIES: QuestCategory[] = ["art", "camp", "performance", "service", "explore", "other"];
const AVAILABILITIES: QuestAvailability[] = ["always", "daytime", "nighttime", "scheduled", "unknown"];
const DIFFICULTIES: QuestDifficulty[] = ["easy", "moderate", "challenging", "unknown"];
const COMPLETION_RULES: SidequestCompletionRule[] = ["open", "proximity"];

const DRAFT_KEY = "sideburn.create-sidequest.draft.v1";

type CreateDraft = {
  title: string;
  description: string;
  category: QuestCategory;
  availability: QuestAvailability;
  difficulty: QuestDifficulty;
  completionRule: SidequestCompletionRule;
  radiusMeters: number;
  latitude: number;
  longitude: number;
  beaconKind: CreatableBeaconKind;
};

const DEFAULT_DRAFT: CreateDraft = {
  title: "",
  description: "",
  category: "explore",
  availability: "always",
  difficulty: "easy",
  completionRule: "open",
  radiusMeters: 30,
  latitude: 40.7864,
  longitude: -119.2065,
  beaconKind: "sideburn",
};

function readDraft(): CreateDraft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return DEFAULT_DRAFT;
    const parsed = { ...DEFAULT_DRAFT, ...(JSON.parse(raw) as Partial<CreateDraft>) };
    const kind = String((JSON.parse(raw) as { beaconKind?: string }).beaconKind ?? parsed.beaconKind);
    if (kind === "sidequest") parsed.beaconKind = "sideburn";
    else if (kind === "medical" || kind === "bike" || kind === "restroom") parsed.beaconKind = "do_good";
    else if (kind === "massage") parsed.beaconKind = "get_weird";
    else if (kind === "sideburn" || kind === "food" || kind === "get_weird" || kind === "do_good") {
      parsed.beaconKind = kind;
    } else {
      parsed.beaconKind = "sideburn";
    }
    return parsed;
  } catch {
    return DEFAULT_DRAFT;
  }
}

function writeDraft(draft: CreateDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Session draft is best-effort; form state still holds values in memory.
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

const fieldClass =
  "mt-1 min-h-11 w-full border border-border bg-background px-3 font-body text-sm text-foreground";
const labelClass = "block font-body text-xs uppercase tracking-widest text-muted-foreground";

export function CreateSidequestForm() {
  const { data, location, syncService } = useAppServices();
  const { requireDisplayName } = useLocalIdentity();
  const navigate = useNavigate();
  const initial = readDraft();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState<QuestCategory>(initial.category);
  const [availability, setAvailability] = useState<QuestAvailability>(initial.availability);
  const [difficulty, setDifficulty] = useState<QuestDifficulty>(initial.difficulty);
  const [completionRule, setCompletionRule] = useState<SidequestCompletionRule>(initial.completionRule);
  const [radiusMeters, setRadiusMeters] = useState(initial.radiusMeters);
  const [latitude, setLatitude] = useState(initial.latitude);
  const [longitude, setLongitude] = useState(initial.longitude);
  const [beaconKind, setBeaconKind] = useState<CreatableBeaconKind>(initial.beaconKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    writeDraft({
      title,
      description,
      category,
      availability,
      difficulty,
      completionRule,
      radiusMeters,
      latitude,
      longitude,
      beaconKind,
    });
  }, [
    title,
    description,
    category,
    availability,
    difficulty,
    completionRule,
    radiusMeters,
    latitude,
    longitude,
    beaconKind,
  ]);

  const fillFromMyLocation = async () => {
    setLocationNote(null);
    setError(null);
    const reading = await location.getCurrent();
    if (!reading.coordinates) {
      setLocationNote(reading.error ?? "Location unavailable");
      return;
    }
    setLatitude(reading.coordinates.latitude);
    setLongitude(reading.coordinates.longitude);
    setLocationNote(
      reading.source === "simulated"
        ? "Filled from simulated location"
        : `Filled from GPS (±${Math.round(reading.accuracyMeters ?? 0)} m)`,
    );
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setRecovery(null);
    try {
      const identity = await requireDisplayName(
        "Choose a burner name before creating a sidequest. No email or password required.",
      );
      if (!identity) {
        setBusy(false);
        return;
      }
      const created = await data.sidequests.create({
        title: title.trim(),
        description: description.trim(),
        category,
        availability,
        difficulty,
        completionRule,
        radiusMeters,
        location: { latitude, longitude },
        beaconKind: beaconKind === "sideburn" ? null : beaconKind,
        creatorId: identity.id,
        creatorDisplayName: identity.displayName,
        contentOrigin: "user",
        presenter: identity.displayName,
      });
      await syncService.drain();
      clearDraft();
      navigate(`/?record=${encodeURIComponent(created.id)}&year=${new Date().getUTCFullYear()}`, {
        replace: false,
      });
    } catch (reason: unknown) {
      if (reason instanceof LocalPersistenceError) {
        setError(reason.message);
        setRecovery(reason.recoveryHint);
      } else {
        setError(reason instanceof Error ? reason.message : "Unable to save sidequest");
        setRecovery("Your draft stays in this form until save succeeds — connectivity is not required.");
      }
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" data-testid="create-sidequest-form">
      <p className="font-body text-sm text-muted-foreground">
        Saves locally first. Sync is deferred until connectivity and outbox work land.
        {offline ? " You are offline — local save still works." : null}
      </p>
      <label className={labelClass}>
        Title
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={fieldClass}
          maxLength={120}
        />
      </label>
      <label className={labelClass}>
        Description
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${fieldClass} min-h-28 py-2`}
          maxLength={2000}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={labelClass}>
          Beacon type
          <select value={beaconKind} onChange={(e) => setBeaconKind(e.target.value as CreatableBeaconKind)} className={fieldClass} data-testid="create-beacon-kind">
            {CREATABLE_BEACON_KINDS.map((value) => (
              <option key={value} value={value}>{beaconKindLabel(value)}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as QuestCategory)} className={fieldClass}>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Availability
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value as QuestAvailability)}
            className={fieldClass}
          >
            {AVAILABILITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Difficulty
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as QuestDifficulty)}
            className={fieldClass}
          >
            {DIFFICULTIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={labelClass}>
        Completion rule
        <select
          value={completionRule}
          onChange={(e) => setCompletionRule(e.target.value as SidequestCompletionRule)}
          className={fieldClass}
          data-testid="create-completion-rule"
        >
          {COMPLETION_RULES.map((value) => (
            <option key={value} value={value}>
              {value === "open" ? "Open (no GPS required)" : "Proximity (must be within radius)"}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Radius (meters)
        <input
          type="number"
          min={5}
          max={500}
          required
          value={radiusMeters}
          onChange={(e) => setRadiusMeters(Number(e.target.value))}
          className={fieldClass}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Latitude
          <input
            type="number"
            step="any"
            required
            value={latitude}
            onChange={(e) => setLatitude(Number(e.target.value))}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          Longitude
          <input
            type="number"
            step="any"
            required
            value={longitude}
            onChange={(e) => setLongitude(Number(e.target.value))}
            className={fieldClass}
          />
        </label>
      </div>
      <PlayaLocationPicker latitude={latitude} longitude={longitude} onChange={(next) => { setLatitude(next.latitude); setLongitude(next.longitude); }} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void fillFromMyLocation()}
          className="min-h-11 border border-border px-4 font-body text-sm hover:bg-secondary"
        >
          Use my location
        </button>
        {locationNote ? <p className="font-body text-xs text-muted-foreground">{locationNote}</p> : null}
      </div>
      <LocationPrivacyNote />
      {error ? (
        <p className="font-body text-sm text-destructive" data-testid="create-sidequest-error">
          {error}
        </p>
      ) : null}
      {recovery ? (
        <p className="font-body text-xs text-muted-foreground" data-testid="create-sidequest-recovery">
          {recovery}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || !title.trim() || !description.trim()}
        className="min-h-11 bg-primary px-5 font-body text-sm text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save beacon locally"}
      </button>
    </form>
  );
}

function PlayaLocationPicker({ latitude, longitude, onChange }: { latitude: number; longitude: number; onChange: (coordinates: { latitude: number; longitude: number }) => void }) {
  const left = ((longitude - BRC_MAP_BOUNDS.minLongitude) / (BRC_MAP_BOUNDS.maxLongitude - BRC_MAP_BOUNDS.minLongitude)) * 100;
  const top = (1 - (latitude - BRC_MAP_BOUNDS.minLatitude) / (BRC_MAP_BOUNDS.maxLatitude - BRC_MAP_BOUNDS.minLatitude)) * 100;
  const choose = (event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    onChange({
      longitude: BRC_MAP_BOUNDS.minLongitude + x * (BRC_MAP_BOUNDS.maxLongitude - BRC_MAP_BOUNDS.minLongitude),
      latitude: BRC_MAP_BOUNDS.maxLatitude - y * (BRC_MAP_BOUNDS.maxLatitude - BRC_MAP_BOUNDS.minLatitude),
    });
  };
  return (
    <div>
      <p className={labelClass}>Tap the playa to place this beacon</p>
      <button type="button" onClick={choose} className="relative mt-1 aspect-[16/9] w-full overflow-hidden border border-border bg-[radial-gradient(ellipse_at_center,#d5c29b_0%,#9e815a_58%,#4e3e2f_100%)]" aria-label="Choose beacon location on playa map" data-testid="create-location-picker">
        <span className="absolute inset-[14%_22%] rounded-[50%] border border-white/50" aria-hidden />
        <span className="absolute left-1/2 top-[43%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black ring-1 ring-white" aria-hidden />
        <span className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-red-500 bg-white/40" style={{ left: `${Math.min(100, Math.max(0, left))}%`, top: `${Math.min(100, Math.max(0, top))}%` }} aria-hidden />
      </button>
    </div>
  );
}
