# `idfmOpenDataTransfers.ts`

This file resolves the transfers displayed under line-diagram stations from the IDFM Open Data `arrets-lignes` dataset.

The goal is to replace approximate geographic searches with stricter resolution: a station receives the lines serving its stop, or the stops officially connected to it. Production code must not contain rules such as `if the station is X then add Y`.

## Data Flow

1. The line page sends a station list to `/api/transfer-bundles`.
2. The Nuxt backend now uses only the optimized nearby resolution.
3. The active cache lives on the Nuxt server: line stop areas, nearby stop areas by radius, and lines by stop area.
4. `fetchStationTransfersFromArretsLignes()` remains an old reference/test helper, but it is no longer wired into transfer bundles.

## Why Not Search Only by Coordinates?

Radius searches are quick to write but not reliable enough for a line diagram:

- `Liege` may pick up transfers from `Saint-Lazare`, which is geographically close.
- `Maisons-Laffitte` may be confused with `Maisons-Alfort - Alfortville` if token search is too broad.
- Complex hubs such as `Auber`, `Chatelet - Les Halles`, `La Defense`, or `Nanterre Prefecture` need official transfer context, not a spatial guess.

The service rule is therefore: exact first, official compatible names next, and a limited fallback only when no transfer was found.

## Query Plans

For a station `X`, the service builds several possible queries:

- `stop_name = "X"`: the ideal exact, unambiguous case.
- For compound stations with ` - ` or ` / `: exact query on each part, for example `Chatelet` and `Les Halles`.
- `compatibleStopNames`: names supplied by the backend from official Navitia connections. Example: `Auber` may receive `Opera`, `Havre-Caumartin`, `Haussmann Saint-Lazare`, and `Saint-Lazare`.
- Fallback `search(stop_name, "...")`: uses only coherent aliases, not broad token merging.

The fallback stays intentionally conservative. It may accept `Chateau de Vincennes` for `Vincennes`, but it must not accept `Porte de Vincennes` or `Mairie de Vincennes` as a structural transfer for the RER station.

Compatible names also receive a small generic expansion before querying:

- `Gare Saint-Lazare` also searches `Saint-Lazare`, because `Gare` is a descriptive non-geographic prefix here.
- `Havre - Caumartin` also searches `Havre-Caumartin`, because Open Data and Navitia do not always preserve the same spacing around the dash.
- `Gare Saint-Lazare - Havre` may produce `Gare Saint-Lazare`, then `Saint-Lazare`, but only because those parts retain enough distinctive tokens.
- `Gare de Lyon` does not search `Lyon`: prefixes such as `Gare de`, `Gare du`, `Gare des`, and `Gare d'` are kept to avoid massive false positives.

On the backend, `/api/transfer-bundles` completes these names with nearby `stop_area` values only when they remain coherent with official Navitia connections. Coherence is checked with normalized keys and, for large hubs, by sharing at least two distinctive tokens. This allows `Haussmann Saint-Lazare` -> `Saint-Lazare` without accepting a merely nearby station such as `Madeleine`.

Be careful with parentheses: Navitia `stop_area` labels often end with a city, for example `La Defense (Puteaux)`, and that part can be cleaned for display. `stop_point` names from `connections` may contain a real sub-station, for example `La Defense (Grande Arche)`. In that case, parentheses must be kept, otherwise Open Data can no longer find lines 1 and T2.

The backend also retries temporary Navitia calls (`429` and server errors). Without this retry, a short rate limit could be treated as "this stop point has no structural line", creating random omissions in bundles.

## Normalization

The dataset has had several schemas. The code accepts both field families:

- old GTFS style: `route_id`, `route_short_name`, `route_long_name`, `route_type`;
- current IDFM style: `id`, `shortname`, `route_long_name`, `mode`.

Transport families are inferred from `mode`, `route_type`, and `route_long_name`, without a line-name table:

- `Metro` -> `METRO`;
- `RapidTransit` or RER label -> `RER`;
- `LocalTrain` / train -> `TRANSILIEN`;
- `Tramway` / tram -> `TRAM`;
- `Bus` -> `BUS`;
- cable/funicular -> `CABLE`.

## Deduplication and Filtering

Each line is identified by its id when available, otherwise by `family + label`. The current line is removed with:

- its Navitia/IDFM id, for example `line:IDFM:C01742`;
- its label, for example `RER A` or `A`.

Results are then sorted by transport family and label for stable display.

## Important Guardrails

- Do not reintroduce broad searches such as "same first token" or "shared token". They cause false positives such as `Maisons-Laffitte` / `Maisons-Alfort`.
- Do not add transfer tables in production code. If a station must merge with another name, that name must come from an official source or a test fixture.
- Buses can be more ambiguous than metro/RER/tram/train. If a station has a very common name, keep a more conservative or geographically filtered strategy.
- Tests may contain regression expectations, but the algorithm must stay data-driven.

## Quick Debugging

When a transfer is missing:

1. Inspect `/api/transfer-bundles` in Chrome Network.
2. Verify that the bundle reports `transferResolverMode: "nearby"`.
3. Open the `/api/opendata/arrets-lignes/records` calls.
4. Verify that the exact station or a `compatibleStopNames` value returns the expected lines.
5. If the browser shows `403`, `400`, or CORS, the call must not go directly to `data.iledefrance.fr`; it must go through the Nuxt proxy `/api/opendata/arrets-lignes/records`.
6. If a wrong station appears, verify that the fallback does not accept an overly broad alias.

## Regression Tests

- `idfmOpenDataTransfers.test.ts` covers sensitive unit cases: current schema, Open Data host, current-line filtering, `Vincennes`, `La Defense`, `Nanterre Prefecture`, and the `Maisons-Laffitte` false positive.
- `rerAOpenDataTransfers.test.ts` sends every RER A station through the same resolver and verifies minimum expected transfers.
- `rerALiveTransferHydration.test.ts` is a real network test: it fetches RER A stations through Navitia, resolves official compatible names, queries Open Data, and verifies minimum expected transfers for each station.

To add a new critical line, create a similar fixture: every station on the line, the minimum expected lines, then a few known false positives to exclude.
