export function RoutePlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-3">
      <h1 className="font-display text-3xl tracking-[0.06em]">{title}</h1>
      <p className="font-body text-sm text-muted-foreground">{body}</p>
    </section>
  );
}
