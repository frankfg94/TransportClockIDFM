# Verdict: property market data

The existing block is descriptive. Its prices, price changes, sales counts and
estimated yield do not enter any Verdict category or score. A higher price or
increase is not a positive qualification. `verdictMarketFacts.ts` defines this
rule and the history calculation; the UI, PDF and data diagnostics state it.

## Data audit

The deployed checkout's `public/data/dvf/v1/manifest.json` identifies the DGFiP /
Etalab geolocated DVF release dated 2026-07-17, compiled 2026-09-28, covering
2021–2025 in Île-de-France. The provider reads the manifest, the corresponding
city shard, and the separately compiled `rent-indicators.json`; the map shards
and the optional individual purchase-sales files are not used by this block.

* The compiler groups rows by municipality and mutation, accepts sales,
  future-completion sales and auctions with residential surfaces, deduplicates
  property rows, sums surface, and filters surface to 9–2,000 m² and transaction
  price per m² to €500–100,000. Mixed properties in a mutation share one total
  price; the price per m² is not attributable to one property type. City
  medians/counts include eligible non-geolocated sales; IRIS figures require a
  matched geolocation. The minimum published sample is five sales per aggregate
  and annual point. Small published samples and changes in the mix, including
  new builds, can make a median volatile; these are not repeat-sales indices.
* IRIS and city medians are medians of transaction prices per m². The nearby and
  remaining-IRIS figures are weighted medians of the published 250 m cell
  medians, weighted by cell counts. Only cells whose centers fall in the stated
  radius are included; suppressed cells and unmatched locations are absent.
  These approximations are not the median of all individual sales in a circle.
  An IRIS code ending in `0000` represents an undivided municipality; the
  Verdict presents the municipal figures once rather than comparing them to
  the same territory under a neighborhood label.
* Annual city and IRIS series contain eligible transaction medians and counts.
  Three elapsed years require four annual points. Five vintages require all five annual points through the last year of the
  pack, each meeting the publication threshold; 2021–2025 spans four elapsed
  years. A strict ten-year comparison requires eleven annual points. Missing
  points are unavailable, not zero; volume changes are observed counts, not
  liquidity, market time or a forecast. A pack whose last year is more than two
  calendar years old is marked stale, while retaining its dated information.
* The ANIL 2025-T3 file is a modelled asking rent including charges for an
  unfurnished reference apartment, at municipality level (the prediction may
  use a wider model mesh). It is not an observed median rent. The existing
  indicative gross yield divides 12 times that rent by the selected DVF price;
  the price can be all residential types and a different geographic scale.
  Costs, vacancy and taxes are not deducted.

## Coverage limitations and refresh

No published city/IRIS shard contains transaction medians or counts split by
house versus apartment, quartiles, a ten-year series, time on market, or
purchase/rental pressure. Purchase-sales files are a different detailed product:
they do not safely allocate a mixed mutation's total price to each property.
Therefore the block reports those segment prices and unavailable horizons as
unavailable instead of fabricating values. Supporting property types requires
extending the owning backend compiler with a conservative single-type mutation
policy, optional version-compatible aggregates and fixture validation, then
regenerating and publishing DVF city shards and the manifest. The backend is a
separate checkout and was not modified here. Extending the history requires a
source release containing the corresponding older vintages and a refreshed
compiled pack; the current five-vintage pack cannot support ten years.
