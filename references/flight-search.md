# Flight search prototype

Each saved trip has a **Find flights** panel. Choose one-way or round trip,
three-letter airport codes, and dates within 330 days. The prototype uses one
adult, economy including basic fares, and USD. These settings are explicit rather
than inherited from a trip's traveler count or currency.

## Demo and paired flights

1. Run `npx convex dev` and `npm run dev`; sign in and open a saved trip.
2. Click **Find flights** and choose the route, trip type, and dates.
3. Set outgoing time, stop, and price filters before or after **Search flights**.
4. For round trips, click **Choose outgoing** on a result. The selected outgoing
   flight stays visible above its return options.
5. Set separate **Return flight filters**, then **Find matching return flights**.
   This makes a Firecrawl browser request and can spend more credits than a scrape.
6. Click **Select return** to see both legs and one observed combined total.
7. Use **Review return options in Google Flights** to confirm the booking details.
   The link retains the outgoing selection; select the desired return there.

Initial searches usually take 30–70 seconds. The initial page only provides
outbound listings and starting round-trip prices. A return search opens that
same Google Flights search in a short-lived Firecrawl browser, matches the
selected outgoing flight, selects it with the keyboard, and extracts matching
return listings. The session is closed after the request and also has a fixed TTL.
The app never books or purchases flights.

## Filters and price meaning

Outgoing and return filters are independent. Both support departure/arrival
hour ranges, nonstop/exactly one stop/two or more stops, and maximum USD price.
Bounds are inclusive. A range such as 10 PM–6 AM spans midnight; equal start/end
hours select that exact minute. Times use each airport's clock, including
next-day arrivals. Clear filters restores all retrieved options for that leg.

Outgoing round-trip cards show the provider's starting round-trip fare. Return
cards show the observed combined fare for that return plus the chosen outgoing
flight. The summary uses that combined amount directly; it never adds the two
card prices together. Return filters apply only to the return leg and its combined
price. Changing outgoing filters can hide a selected outgoing flight and its
return picker until it matches again. Selections are local UI state; retrieved
options persist on the trip, but itinerary saving remains separate work.

Filters operate on at most five retrieved listings per search, without another
paid request. No matches means none of this sample matched, not that no matching
flights exist. The lists are in source order, not a guaranteed cheapest ranking.

## Backend API and safety

- `flightJobs:start({ tripId, flight, outboundSourceId?, refresh? })` queues a job.
- `flightJobs:latest({ tripId, flight, outboundSourceId? })` reads `{ run, sources }`.
- `flight` contains origin, destination, departureDate, optional tripType, and
  required returnDate when tripType is `round-trip`.
- An outboundSourceId starts/reads matching returns; omitting it searches outbound
  options. The server checks the caller owns the trip and the selected source
  belongs to a completed matching outbound search. Return results cannot be used
  as another outbound selection.
- Initial scraping validates route, dates, trip type, passenger count, cabin,
  currency, and complete listing blocks. Return parsing verifies the selected
  outgoing flight, reversed airports, return date, and explicit round-trip totals.
  Changed or ambiguous page content fails closed; no mock prices are substituted.
- Browser code is constructed server-side from the stored flight. Clients cannot
  submit arbitrary URLs, selectors, browser code, or outgoing flight details.
- FIRECRAWL_API_KEY stays in the Convex deployment environment. Raw provider
  errors and browser session credentials are not returned to the client.

## Persistence, cache, and limits

The existing `researchRuns` and `researchSources` tables now serve flights only.
Runs store the request, source reference for return searches, owner, trip, status,
and timestamps. Sources store flight details, source URL, and retrieval time.
The optional outboundSourceId preserves existing saved searches.

The workpool runs at most two jobs concurrently with no automatic paid retries.
Duplicate active searches share one job; completed results cache for 15 minutes.
Return cache identity includes the selected outgoing source and both dates.
Refresh bypasses completed-result caching. User limit: 10 new jobs/hour, burst 3.
Global limit: 100/hour, burst 10. Both legs consume the same job limits, although
browser credit costs depend on execution time. Deleting a trip cancels its jobs
and removes its sources in bounded batches.

## Verification and remaining work

Run `npm test`, `npm run lint`, and `npm run build`. Tests cover observed one-way,
round-trip, and return-page fixtures; mismatched dates/routes/selections; ownership;
cache separation; queue completion; cleanup; and time/stop/price filter boundaries.
A frontend render regression verifies controls are visible before results load.

An authenticated local backend check passed for DTW–LAX, October 15–22, 2026:
outgoing search, real Firecrawl browser return search, five stored return options,
cache reuse, and temporary trip cleanup. Live Firecrawl probes also verified selecting
an outgoing flight and reading matched return options. Mouse clicks encountered
Google's overlapping flight-row elements; keyboard activation worked. Browser
layout changes can still break extraction; this is a prototype, not verified
checkout inventory. Multi-passenger/cabin/currency support, complete flight
coverage, and saving a selected pair into the itinerary remain future work.
