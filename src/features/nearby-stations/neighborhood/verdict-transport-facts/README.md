# Verdict transport facts

`index.ts` assembles the transport category in the established fact order.
Each family owns its rules, fact labels/metadata and helper calculations:

| File | Responsibility |
| --- | --- |
| `gpeExpress.ts` | Future GPE/current-line hubs, eligibility and duplicate-line coverage |
| `heavyTransports.ts` | Access to heavy lines, walking/bus alternatives and contribution weights |
| `lineRegularity.ts` | Observed line reliability and its evidence |
| `passengerSatisfaction.ts` | Published passenger perception, coverage and eligibility for the shared quality weight |
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

## Passenger satisfaction

The [PRIM annual export](https://prim.iledefrance-mobilites.fr/fr/jeux-de-donnees/indicateurs-de-perception-qs)
publishes the *Indicateur Global de Perception* for contract scopes and lines.
The checked export contains 58 records for 2024 and 56 for 2025, including line
groups and entire bus scopes. It is distributed under Etalab Open Licence 2.0.
It includes the survey year, `id_line`, commercial label, mode, operator, DSP
and the indicator result as a percentage. It publishes no sample sizes per line.
The [2025 annual IDFM balance](https://presse.iledefrance-mobilites.fr/reseau-ferre-francilien-des-resultats-en-hausse-en-2025/?lang=fr)
documents regular passenger interviews conducted face to face and a multi-topic
metric that includes perceived punctuality. The publisher mentions over 150,000
interviews each year across the survey, without a line-level breakdown.

The [S1 2026 surveys](https://www.iledefrance-mobilites.fr/decouvrir/enquete-voyageur-perception-transports-en-commun)
give the share satisfied or very satisfied among travellers using the surveyed line
at least weekly. Their reports cover the RATP rail modes (26,742 respondents) and
SNCF rail (34,832 respondents). Those are survey-wide counts for that semester.
The two reports provide line labels and operator scopes, without IDFM IDs or an
explicit data-reuse licence. The separate [Ipsos BVA image survey](https://www.ipsos.com/sites/default/files/ct/news/documents/2025-11/ipsos-bva-idfm-franciliens-transports-commun-rapport-complet.pdf)
interviewed 2,000 Franciliens in 2025. It publishes mode-level satisfaction on
each mode's users and provides no line breakdown, IDFM line IDs or explicit
data-reuse licence. The Verdict uses the annual PRIM export for its values.

Join by the commercial ID in the [IDFM line reference](https://prim.iledefrance-mobilites.fr/fr/jeux-de-donnees/referentiel-des-lignes)
(ODbL), with exact mode and corroborating commercial code from the existing
Verdict network. For example, the checked 2025 export describes `C01738` as N
and `C01736` as K, while the line reference identifies them as K and N respectively.
Both associations are rejected. RER A and B publish separate SNCF and RATP values
under the same commercial ID. Those rows are attributed by operator and excluded
from scoring. Grouped results such as 3/3bis, 7/7bis and bus contract averages
are excluded from line attribution. The diagnostic reports the coverage of the
Verdict's accessible current heavy lines, including those without a result.

The rule uses the most recent annual observation per line and published scope.
For a score, every accessible line must have a single result from the same mode,
operator and survey year in the last two completed calendar years, with RATP or
SNCF coverage outside a DSP. The average weights each line equally. The common
score help reads the thresholds and available weight from the scoring rules.
An eligible survey takes the existing quality share because its composite already
includes perceived regularity. Observed regularity remains independently visible.

## Reference journey preview

The optional WebGL2 preview displays Châtelet, major stations and employment hubs.
Browser probes share one GTFS origin scan and publish each destination as soon
as its own walks and platform arrivals resolve. Reference walks have reserved
capacity while the worker processes other stations. The completed list stays
on screen and each destination offers its calculated alternatives.

The preview draws documented street paths and clips the map's static regional
line geometry between the stops. The map source shares the core layer across
addresses and loads the bus layer when a displayed itinerary needs it. Missing
segments retain their known stop markers. The graphics preference defaults off.
Reduced motion draws only on updates. The destination list remains usable
during a context loss and the canvas redraws when WebGL2 is restored.
