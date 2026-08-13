import { z } from "zod";

export const supabaseMapRecordRowSchema = z.object({
  id: z.string().min(1), slug: z.string().min(1), title: z.string().min(1),
  description: z.string().nullable().optional(), event_year: z.number().int(),
  latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional(),
  clock_hour: z.number().nullable().optional(), clock_minute: z.number().nullable().optional(), distance_feet: z.number().nonnegative().nullable().optional(),
  location_string: z.string().nullable().optional(), location_confidence: z.number().min(0).max(1).nullable().optional(),
  hero_image_url: z.string().url().nullable().optional(), artist_name_raw: z.string().nullable().optional(),
  /** Remote DTO field from optional public view — not exposed as an Artelier product URL in SIDEBURNS UI. */
  artelier_project_slug: z.string().nullable().optional(),
});
export type SupabaseMapRecordRow = z.infer<typeof supabaseMapRecordRowSchema>;
