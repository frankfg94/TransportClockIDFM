# Verdict transport diagnostics

Append `debugVerdict=1` to a verdict URL to expose public page results and a
second panel, `data-testid="verdict-debug-timeline"`, with a common timeline.
No credentials, server configuration or additional diagnostic HTTP requests
are exposed. Normal pages do not record this history.

## Common clock

All starts and finishes are milliseconds since navigation, including the page
bootstrap. Each task records `system`, `task`, `startMs`, `endMs`, `durationMs`
and `status` (`running`, `ready`, `error`, `cancelled`). System summaries show
their earliest start, latest finish and counts of pending/completed tasks.
Overlapping intervals demonstrate concurrency; an unfinished task has no end.
Cancelled work is retained in the debug history, never counted as successful.

Systems cover the station catalogue, GPE catalogue, heavy-station resolution,
individual heavy journey/walking probes, major stations, employment hubs,
Noctilien, frequencies, last departures, documentary sources and service quality.
Worker tasks also include queue delay, execution duration, destination count,
asset reads, connection scans, walking pairs requested/reused and per-asset and
per-matrix start/end times. Matrices distinguish verified and estimated walks.

`performance.transportSettledMs` waits for every transport task, heavy resolver,
station catalogue, service quality and GPE target readiness. It includes
follow-up frequencies selected after the heavy candidates arrive. It means
settled, not necessarily successful: inspect errors and route coverage too.
`pageSettledMs` includes the other categories. These times reset when a refresh
starts; save the panel before the existing five-minute periodic refresh.

## Measuring a client cold start

Use `debugVerdict=1&debugTiming=1&debugCold=1`, then navigate or reload fully.
`debugTiming` avoids serializing the large result panel during loading; the
timeline remains available throughout and full results appear when settled.
`debugCold` ignores GTFS CacheStorage/HTTP cache, persisted walking results and
the handoff score snapshot. It does not delete or replace the user's caches.
Workers and computed route trees begin empty on navigation; in-flight reads
and day/night stop pairs may share work within that same load for any address.

Server/provider caches, public CDN assets, quotas and shared rate gates are not
reset. Report this scope explicitly; it is not a cold restart of the complete
external infrastructure. Do not run builds/typechecks or simultaneous address
benchmarks while measuring. Preserve raw results, statuses and walking sources
as well as the duration: a quick fallback or error is not a successful speedup.

## Scheduling and retained data

Three transport batches and one other-category batch can overlap HTTP waits
inside the route worker. Timetables retain their separate single-slot worker.
All destinations, candidate stations, alternatives, walking verification,
calendars and search limits remain unchanged. The only removed probes are
temporary centroid requests superseded by the catalogue that was still loading.
No address-specific result cache, coordinates table or precomputed verdict is
used by this scheduling policy.
