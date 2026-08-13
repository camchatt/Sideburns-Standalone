/** Privacy copy for foreground GPS opt-in surfaces. */
export function LocationPrivacyNote({ className }: { className?: string }) {
  return (
    <p className={className ?? "font-body text-xs text-muted-foreground"}>
      Location is used only while SIDEBURNS is open in the foreground. Coordinates stay on this
      device unless a later feature asks you to share them. This PWA cannot provide reliable
      background tracking, including on iOS.
    </p>
  );
}
