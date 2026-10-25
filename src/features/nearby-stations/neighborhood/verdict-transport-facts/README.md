# Verdict transport facts

`index.ts` assembles the transport category in the established fact order.
Each family owns its rules, fact labels/metadata and helper calculations:

| File | Responsibility |
| --- | --- |
| `gpeExpress.ts` | Future GPE/current-line hubs, eligibility and duplicate-line coverage |
| `heavyTransports.ts` | Access to heavy lines, walking/bus alternatives and contribution weights |
| `lineRegularity.ts` | Observed line reliability and its evidence |
| `largeStations.ts` | Major-station travel-time facts |
| `employmentHubs.ts` | Employment-hub travel-time references |
| `chatelet.ts` | Châtelet access, duration thresholds and direct journeys |
| `noctilien.ts` | Night lines, walking access and directions |
| `frequencies.ts` | Peak frequency facts and remote-line context |
| `lastServices.ts` | Theoretical service endings, unavailable observations and early-departure alerts |
| `transportDiversity.ts` | Diversity of accessible lines and modes, with the exact counted line list |

Shared preparation is in `context.ts`; score weights and aggregation are in
`scoring.ts`. `benchmarkDestinations.ts` resolves the official station references
for the named destinations; `benchmarkJourneys.ts` prepares their loading and
missing states. `benchmarks.ts` combines major-station and employment-hub facts.

The former `criteria/transport/*` and `transportAccess.ts` paths remain thin
re-exports for their existing callers. Implement new transport fact rules here.
The asynchronous providers, caches and GTFS worker scheduling stay in their
existing services/composables; these modules create facts from their results.

Personal journeys use `../personalJourneyPreferences.ts` for the persisted
per-destination thresholds and `../personalJourneys.ts` for facts and scoring.
`useVerdictPersonalJourneys.ts` reads the shared address book, resolves real
GTFS journeys, and exposes independent directory/configuration/commute/route
states. It never falls back to PRIM. The automatic commute starts at the saved
primary address; selecting the workplace again edits that same criterion.
Destinations with identical coordinates are deduplicated. Removing an automatic
commute saves an exclusion until the destination is explicitly added again.

The established transport score and each available personal criterion have
equal weight. Personal criteria contribute 10 (below the positive threshold),
5 (through the neutral threshold, inclusive), or 0 (above it). Missing or failed
journeys do not contribute. The duration uses the common journey timing contract
with only the initial waiting time removed; labels are rounded up to minutes.
Personal facts remain in the final results/PDF even when other facts are selected.
