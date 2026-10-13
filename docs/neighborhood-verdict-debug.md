# Verdict transport diagnostics

Append `debugVerdict=1` to a verdict URL to expose public page results and a
second panel, `data-testid="verdict-debug-timeline"`, with a common timeline.
The two JSON panels are collapsible and initially closed; their full DOM text
remains available for snapshots without expanding a multi-megabyte AX tree.
No credentials, server configuration or additional diagnostic HTTP requests
are exposed. Normal pages do not record this history.

## Common clock

All starts and finishes are milliseconds since navigation, including the page
bootstrap. Each task records `system`, `task`, `startMs`, `endMs`, `durationMs`
and `status` (`running`, `ready`, `error`, `cancelled`). System summaries show
their earliest start, latest finish and counts of pending/completed tasks.
Overlapping intervals demonstrate concurrency; an unfinished task has no end.
Cancelled work is retained in the debug history, never counted as successful.
When an active worker releases cancelled work, its entry is annotated with
`workerReleased`, the actual worker end, queue/execution duration and steps.
The subscriber cancellation time/status stay unchanged; queued work skipped
before execution does not have worker execution steps.

Systems cover the station catalogue, GPE catalogue, heavy-station resolution,
individual heavy journey/walking probes, major stations, employment hubs,
Noctilien, frequencies, last departures, documentary sources and service quality.
Worker tasks also include queue delay, execution duration, destination count,
asset reads, connection scans, walking pairs requested/reused and per-asset and
per-matrix start/end times. Matrices distinguish verified and estimated walks.
They also retain providers, street dataset versions, fallback reasons and the
affected coordinates. `heavy-targets` records each station/line eligibility
decision; GTFS worker diagnostics list boarding stops excluded for unverified
walking, including their bus codes.

## Data integrity and local/production parity

`transportIntegrity` distinguishes `loading`, `complete` and `degraded`, with
missing benchmarks, estimated walks and excluded accesses listed explicitly.
Without a reference snapshot the page displays **parity not verified**, even
when all tasks completed. A fallback is not proof of data completeness.

Paste the other environment's full first-panel JSON in the debug reference
field. `transportComparison` compares the transport category, all heavy
candidates, every benchmark/night journey, frequencies, last services, line
targets, future projects and service quality. It retains travel durations,
departure times and provider dataset versions; only observation clocks are
excluded. Differences and missing/additional fact IDs are included, and a
visible alert reports a mismatch. The reference is parsed once per edit,
and comparison waits for the current transport calculation to settle.

`performance.transportSettledMs` waits for every transport task, heavy resolver,
station catalogue, service quality and GPE target readiness. It includes
follow-up frequencies selected after the heavy candidates arrive. It means
settled, not necessarily successful: inspect errors and route coverage too.
`pageSettledMs` includes the other categories. These times reset when a refresh
starts; save the panel before the existing five-minute periodic refresh.
`firstTransportSettledMs` and `firstPageSettledMs` retain the first completion
across those later refreshes. They also mean settled, not error-free.

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
external infrastructure. Do not run builds/typechecks while measuring. Measure
one address for isolated latency; when testing several addresses concurrently,
record the number of tabs and the shared CPU/network load. Preserve raw results,
statuses and walking sources
as well as the duration: a quick fallback or error is not a successful speedup.

## Scheduling and retained data

Three daytime transport batches, one night-time batch and one other-category
batch can overlap HTTP waits
inside the route worker. Timetables retain their separate single-slot worker.
All destinations, candidate stations, alternatives, walking verification,
calendars and search limits remain unchanged. The only removed probes are
temporary centroid requests superseded by the catalogue that was still loading.
No address-specific result cache, coordinates table or precomputed verdict is
used by this scheduling policy.

Data loading and score recomputation use coalesced microtasks rather than
animation frames, so inactive tabs do not depend on a display frame. The first
bounded connection batch starts while origin walking loads; subsequent batches
retain the existing backpressure. Cancelled subscribers stop before destination
matrices after joining a shared tree, without cancelling a live subscriber's
tree or changing its search limits. Frequency topology and timetable reads run
in parallel within the existing single timetable slot. Documentary GPE and park
walks start together and retain their original candidate order.

The `night-transport` scheduling purpose reserves its own slot without changing
the routing engine, destinations, calendars, walking budgets or two-tree limit.
It is assigned by the Noctilien probe, not inferred from an address or hour.
The asset reader negotiates encoded directory paths on HTTP 404: Cloudflare
and Nitro expose the same timetable files using different URL conventions.
An unrelated HTTP failure remains an error. Server IRIS lookups reuse bounds
for the immutable dataset, then apply the original exact polygon predicate to
every possible match; no point-specific match result is cached.

The global dataset status preloader runs only for the explicit `/api/datasets`
diagnostic. Pages, assets and other APIs load their own required sources without
awaiting unrelated GTFS/NeTEx/ridership status reads.
