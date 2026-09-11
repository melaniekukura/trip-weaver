# Frontend flight integration

The Transportation tab uses `flightJobs:start` and subscribes to
`flightJobs:latest`. Turning on Find my flight validates and saves the trip
before requesting research. Repeated searches reuse the same saved trip;
subsequent edits use the saved version for optimistic concurrency checks.
Closing the modal after starting a search does not delete the saved trip or
cancel the backend job. New trip forms explain this behavior.

Results show up to three valid fares sorted by USD amount from the listings
returned by the backend, not a claim to the cheapest flights on the market.
The backend currently returns at most five listings. Searches are one-way,
one adult, economy, and do not apply accessibility or interest preferences.
Progress, rate-limit errors, provider errors, cache reuse, and refresh are
shown in the UI. Route or date changes hide results for the previous route.

Home's search bar opens the trip modal with the route and departure date filled
in. It no longer calls the old mock flight endpoint. Saved trip cards also
use the shared ranked flight-results component.

## Live city and airport lookup

The picker calls the public HTTPS Aviasales autocomplete endpoint directly
from the browser. It requires no secret, and browser CORS access was verified.
Queries use a 300 ms debounce, a 10 second timeout, abort stale requests, and
cache up to 50 queries for five minutes. There is no bundled destination list
or invented fallback result. Provider failures show a retry control.

Provider contract:
https://support.travelpayouts.com/hc/en-us/articles/360002322572-Autocomplete-API-for-countries-cities-and-airports-by-Aviasales

City values include country and metro code to distinguish same-name cities.
Airport labels retain the airport code in parentheses. Both remain strings
compatible with the existing trip schema; older saved labels still load.

City selections carry their metro code and city scope to the backend. The worker
loads the live Aviasales airport directory, includes every flightable airport
with that city code, and excludes railway stations and inactive entries. Google
Flights receives the metro code directly; adding “all airports” to its natural
language query was rejected in a live check. The parser accepts only flights
within the resolved city airport sets and stores the actual airports on each
listing. Airport selections remain restricted to that one airport.

Both request scopes participate in the versioned cache key. The worker ranks
all verified page listings before retaining five; the frontend shows the three
lowest returned fares. A city lookup failure becomes an actionable failed
search before Firecrawl is called. The result UI shows the included airport
codes. Legacy city labels without metro codes need to be reselected once from
the live picker.

Airport directory: https://api.travelpayouts.com/data/en/airports.json

## Verification

Unit tests cover provider parsing, live-request encoding and caching, failures,
selection-to-airport conversion, date validation, destination ordering, and
price ranking. The development deployment exposes the expected public start
and latest signatures. A live autocomplete request returned city and airport
options with browser-compatible headers. A live Firecrawl scrape of LON → NYC on October 15, 2026 returned
LGW/LHR departures and JFK/EWR arrivals. The parser successfully ranked that
page; a small normalized excerpt is retained in
`convex/fixtures/google-flights-city.txt` for regression tests.
