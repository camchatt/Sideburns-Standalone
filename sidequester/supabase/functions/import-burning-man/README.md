# Burning Man API importer

This function keeps `BURNING_MAN_API_KEY` out of the browser and mobile app.
It imports official API responses into a protected table; clients read only
the embargo-aware `burning_man_api_public` view.

The public view is not granted to app clients by default. Importing data does
not publish it. The commented launch grant in `burning_man_api.sql` must be run
deliberately when the site is ready.

## Configure

1. Run `sidequester/supabase/burning_man_api.sql` in the Supabase SQL editor.
2. In Supabase **Edge Functions â†’ Secrets**, add:
   - `BURNING_MAN_API_KEY` â€” the key supplied by Burning Man.
   - `BURNING_MAN_IMPORT_SECRET` â€” a separate long random value you create.
3. Deploy `import-burning-man`.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to hosted Edge
Functions by Supabase. Never copy either secret into a `VITE_*` variable.

## Import

Send a server-side/admin POST request to the deployed function:

```json
{
  "year": 2026,
  "types": ["art", "camp", "event", "mv"]
}
```

Include `x-import-secret` with the `BURNING_MAN_IMPORT_SECRET` value. Do not run
that request from the public app or save the header in this repository.

The importer retries HTTP 429 responses with backoff and fetches endpoint types
sequentially. Re-importing a type/year updates matching records by UID and
removes records no longer returned by that official endpoint.

## Release locations

Current and future years are redacted by default; completed historical years
are visible. Enter release timestamps in
`burning_man_release_schedule` only after confirming the official times. Use
`America/Los_Angeles` in SQL so daylight-saving offsets are handled correctly.

Test the public view before release:

```sql
select record_type, event_year, uid, location_released,
       payload ? 'location' as has_location,
       payload ? 'location_string' as has_location_string
from public.burning_man_api_public
where event_year = 2026 and record_type in ('art', 'camp')
limit 20;
```
