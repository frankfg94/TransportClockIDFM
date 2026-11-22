# AUTO Dashboard

AUTO is a transient Home view. It leaves manual preferences untouched and keeps
the last manual place ID in session storage; positions, routes, and generated
boards are held in memory only. AUTO also bypasses the shared server walking
cache; its position is sent to the walking provider to calculate the routes.
If location access is already granted, selecting AUTO loads the position
automatically. Otherwise, AUTO shows an explicit button that calls
`useUserGeolocation` from a user action so the browser can present its permission
prompt; the composable stops its watch when hidden or unmounted.

The existing spatial catalogue is queried within 1,500 m. At most 64 physical
stops (previously displayed stops first, then nearest) are sent to the walking
matrix. Bus (including Noctilien), tram, and RER lines are tested independently against inclusive
300/600/900 second limits. If the walking provider is unavailable, its existing
straight-line estimate participates in the same decision and is labelled as an
estimate. A bounded scan may omit otherwise eligible stops in dense areas.
Results are ordered by walking time and stable stop/line identity, capped at 12
cards. The visible distance is always the live straight-line distance; the
walking time is based on the most recent scan.

Positions older than 60 seconds or with accuracy worse than 100 m are not used.
A new scan needs a displacement of at least 30 m (or the reported accuracy,
capped at 100 m), and starts at most once per 30 seconds. A threshold crossing
requires two successful observations at least 30 seconds apart, including a
scheduled confirmation if the OS emits no new fix; unavailable routes do not
count as a crossing. The first scan is displayed immediately. An abort signal and a
generation number discard results after a newer movement, hiding, or unmount.
Walking responses are cached in memory for one minute, up to four origins;
direction discovery is cached in memory and limited to three concurrent calls.
Departure refreshes run at most three at a time, once per minute, while visible.
