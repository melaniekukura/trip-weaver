# Flight research prototype

Each saved trip has a **Find flights** panel. Enter three-letter origin and
arrival airport codes and a departure date within 330 days. The prototype searches
one-way economy including basic fares, one adult, in USD. These settings are shown
explicitly and do not inherit a trip's traveler count or currency.

Firecrawl scrapes the matching Google Flights search page with caching disabled.
The parser verifies the observed date, airport route, one-way/economy context,
adult count, and currency before saving up to five complete listing blocks in
source order. Missing or changed page formats produce an unavailable error, never
mock fares. Prices are observed listings; checkout availability is not verified.

## Public API

```ts
const request = {
  tripId,
  flight: { origin: "DTW", destination: "LAX", departureDate: "2026-10-15" },
};
// Both operations check ownership of the saved trip.
await start({ ...request, refresh: false }); // { runId, reused }
// useQuery(api.flightJobs.latest, request) returns null or { run, sources }.
```

The normalized flight request determines the destination and cache key. Airport
codes are syntactically validated; the observed page must match them. Only route,
date, and the fixed search settings are sent to Firecrawl/Google, not account data.


## Persistence and limits

- Runs store the flight request, source URL, owner, trip, status, and timestamps.
- Sources store airline, departure/arrival labels in airport-local time, duration,
  stops, observed amount/currency, source URL, and retrieval time.
- Background workpool: at most two actions concurrently; no paid automatic retry.
- Duplicate active requests share a job; completed flight searches cache for
  15 minutes. Refresh bypasses that cache.
- User limit: 10 new searches/hour, burst 3. Global: 100/hour, burst 10.
- Authorization and validation run before spending credits. Failures are sanitized.
- Deleting a trip cancels jobs and removes its research in bounded batches.

## Demo

1. Run `npx convex dev` and `npm run dev`; sign in and create/open a saved trip.
2. Click **Find flights**, enter `DTW`, `LAX`, and a future departure date.
3. Click **Search flights**. A fresh search usually takes 30–70 seconds and uses
   Firecrawl credits from the backend's `FIRECRAWL_API_KEY`.
4. Compare the observed fares with **Open this search in Google Flights**.
5. Use **Refresh prices** for another fresh request. Repeating the same search
   within 15 minutes reuses its saved result. Reopening the panel requires entering
   the same route/date and searching again to retrieve that cached result.

The previous mock flight form has been removed from the page.

## Validation and limitations

`npm test` covers the parser with an excerpt of the observed Google Flights page,
wrong routes/dates/currency/settings, missing prices, real workpool execution with
mocked Firecrawl, authorization, cache expiry, request limits, and failure cleanup.
Run `npm run lint` and `npm run build` as well.

A direct Firecrawl probe succeeded for DTW → LAX on October 15, 2026, using one
credit. A second live check through the authenticated local Convex API and real
workpool also passed: five fares saved, repeat search reused the cache, and the
temporary trip was deleted. Browser visual verification was unavailable.
This does not establish reliability for every route or future page layout.
The parser deliberately rejects unrecognized layouts. There is no guaranteed
cheapest-fare ranking, booking, round-trip support, or itinerary-save operation.

For the itinerary handoff, accept a research source ID, verify the caller owns its
parent trip and the target trip, and copy the flight fields and provenance into
the itinerary item so later research cleanup does not erase attribution.
