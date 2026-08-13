import { clockRadiusToLatLng, manCenterForYear } from "./geo";
import { getPlayaSupabase } from "./supabase";

export type BurningManLocationPrecision =
  | "official_gps"
  | "official_address_geocoded"
  | "official_relative_map"
  | "community_geocoded"
  | "historical_approximation"
  | "unknown"
  | "mobile";

export type BurningManLinkedContributor = {
  id?: string;
  slug?: string | null;
  display_name?: string | null;
  name?: string | null;
  [key: string]: unknown;
};

/** Map-focused public BM project (subset of Artelier registry view). */
export type BurningManProject = {
  id: string;
  event_year: number;
  slug: string;
  title: string;
  description: string | null;
  artist_name_raw: string | null;
  artist_location_raw: string | null;
  theme: string | null;
  program: string | null;
  installation_type: string | null;
  location_string: string | null;
  clock_hour: number | null;
  clock_minute: number | null;
  distance_feet: number | null;
  latitude: number | null;
  longitude: number | null;
  location_precision: BurningManLocationPrecision;
  location_confidence: number | null;
  location_source: string | null;
  location_method: string | null;
  is_mobile: boolean;
  is_test_record: boolean;
  is_location_valid: boolean;
  validation_notes: string[];
  hero_image_url: string | null;
  hero_image_attribution: string | null;
  additional_credits: string | null;
  artist_website_url: string | null;
  source_uid: string | null;
  source_type: string;
  source_url: string;
  proof_source_url: string | null;
  source_hash: string;
  source_retrieved_at: string;
  created_at: string;
  updated_at: string;
  artelier_project_id: string | null;
  artelier_project_slug: string | null;
  linked_contributors: BurningManLinkedContributor[];
};

export type BurningManProjectFilters = {
  years?: number[];
  query?: string;
  placement?: "all" | "mapped" | "unmapped";
};

export type BurningManFacets = {
  years: number[];
  themes: string[];
  programs: string[];
  placementStatuses: Array<"mapped" | "unmapped">;
};

export type BurningManMapPoint = {
  project: BurningManProject;
  lat: number;
  lng: number;
  kind: "exact" | "approximate";
};

export type BurningManMapPlacements = {
  years: number[];
  mapped: BurningManMapPoint[];
  unmapped: BurningManProject[];
};

type BurningManProjectRow = Omit<BurningManProject, "linked_contributors"> & {
  linked_contributors?: BurningManLinkedContributor[] | null;
};

export function normalizeBurningManProject(row: BurningManProjectRow): BurningManProject {
  return {
    ...row,
    linked_contributors: Array.isArray(row.linked_contributors)
      ? row.linked_contributors
      : [],
    proof_source_url: row.proof_source_url ?? null,
  };
}

export async function listBurningManProjects(
  filters: BurningManProjectFilters = {},
): Promise<BurningManProject[]> {
  const supabase = getPlayaSupabase();
  let q = supabase.from("burning_man_public_projects").select("*");

  if (filters.years?.length) q = q.in("event_year", filters.years);
  if (filters.placement === "mapped") q = q.eq("is_location_valid", true);
  if (filters.placement === "unmapped") q = q.eq("is_location_valid", false);

  const { data, error } = await q
    .order("event_year", { ascending: false })
    .order("title", { ascending: true });
  if (error) throw error;

  return filterBurningManProjects(
    ((data ?? []) as BurningManProjectRow[]).map(normalizeBurningManProject),
    filters,
  );
}

export async function listBurningManMapPlacements(opts: {
  years?: number[];
} = {}): Promise<BurningManMapPlacements> {
  const projects = await listBurningManProjects({ years: opts.years });
  return splitBurningManMapPlacements(projects);
}

export async function listBurningManFacets(): Promise<BurningManFacets> {
  const supabase = getPlayaSupabase();
  const { data, error } = await supabase
    .from("burning_man_public_projects")
    .select("event_year, theme, program, is_location_valid");
  if (error) throw error;
  return deriveBurningManFacets((data ?? []) as BurningManProject[]);
}

export function filterBurningManProjects(
  projects: BurningManProject[],
  filters: BurningManProjectFilters = {},
): BurningManProject[] {
  const q = (filters.query ?? "").trim().toLowerCase();
  return projects.filter((project) => {
    if (filters.years?.length && !filters.years.includes(project.event_year)) {
      return false;
    }
    if (filters.placement === "mapped" && !projectToMapPoint(project)) return false;
    if (filters.placement === "unmapped" && projectToMapPoint(project)) return false;
    if (!q) return true;
    return [project.title, project.artist_name_raw, project.program, project.theme]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

export function splitBurningManMapPlacements(
  projects: BurningManProject[],
): BurningManMapPlacements {
  const mapped: BurningManMapPoint[] = [];
  const unmapped: BurningManProject[] = [];

  for (const project of projects) {
    const point = projectToMapPoint(project);
    if (point) mapped.push(point);
    else unmapped.push(project);
  }

  return {
    years: Array.from(new Set(projects.map((p) => p.event_year))).sort(
      (a, b) => b - a,
    ),
    mapped,
    unmapped,
  };
}

export function projectToMapPoint(
  project: BurningManProject,
): BurningManMapPoint | null {
  if (
    project.is_location_valid &&
    typeof project.latitude === "number" &&
    typeof project.longitude === "number" &&
    Number.isFinite(project.latitude) &&
    Number.isFinite(project.longitude)
  ) {
    return {
      project,
      lat: project.latitude,
      lng: project.longitude,
      kind: "exact",
    };
  }

  if (
    project.clock_hour &&
    project.clock_minute !== null &&
    typeof project.distance_feet === "number" &&
    project.distance_feet > 0
  ) {
    const { lat, lng } = clockRadiusToLatLng(
      project.clock_hour,
      project.clock_minute,
      project.distance_feet,
      manCenterForYear(project.event_year),
    );
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { project, lat, lng, kind: "approximate" };
    }
  }

  return null;
}

export function deriveBurningManFacets(
  projects: BurningManProject[],
): BurningManFacets {
  const years = Array.from(new Set(projects.map((p) => p.event_year))).sort(
    (a, b) => b - a,
  );
  const themes = unique(projects.map((p) => p.theme));
  const programs = unique(projects.map((p) => p.program));
  const hasMapped = projects.some((p) => !!projectToMapPoint(p));
  const hasUnmapped = projects.some((p) => !projectToMapPoint(p));
  return {
    years,
    themes,
    programs,
    placementStatuses: [
      ...(hasMapped ? (["mapped"] as const) : []),
      ...(hasUnmapped ? (["unmapped"] as const) : []),
    ],
  };
}

export function formatPlacementLabel(
  project: Pick<
    BurningManProject,
    | "location_precision"
    | "location_confidence"
    | "location_string"
    | "is_mobile"
  >,
): string {
  if (project.is_mobile) return "Mobile / roving";
  if (project.location_string) return project.location_string;
  if (project.location_precision === "official_gps") return "Official GPS";
  if (project.location_precision === "unknown") return "Location unknown";
  return project.location_precision.replace(/_/g, " ");
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => !!v && v.trim() !== "")),
  ).sort();
}
