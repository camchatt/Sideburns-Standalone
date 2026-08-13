import { useEffect, type CSSProperties } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { FieldStatusBar } from "@/components/feedback/FieldStatusBar";
import { PwaUpdateBanner } from "@/features/offline/components/PwaUpdateBanner";
import { useAppServices } from "@/app/providers";
import { BRAND_LOGO_SRC, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/branding";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "Map" },
  { to: "/nearby", label: "Nearby" },
  { to: "/create", label: "Create" },
  { to: "/saved", label: "Saved" },
  { to: "/profile", label: "Profile" },
] as const;

export function FieldShell() {
  const location = useLocation();
  const { pwa } = useAppServices();
  const mapRoute = location.pathname === "/app" || location.pathname === "/explore";

  useEffect(() => {
    void pwa.register();
  }, [pwa]);

  const mapChromeStyle = mapRoute
    ? ({ ["--map-chrome-offset" as string]: "3.75rem" } as CSSProperties)
    : undefined;

  return (
    <div className={cn("playa-shell min-h-dvh text-foreground", mapRoute && "map-first-shell")} style={mapChromeStyle}>
      <header
        className={cn(
          "border-b border-border/80 bg-background pt-[env(safe-area-inset-top)]",
          mapRoute
            ? "sticky top-0 z-40 border-border/50 bg-background/95 shadow-sm backdrop-blur-md"
            : "bg-background/80 backdrop-blur-sm",
        )}
      >
        <div
          className={cn(
            "mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
            mapRoute && "gap-2 py-2",
          )}
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <img
              src={BRAND_LOGO_SRC}
              alt=""
              width={500}
              height={402}
              className={cn("h-14 w-auto shrink-0 sm:h-16", mapRoute && "h-10 sm:h-11")}
              decoding="async"
            />
            <div className="min-w-0">
              <p
                className={cn(
                  "font-display tracking-[0.12em] text-foreground",
                  mapRoute ? "text-2xl font-semibold sm:text-3xl" : "text-3xl sm:text-4xl",
                )}
                aria-label={PRODUCT_NAME}
              >
                {PRODUCT_NAME}
              </p>
              {!mapRoute ? (
                <p className="mt-1 max-w-md font-body text-sm text-muted-foreground">{PRODUCT_TAGLINE}</p>
              ) : null}
            </div>
          </div>
          {!mapRoute ? <FieldStatusBar /> : null}
          {!mapRoute ? (
            <nav className="flex flex-wrap gap-1" aria-label="Primary">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex min-h-11 items-center rounded-md px-3 py-2 font-body text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          ) : null}
        </div>
      </header>
      <main
        className={
          mapRoute
            ? "w-full"
            : "mx-auto max-w-3xl px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
        }
      >
        <Outlet />
      </main>
      <PwaUpdateBanner />
    </div>
  );
}
