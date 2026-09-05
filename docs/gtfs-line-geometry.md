# GTFS line geometry and timetables

Line geometry is resolved in one readable sequence: installed GTFS indexes,
the public IDFM line-trace dataset, PRIM/Navitia GeoJSON, then historical direct
segments. A provider must cover every requested station edge; partial results
are rejected rather than merged.

## Runtime configuration

- `GTFS_ENABLED`: defaults to `true`; `false` skips only the GTFS provider.
- `GTFS_OUTPUT_DIR`: optional local output directory, `.data/gtfs` by default.

On Cloudflare, the read-only R2 binding `GTFS_DATA_BUCKET` is optional and takes
priority when present. Without it, Nitro copies the committed `.data/gtfs`
directory to `dist/_gtfs-data` and the runtime reads those same-version assets
from the deployed application. Bind a KV namespace as `LINE_GEOMETRY_CACHE_KV`
to persist public-IDFM and Navitia fallback caches across isolates.

## Update and reset

GTFS publication is deliberately command-driven; only the following commands can write data:

```powershell
npm.cmd run gtfs:update
npm.cmd run gtfs:reset
npm.cmd run gtfs:update -- --local --keep-source
npm.cmd run gtfs:update -- --local --reindex --keep-source
```

The update command uses the fixed official IDFM URL, conditional `ETag` and
`Last-Modified` headers, then SHA-256 as the final unchanged check. It streams
ZIP extraction and CSV rows, validates required files and coordinate bounds,
builds compact per-line artifacts with monotonic stop projections and a separate
calendar-aware timetable index, publishes their immutable files, and writes
`gtfs/current.json` last. The existing geometry JSON format and
`gtfs/versions/<sha256>` paths are unchanged.

The 12-hour guard applies to normal updates. `--force` bypasses that guard but
retains the conditional HTTP and unchanged-SHA checks. `--reindex` bypasses all
three checks and builds new timetable artifacts. A missing timetable descriptor
or incompatible timetable schema automatically triggers the same migration,
even when the source ZIP has not changed. Existing geometry for the same SHA is
reused and never rebuilt in place. Reset only increments `cacheGeneration` and
preserves the current timetable descriptor.

For R2 publication configure `R2_ENDPOINT`, `GTFS_R2_BUCKET`,
`R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Without them, commands write to
the local output directory.

`--local` explicitly disables both R2 reads and writes, uses the local manifest,
and never deploys anything, even when R2 writer credentials are configured.
It does not itself force a rebuild: add `--reindex` when the installed timetable
is already current. `--keep-source` retains the task-created temporary directory
containing `idfm-gtfs.zip` and `extracted/` on success or failure and logs its
absolute path. This allows inspection or direct indexer retries without another
download. An interrupted download may leave only partial source files. Without
the flag, source files are cleaned up. No source directory is created when the
cooldown stops the command before download.

## Immutable timetable publication

The optional manifest field `timetable` contains the schema version, a relative
path, calendar coverage dates, line/trip/file counts, and total bytes. Each build
gets a new path, including repeated imports of identical source bytes:

```text
current.json
versions/<source-sha>/line-index.json
versions/<source-sha>/lines/<line>.json
timetables/v1/<source-sha>/<unique-run-id>/<line>/index.json
timetables/v1/<source-sha>/<unique-run-id>/<line>/0000.json
```

`timetable.path` is `timetables/v1/<source-sha>/<unique-run-id>`; R2 object keys
add `gtfs/`. Each per-line index describes its stop/service dictionaries and
bounded trip chunks. Timetable consumers and caches must use the descriptor
path, not only the archive SHA. Old geometry-only manifests remain compatible
with geometry readers.

Both indexers finish in staging before any manifest switch. New geometry and
all nested timetable files are uploaded before the R2 manifest; active geometry
for an unchanged SHA is reused without writes. Conditional creation also protects
existing remote geometry objects from overwrite. A failed index build or upload
does not replace either current manifest. Unreferenced immutable artifacts may
remain after an interrupted publication; previous versions are not deleted.

The local manifest is written and flushed to a sibling temporary file and then
atomically renamed over `current.json`. In R2 mode the remote manifest is switched
before this final local rename, so a failed R2 write leaves local current intact.
These are separate storage commits, not a distributed transaction: if the final
local rename fails after remote publication succeeds, R2 has the new complete
version while local current still has the previous version.

## Calendar semantics

Timetables retain `calendar.txt` weekday masks and validity ranges, with additions
(`exception_type=1`) and removals (`exception_type=2`) from `calendar_dates.txt`.
They include all indexed service calendars, independently of the geometry
indexer's non-expired-service selection and representative-pattern limit.
Coverage bounds do not imply that every trip runs on every covered date.

Arrival/departure values are seconds from service-day midnight. Values such as
`25:10:00` remain beyond 86400 seconds, unspecified times remain null, and pickup
and drop-off restrictions are preserved. Date-specific removals affect service
availability without deleting the physical line geometry. The application
server reads these prepared indexes; it never downloads or parses the full ZIP.

## Security

- Keep the R2 writer credentials outside Nuxt; only the CLI receives them.
- Give Nuxt a read-only `GTFS_DATA_BUCKET` binding.
- Never accept a source URL from a browser or command argument.
- Apply rate limits to the public geometry endpoint if it is exposed directly.

This command-only model removes administrator secrets, cross-origin mutation
rules, background job state, and polling from the web application.
