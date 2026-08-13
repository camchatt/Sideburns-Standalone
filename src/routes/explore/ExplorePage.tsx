import { useEffect, useState } from "react";
import { useAppServices } from "@/app/providers";
import type { Sidequest } from "@/features/sidequests/types/sidequest";

export function ExplorePage() {
  const { data } = useAppServices();
  const [items, setItems] = useState<Sidequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void data.sidequests
      .getAll()
      .then((quests) => {
        if (active) setItems(quests);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load sidequests");
      });
    return () => {
      active = false;
    };
  }, [data.sidequests]);

  return (
    <section className="space-y-4">
      <h1 className="font-display text-3xl tracking-[0.06em]">Explore</h1>
      <p className="font-body text-sm text-muted-foreground">
        Sample provider output only. Full explore UX is not implemented yet.
      </p>
      {error ? <p className="font-body text-sm text-destructive">{error}</p> : null}
      {!items && !error ? <p className="font-body text-sm text-muted-foreground">Loading…</p> : null}
      {items ? (
        <ul className="space-y-3">
          {items.map((quest) => (
            <li key={quest.id} className="border-b border-border pb-3">
              <p className="font-body text-base font-medium">{quest.title}</p>
              <p className="font-body text-sm text-muted-foreground">{quest.description}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
