import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const API_ROOT = "https://api.burningman.org/api";
const RECORD_TYPES = ["art", "camp", "event", "mv"] as const;
type RecordType = (typeof RECORD_TYPES)[number];

type ApiRecord = Record<string, unknown> & { uid?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isRecordType(value: string): value is RecordType {
  return RECORD_TYPES.includes(value as RecordType);
}

async function fetchRecords(
  recordType: RecordType,
  year: number,
  apiKey: string,
): Promise<ApiRecord[]> {
  const url = new URL(`${API_ROOT}/${recordType}`);
  url.searchParams.set("year", String(year));

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { "X-API-Key": apiKey, accept: "application/json" },
    });

    if (response.ok) {
      const value: unknown = await response.json();
      if (!Array.isArray(value)) {
        throw new Error(`${recordType} endpoint returned a non-array response`);
      }
      return value as ApiRecord[];
    }

    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter)
        ? Math.max(1, retryAfter) * 1000
        : 1000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `${recordType} endpoint failed (${response.status}): ${detail}`,
    );
  }

  throw new Error(`${recordType} endpoint exceeded retry limit`);
}

export default {
  fetch: withSupabase({ auth: "none" }, async (request, context) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("BURNING_MAN_API_KEY");
  const importSecret = Deno.env.get("BURNING_MAN_IMPORT_SECRET");
  const suppliedSecret = request.headers.get("x-import-secret");

  if (!apiKey || !importSecret) {
    return json({ error: "Importer secrets are not fully configured" }, 500);
  }
  if (!suppliedSecret || suppliedSecret !== importSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let input: { year?: unknown; types?: unknown };
  try {
    input = await request.json();
  } catch {
    return json({ error: "Request body must be JSON" }, 400);
  }

  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 2009 || year > 2100) {
    return json({ error: "year must be an integer between 2009 and 2100" }, 400);
  }

  const requestedTypes = input.types === undefined ? RECORD_TYPES : input.types;
  if (
    !Array.isArray(requestedTypes) ||
    requestedTypes.length === 0 ||
    !requestedTypes.every((value) => typeof value === "string" && isRecordType(value))
  ) {
    return json({ error: `types must contain: ${RECORD_TYPES.join(", ")}` }, 400);
  }

  const types = [...new Set(requestedTypes)] as RecordType[];
  const supabase = context.supabaseAdmin;
  const retrievedAt = new Date().toISOString();
  const imported: Partial<Record<RecordType, number>> = {};

  try {
    // Fetch sequentially to be conservative with the upstream rate limit.
    for (const recordType of types) {
      const records = await fetchRecords(recordType, year, apiKey);
      const rows = records.map((payload) => {
        const uid = typeof payload.uid === "string" ? payload.uid : "";
        if (!uid) throw new Error(`${recordType} record is missing uid`);
        return {
          record_type: recordType,
          event_year: year,
          uid,
          payload,
          source_retrieved_at: retrievedAt,
          updated_at: retrievedAt,
        };
      });

      if (rows.length > 0) {
        const { error } = await supabase
          .from("burning_man_api_records")
          .upsert(rows, { onConflict: "record_type,event_year,uid" });
        if (error) throw error;
      }

      // Mirror the official endpoint rather than retaining records that the
      // upstream source removed. Scope is locked to one type and year.
      const { data: existing, error: existingError } = await supabase
        .from("burning_man_api_records")
        .select("uid")
        .eq("record_type", recordType)
        .eq("event_year", year);
      if (existingError) throw existingError;

      const receivedUids = new Set(rows.map((row) => row.uid));
      const staleUids = (existing ?? [])
        .map((row) => row.uid as string)
        .filter((uid) => !receivedUids.has(uid));
      for (let offset = 0; offset < staleUids.length; offset += 100) {
        const { error: deleteError } = await supabase
          .from("burning_man_api_records")
          .delete()
          .eq("record_type", recordType)
          .eq("event_year", year)
          .in("uid", staleUids.slice(offset, offset + 100));
        if (deleteError) throw deleteError;
      }
      imported[recordType] = rows.length;
    }

    return json({ ok: true, year, imported, retrieved_at: retrievedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return json({ error: message }, 502);
  }
  }),
};
