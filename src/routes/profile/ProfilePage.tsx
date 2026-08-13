import { useState, type FormEvent } from "react";
import { useLocalIdentity } from "@/features/identity/hooks/useLocalIdentity";

export function ProfilePage() {
  const { identity, ready, updateDisplayName } = useLocalIdentity();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const displayValue = name || identity?.displayName || "";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = (name || identity?.displayName || "").trim();
    if (!trimmed) {
      setError("Enter a burner name or pseudonym.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateDisplayName(trimmed);
      setName(trimmed);
      setSaved(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not save display name.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-wide">Profile</h1>
        <p className="mt-2 max-w-prose font-body text-sm text-muted-foreground">
          Join once with a burner name or pseudonym. No email or password — just a lightweight local
          identity so your posts can show who presented them.
        </p>
      </div>

      {!ready ? (
        <p className="text-sm text-muted-foreground">Loading local identity…</p>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="max-w-md space-y-4">
          <label className="block font-body text-xs uppercase tracking-widest text-muted-foreground">
            Display name
            <input
              aria-label="Display name"
              value={name || identity?.displayName || ""}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              className="mt-1 min-h-11 w-full border border-border bg-background px-3 font-body text-sm text-foreground"
              maxLength={80}
              placeholder="e.g. Dust Bunny"
              autoComplete="nickname"
            />
          </label>
          {identity ? (
            <p className="text-xs text-muted-foreground">
              Local id stays on this device and is never shown as a device identifier in the UI.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              You will also be asked for a name the first time you create or complete content.
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !displayValue.trim()}
            className="min-h-11 bg-foreground px-4 font-body text-sm uppercase tracking-widest text-background disabled:opacity-50"
          >
            {busy ? "Saving…" : identity ? "Update name" : "Save name"}
          </button>
          {saved ? (
            <p className="text-sm text-foreground" role="status">
              Saved as {identity?.displayName}.
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
