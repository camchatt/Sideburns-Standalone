import {
  detectInstallPlatform,
  getInstallGuidance,
  isStandaloneDisplay,
  type InstallPlatform,
} from "@/lib/pwa/platformInstall";

type InstallGuideProps = {
  platform?: InstallPlatform;
  alreadyInstalled?: boolean;
};

export function InstallGuide({ platform, alreadyInstalled }: InstallGuideProps) {
  const resolvedPlatform = platform ?? detectInstallPlatform();
  const guidance = getInstallGuidance(resolvedPlatform, {
    alreadyInstalled: alreadyInstalled ?? isStandaloneDisplay(),
  });

  return (
    <section
      className="space-y-3 border border-border bg-background/60 p-4"
      aria-labelledby="install-guide-heading"
    >
      <h2 id="install-guide-heading" className="font-display text-2xl tracking-[0.06em]">
        {guidance.headline}
      </h2>
      <ol className="list-decimal space-y-2 pl-5 font-body text-sm text-foreground">
        {guidance.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="font-body text-xs text-muted-foreground">{guidance.note}</p>
      <p className="font-body text-xs text-muted-foreground">
        Detected platform: {guidance.platform}
        {guidance.alreadyInstalled ? " · standalone" : ""}.
      </p>
    </section>
  );
}
