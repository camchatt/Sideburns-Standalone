import { CreateSidequestForm } from "@/features/sidequests/components/CreateSidequestForm";

export function CreatePage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-display text-3xl tracking-[0.06em]">Create</h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Offline sidequest creation writes to local storage before any remote sync.
        </p>
      </div>
      <CreateSidequestForm />
    </section>
  );
}
