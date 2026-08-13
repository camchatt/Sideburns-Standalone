/**
 * Production-build field-readiness audit for SIDEBURNS.
 * Run after `npm run build`. Exit code 1 on failures.
 *
 * Checks (automated):
 * - manifest.webmanifest shape + required icons on disk
 * - apple-touch-icon + favicon present
 * - offline.html viewport-fit + SIDEBURNS branding
 * - service worker / Workbox artifacts present
 * - navigateFallback SPA shell (index.html)
 * - no user-facing "Artelier" / "artelier" in dist HTML/JS/CSS/webmanifest
 * - no service-role / forbidden secret patterns in dist
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function ok(message) {
  notes.push(`OK  ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function exists(rel) {
  return fs.existsSync(path.join(dist, rel));
}

function walkFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, exts, out);
      continue;
    }
    if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

if (!fs.existsSync(dist)) {
  fail(`Missing dist/ — run npm run build first (${dist})`);
  printAndExit();
}

// --- Manifest ---
const manifestPath = path.join(dist, "manifest.webmanifest");
if (!fs.existsSync(manifestPath)) {
  fail("dist/manifest.webmanifest missing");
} else {
  const manifest = readJson(manifestPath);
  if (manifest.name !== "SIDEBURNS" || manifest.short_name !== "SIDEBURNS") {
    fail(`Manifest name/short_name must be SIDEBURNS (got ${manifest.name}/${manifest.short_name})`);
  } else {
    ok("Manifest name/short_name = SIDEBURNS");
  }
  if (manifest.display !== "standalone") {
    fail(`Manifest display must be standalone (got ${manifest.display})`);
  } else {
    ok("Manifest display = standalone");
  }
  if (manifest.start_url !== "/" || manifest.scope !== "/") {
    fail(`Manifest start_url/scope unexpected: ${manifest.start_url} / ${manifest.scope}`);
  } else {
    ok("Manifest start_url and scope = /");
  }
  const purposes = new Set();
  for (const icon of manifest.icons ?? []) {
    const src = String(icon.src ?? "").replace(/^\//, "");
    if (!exists(src)) fail(`Manifest icon missing from dist: ${icon.src}`);
    for (const purpose of String(icon.purpose ?? "any").split(" ")) {
      purposes.add(purpose);
    }
  }
  if (!purposes.has("any") || !purposes.has("maskable")) {
    fail("Manifest must include both any and maskable icon purposes");
  } else {
    ok("Manifest icons include any + maskable");
  }
}

function pngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString("ascii", 1, 4) !== "PNG") throw new Error(`${filePath} is not PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const requiredAssets = [
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-192-maskable.png",
  "icons/icon-512-maskable.png",
  "icons/apple-touch-icon.png",
  "images/sideburn-logo.png",
  "images/sideburn-favicon.png",
  "offline.html",
  "index.html",
];
for (const asset of requiredAssets) {
  if (!exists(asset)) fail(`Missing required asset: ${asset}`);
  else ok(`Asset present: ${asset}`);
}

const iconSizeChecks = [
  ["icons/icon-192.png", 192],
  ["icons/icon-512.png", 512],
  ["icons/icon-192-maskable.png", 192],
  ["icons/icon-512-maskable.png", 512],
  ["icons/apple-touch-icon.png", 180],
];
for (const [rel, expected] of iconSizeChecks) {
  if (!exists(rel)) continue;
  try {
    const { width, height } = pngSize(path.join(dist, rel));
    if (width !== expected || height !== expected) {
      fail(`Icon ${rel} is ${width}x${height}, expected ${expected}x${expected}`);
    } else {
      ok(`Icon ${rel} is ${expected}x${expected}`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

// --- index.html / offline.html meta ---
const indexHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
for (const needle of [
  'name="apple-mobile-web-app-capable" content="yes"',
  'name="apple-mobile-web-app-title" content="SIDEBURNS"',
  'rel="apple-touch-icon"',
  'rel="manifest"',
  "viewport-fit=cover",
  "<title>SIDEBURNS</title>",
]) {
  if (!indexHtml.includes(needle)) fail(`index.html missing: ${needle}`);
  else ok(`index.html has ${needle}`);
}

const offlineHtml = fs.readFileSync(path.join(dist, "offline.html"), "utf8");
if (!offlineHtml.includes("SIDEBURNS")) fail("offline.html missing SIDEBURNS branding");
if (!offlineHtml.includes("viewport-fit=cover")) fail("offline.html missing viewport-fit=cover");
if (!offlineHtml.includes("safe-area-inset")) fail("offline.html missing safe-area insets");
else ok("offline.html branded + safe-area viewport");

// --- Service worker / Workbox ---
const swCandidates = ["sw.js", "service-worker.js", "workbox-*.js"].flatMap((pattern) => {
  if (!pattern.includes("*")) return exists(pattern) ? [pattern] : [];
  const prefix = pattern.replace("*", "");
  return fs
    .readdirSync(dist)
    .filter((name) => name.startsWith("workbox-") && name.endsWith(".js"))
    .map((name) => name);
});
if (!exists("sw.js") && !exists("service-worker.js")) {
  // vite-plugin-pwa typically emits dist/sw.js
  fail("No service worker entry (sw.js / service-worker.js) in dist");
} else {
  ok("Service worker entry present");
}
if (swCandidates.length === 0 && !fs.readdirSync(dist).some((n) => n.startsWith("workbox-"))) {
  fail("No Workbox runtime chunk found in dist");
} else {
  ok("Workbox assets present");
}

const swSource = exists("sw.js")
  ? fs.readFileSync(path.join(dist, "sw.js"), "utf8")
  : exists("service-worker.js")
    ? fs.readFileSync(path.join(dist, "service-worker.js"), "utf8")
    : "";
if (swSource) {
  if (!/index\.html|navigateFallback|createHandlerBoundToURL/i.test(swSource)) {
    // Workbox injects createHandlerBoundToURL for navigateFallback
    notes.push("WARN  Could not confirm navigateFallback string in SW (may be mangled)");
  } else {
    ok("Service worker references SPA navigate fallback");
  }
  if (/indexedDB\.deleteDatabase|IDBDatabase/i.test(swSource) && /deleteDatabase/i.test(swSource)) {
    fail("Service worker appears to delete IndexedDB — forbidden for field updates");
  } else {
    ok("Service worker does not call indexedDB.deleteDatabase");
  }
}

// --- Branding / secrets scan ---
const scanFiles = walkFiles(dist, [".html", ".js", ".css", ".webmanifest", ".json"]);
const artelierHits = [];
const secretHits = [];
for (const file of scanFiles) {
  // Skip large pack/map payloads — shell scan only
  const rel = path.relative(dist, file).replace(/\\/g, "/");
  if (rel.startsWith("packs/") || rel.startsWith("maps/")) continue;
  const text = fs.readFileSync(file, "utf8");
  // Known non-UI identifiers (legacy IndexedDB name + remote DTO column).
  const withoutInternal = text
    .replace(/artelier-playa/gi, "")
    .replace(/artelier_project_slug/gi, "");
  if (/Artelier/i.test(withoutInternal)) {
    artelierHits.push(rel);
  }
  // Credential-shaped leaks only — not Zod/env rejection copy that forbids service-role keys.
  if (/sb_secret_[A-Za-z0-9]+/.test(text)) {
    secretHits.push(`${rel} (sb_secret_)`);
  }
  const jwtMatches = text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g);
  for (const match of jwtMatches) {
    try {
      const payload = JSON.parse(
        Buffer.from(match[0].split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
          "utf8",
        ),
      );
      if (payload?.role === "service_role") {
        secretHits.push(`${rel} (service_role JWT)`);
      }
    } catch {
      // ignore undecodable fragments
    }
  }
  if (/VITE_SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']+["']/.test(text)) {
    secretHits.push(`${rel} (SERVICE_ROLE_KEY assigned)`);
  }
}

if (artelierHits.length) {
  fail(`User-facing Artelier reference(s) in dist: ${artelierHits.slice(0, 8).join(", ")}`);
} else {
  ok("No user-facing Artelier strings in dist HTML/JS/CSS/manifest");
}

if (secretHits.length) {
  fail(`Possible service-role / forbidden secret pattern in: ${secretHits.slice(0, 8).join(", ")}`);
} else {
  ok("No service-role credential patterns in dist scan");
}

// --- Sample mode assets for offline ---
if (!exists("sample-data/sidequests.json") && !exists("packs/catalog.json")) {
  notes.push("WARN  Neither sample-data/sidequests.json nor packs/catalog.json found in dist");
} else {
  ok("Offline sample/pack catalog assets present");
}

// --- SPA host fallback artifact (Netlify / Cloudflare Pages) ---
if (exists("_redirects")) {
  const redirects = fs.readFileSync(path.join(dist, "_redirects"), "utf8");
  if (/\/\*\s+\/index\.html\s+200/.test(redirects)) {
    ok("dist/_redirects includes SPA /* → /index.html 200 fallback");
  } else {
    fail("dist/_redirects present but missing /* → /index.html 200 SPA fallback");
  }
} else {
  notes.push(
    "WARN  dist/_redirects missing — Netlify/Cloudflare SPA deep links need host rewrite (see docs/deployment.md)",
  );
}

printAndExit();

function printAndExit() {
  console.log("SIDEBURNS field-readiness audit (production dist)\n");
  for (const line of notes) console.log(line);
  if (failures.length) {
    console.log("\nFAILURES:");
    for (const line of failures) console.log(`FAIL ${line}`);
    console.log(`\n${failures.length} failure(s).`);
    process.exit(1);
  }
  console.log("\nAll automated field-readiness checks passed.");
  console.log("Manual hardware matrix still required — see docs/offline-strategy.md.");
  console.log("Deploy only with explicit authorization — see docs/deployment.md / docs/release-checklist.md.");
  process.exit(0);
}
