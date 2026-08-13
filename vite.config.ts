import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { APP_SHELL_CACHE_VERSION } from "./src/lib/pwa/versioning";
import { formatEnvValidationError, parseEnv } from "./src/lib/validation/env";

/**
 * App-shell PWA only. Large map / playa-pack assets stay out of the shell precache
 * (see docs/offline-strategy.md). Workbox cleanupOutdatedCaches touches Cache Storage
 * with Workbox prefixes only — never IndexedDB or pending local user data.
 *
 * Static hosts must rewrite unknown paths to index.html for SPA deep links before the
 * service worker controls the page — see docs/deployment.md and public/_redirects /
 * vercel.json / public/_routes.json.
 */
export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), "");
  // `vite build` uses mode "production"; default APP_ENV accordingly so prototype
  // controls and supabase URL rules apply even when VITE_APP_ENV is omitted in CI.
  const loadedForValidation = {
    ...loaded,
    VITE_APP_ENV:
      loaded.VITE_APP_ENV || (mode === "production" ? "production" : undefined),
  };
  try {
    parseEnv(loadedForValidation);
  } catch (error) {
    const message = formatEnvValidationError(error);
    if (mode === "production" || loadedForValidation.VITE_APP_ENV === "production") {
      throw new Error(message);
    }
    // Non-production: surface clearly in the Vite process log without aborting every
    // half-finished local .env while iterating.
    console.warn(message);
  }

  return {
    server: {
      host: "::",
      port: 8080,
      strictPort: true,
      proxy: {
        "/tiles/osm": {
          target: "https://tile.openstreetmap.org",
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/tiles\/osm/, ""),
        },
        "/tiles/esri-imagery": {
          target: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile",
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/tiles\/esri-imagery/, ""),
        },
        "/tiles/esri-reference": {
          target: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile",
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/tiles\/esri-reference/, ""),
        },
      },
      hmr: {
        overlay: false,
      },
    },
    preview: {
      // Local preview is a secure context on localhost; geolocation + SW work here.
      // Deployed origins must be HTTPS — see docs/deployment.md.
      port: 4173,
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        // Manifest lives in public/manifest.webmanifest (single source of truth).
        manifest: false,
        includeAssets: [
          "icons/*.png",
          "images/sideburn-logo.png",
          "images/sideburn-favicon.png",
          "images/sleep-until-tomorrow.jpg",
          "offline.html",
          "fonts/*",
          "sample-data/*.json",
          "manifest.webmanifest",
        ],
        workbox: {
          cacheId: APP_SHELL_CACHE_VERSION,
          cleanupOutdatedCaches: true,
          // Field-test releases must replace stale iOS Safari shells without requiring
          // testers to discover an update prompt. This only replaces Cache Storage;
          // user beacons and the sync outbox remain in IndexedDB.
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//, /^\/maps\//, /^\/packs\//, /^\/tiles\//],
          globPatterns: [
            "**/*.{js,css,html,ico,svg,woff,woff2,ttf,otf,png,webp,webmanifest,json}",
          ],
          globIgnores: [
            "**/maps/**",
            "**/packs/**",
            "**/node_modules/**",
            "**/icons/README.md",
          ],
          // Fonts may load from Google until self-hosted; cache them for offline shell.
          // Do not add runtime routes that cache authenticated mutation responses —
          // non-GET traffic has no Workbox cache route and stays network-only by default.
          runtimeCaching: [
            {
              urlPattern: ({ url, request }) =>
                request.method === "GET" &&
                (url.origin === "https://fonts.googleapis.com" ||
                  url.origin === "https://fonts.gstatic.com"),
              handler: "CacheFirst",
              options: {
                cacheName: `${APP_SHELL_CACHE_VERSION}-fonts`,
                expiration: {
                  maxEntries: 32,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          suppressWarnings: true,
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom"],
    },
  };
});
