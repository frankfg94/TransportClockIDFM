# GTFS line geometry

Line geometry is resolved in one readable sequence: installed GTFS indexes,
the public IDFM line-trace dataset, PRIM/Navitia GeoJSON, then historical direct
segments. A provider must cover every requested station edge; partial results
are rejected rather than merged.

## Runtime configuration

- `GTFS_ENABLED`: defaults to `true`; `false` skips only the GTFS provider.
- `GTFS_OUTPUT_DIR`: optional local output directory, `.data/gtfs` by default.

On Cloudflare, bind the read-only R2 bucket as `GTFS_DATA_BUCKET`. Bind a KV
namespace as `LINE_GEOMETRY_CACHE_KV` to persist public-IDFM and Navitia fallback
caches across isolates. Nuxt only reads published GTFS artifacts.

## Update and reset

GTFS publication is deliberately command-driven; only the following commands can write data:

```powershell
npm.cmd run gtfs:update
npm.cmd run gtfs:reset
```

The update command uses the fixed official IDFM URL, conditional `ETag` and
`Last-Modified` headers, then SHA-256 as the final unchanged check. It streams
ZIP extraction and CSV rows, validates required files and coordinate bounds,
builds compact per-line artifacts with monotonic stop projections, publishes an
immutable `gtfs/versions/<sha256>` version, and writes `gtfs/current.json` last.

The 12-hour guard applies to normal updates. A maintainer can use
`npm.cmd run gtfs:update -- --force` only for recovery. Reset only increments
`cacheGeneration`; it keeps the archive and last valid version.

For R2 publication configure `R2_ENDPOINT`, `GTFS_R2_BUCKET`,
`R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Without them, commands write to
the local output directory.

## Security

- Keep the R2 writer credentials outside Nuxt; only the CLI receives them.
- Give Nuxt a read-only `GTFS_DATA_BUCKET` binding.
- Never accept a source URL from a browser or command argument.
- Apply rate limits to the public geometry endpoint if it is exposed directly.

This command-only model removes administrator secrets, cross-origin mutation
rules, background job state, and polling from the web application.
