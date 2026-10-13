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
| `lastServices.ts` | Early last departures |
| `transportDiversity.ts` | Diversity of accessible lines and modes |

Shared preparation is in `context.ts`; score weights and aggregation are in
`scoring.ts`. `benchmarkDestinations.ts` resolves the official station references
for the named destinations; `benchmarkJourneys.ts` prepares their loading and
missing states. `benchmarks.ts` combines major-station and employment-hub facts.

The former `criteria/transport/*` and `transportAccess.ts` paths remain thin
re-exports for their existing callers. Implement new transport fact rules here.
The asynchronous providers, caches and GTFS worker scheduling stay in their
existing services/composables; these modules create facts from their results.
