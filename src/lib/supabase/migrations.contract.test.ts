import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

function readMigrations(): { name: string; sql: string }[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(migrationsDir, name), "utf8"),
    }));
}

describe("SIDEBURNS Supabase migrations (static policy/schema contract)", () => {
  const migrations = readMigrations();
  const combined = migrations.map((m) => m.sql).join("\n");

  it("ships the expected migration files", () => {
    expect(migrations.map((m) => m.name)).toEqual([
      "20260803200000_sideburn_init.sql",
      "20260803200100_sideburn_rls.sql",
      "20260803210000_shared_beacons.sql",
      "20260803211000_shared_beacon_owner_tombstones.sql",
    ]);
  });

  it("creates the smallest syncable tables with timestamps and soft-delete", () => {
    for (const table of [
      "profiles",
      "event_packs",
      "user_sidequests",
      "user_sidequest_progress",
      "user_quest_completions",
      "sync_operation_receipts",
      "shared_beacons",
    ]) {
      expect(combined).toMatch(new RegExp(`create table public\\.${table}`, "i"));
    }

    expect(combined).toMatch(/created_at timestamptz/i);
    expect(combined).toMatch(/updated_at timestamptz/i);
    expect(combined).toMatch(/deleted_at timestamptz/i);
  });

  it("keeps pack catalog separate from user-generated tables", () => {
    expect(combined).toMatch(/create table public\.event_packs/i);
    expect(combined).not.toMatch(/create table public\.pack_sidequests/i);
    expect(combined).toMatch(/Official\/pack sidequests are NOT stored/i);
  });

  it("defines idempotency on client_operation_id and alive progress/completion uniqueness", () => {
    expect(combined).toMatch(/unique \(owner_id, client_operation_id\)/i);
    expect(combined).toMatch(/user_sidequest_progress_owner_sidequest_alive_uidx/i);
    expect(combined).toMatch(/user_quest_completions_owner_sidequest_alive_uidx/i);
    expect(combined).toMatch(/create or replace function public\.apply_sync_operation/i);
  });

  it("enables RLS on every user-data table and event_packs", () => {
    for (const table of [
      "profiles",
      "event_packs",
      "user_sidequests",
      "user_sidequest_progress",
      "user_quest_completions",
      "sync_operation_receipts",
      "shared_beacons",
    ]) {
      expect(combined).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, "i"),
      );
    }
  });

  it("defines owner-scoped mutate policies and public read for published packs only", () => {
    expect(combined).toMatch(/user_sidequests_insert_own/i);
    expect(combined).toMatch(/user_sidequests_update_own/i);
    expect(combined).toMatch(/owner_id = \(select auth\.uid\(\)\)/i);
    expect(combined).toMatch(/event_packs_select_published/i);
    expect(combined).toMatch(/to anon, authenticated/i);
    expect(combined).toMatch(/is_published = true and deleted_at is null/i);
    expect(combined).toMatch(/shared_beacons_select_public/i);
    expect(combined).toMatch(/shared_beacons_(insert|update)_own/i);
  });

  it("does not grant client write policies on event_packs", () => {
    expect(combined).not.toMatch(/policy event_packs_insert/i);
    expect(combined).not.toMatch(/policy event_packs_update/i);
    expect(combined).not.toMatch(/policy event_packs_delete/i);
  });

  it("indexes sync ownership pack and nearby query paths", () => {
    expect(combined).toMatch(/user_sidequests_owner_updated_idx/i);
    expect(combined).toMatch(/user_sidequests_owner_lat_lon_idx/i);
    expect(combined).toMatch(/user_sidequests_pack_id_idx/i);
    expect(combined).toMatch(/sync_operation_receipts_owner_applied_idx/i);
    expect(combined).toMatch(/event_packs_published_updated_idx/i);
  });
});
