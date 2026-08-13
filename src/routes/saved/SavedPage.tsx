import { SavedLibrary } from "@/features/sidequests/components/SavedLibrary";

export function SavedPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-display text-3xl tracking-[0.06em]">Saved</h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Review saved, in-progress, and completed sidequests stored on this device.
        </p>
      </div>
      <SavedLibrary />
    </section>
  );
}
