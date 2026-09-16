# Hackathon log

- **Project:** Trip-Weaver
- **Event:** Convex All Gas Hackathon
- **What it does:** Private multi-city trip planning with Firecrawl flight searches, outgoing and return filters, homebound-leg checks, Google Flights booking options, airline-search backups, and booking-status tracking.
- **Live app:** not deployed
- **Repo:** private
- **Frontend:** not deployed
- **Convex deployment:** not deployed
- **Components:** @convex-dev/workpool (researchPool), @convex-dev/rate-limiter
- **Convex features:** schema, tables, indexes, queries, realtime queries, paginated queries, mutations, actions, HTTP actions, scheduled functions
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-09-04T19:25:03Z
- **Last updated:** 2026-09-16T21:15:41Z

## Log

### 2026-09-04 - 1f0cce0
Added the Convex backend foundation with an empty schema and health query
(`convex/schema.ts`, `convex/health.ts`).

### 2026-09-04 - 226a7dd
Added the React trip-planning landing page and styling (`src/App.tsx`,
`src/styles.css`).

### 2026-09-04 - 18a14ab
Added a flight-search action accepting a source and destination and returning
mock flight results (`convex/flights.ts`).

### 2026-09-04 - e09de8f
Connected the flight-search form to the Convex action and added result states
(`src/App.tsx`, `src/main.tsx`).

### 2026-09-04 - b222503
Added internal Firecrawl search and scrape actions and mocked integration tests
(`convex/firecrawl.ts`, `convex/firecrawl.test.ts`). Live connectivity is not
verified by this log; the flight-search UI still uses mock results.

### 2026-09-07 - working tree
Installed and inspected the official Convex plugin and hackathon build-log skill.
Verified managed Convex AI files are current, including the new `CLAUDE.md`.
Selected `convex.site` (Convex static hosting) for the later build.
Convex plugin and hackathon skills are loaded after restart. MCP responded to
the status check; the local backend is stopped and was not started during setup.
No application build, deployment, publication, or submission was performed.

### 2026-09-10 - a99f86b
Added email/password sign-in and private saved-trip CRUD on `add-authentication-and-saved-trips`; this work is not yet on the local `main` branch.
Trips store destinations, dates, budget, travelers, and interests with ownership checks, pagination, validation, and stale-edit protection (`convex/auth.ts`, `convex/schema.ts`, `convex/trips.ts`, `src/Trips.tsx`).
Gated the app behind login and added a 30-minute inactivity timeout, a two-minute warning, and activity sharing across tabs (`src/App.tsx`, `src/IdleSession.tsx`, `src/idleTimer.ts`).
PR review passed all 46 tests, TypeScript lint, and the production build; earlier live local API checks covered authentication and trip access controls.
User confirmed browser creation, reload persistence, retrieval after signing back in, second-account isolation, and the temporarily shortened timeout. Step one is complete; the original timeout is restored.
Password reset and email verification remain pre-launch follow-ups. No public deployment; Convex static hosting remains planned.

### 2026-09-15 - 837f2a7
Built the dedicated Plan My Trip editor and per-stop transportation cards, with segmented trip controls, independent outgoing/return filters, compact selections, and one combined round-trip total (`src/TripForm.tsx`, `src/TransportationTab.tsx`, `src/ReturnFlightPicker.tsx`); includes work since the previous entry through `2037145` and `837f2a7`.
Connected real Firecrawl searches to Convex research runs and sources, using registered workpool and rate-limiter components, ownership checks, duplicate-job reuse, and a 15-minute result cache (`convex/flightJobs.ts`, `convex/convex.config.ts`).
Persisted selected flights, externally completed booking status, and final-plan confirmation; added direct airline booking-link lookup and fixed rejected refreshes losing selections and stale bookings becoming uneditable (`convex/trips.ts`, `convex/flightPlanFields.ts`, `convex/bookingLinks.ts`). Booking remains external; Trip-Weaver references are not airline confirmation codes.
Added safe failed-step diagnostics, one same-session output-retrieval recovery attempt, reuse of successful returns after failed refreshes, and bounded waits for matching return rows instead of an exact page heading (`convex/firecrawl.ts`, `convex/returnFlights.ts`, `src/FlightSearchError.tsx`).
Verification during development passed 173 tests and frontend/backend type checks. The user verified successful return selection and airline-link retrieval; the latest loading-recovery change passed automated tests and was deployed to dev, but live recovery remains unverified. Browser extraction can still fail; no public frontend deployment is recorded.


### 2026-09-16 - working tree
Added homebound-journey prompts in Destinations and Transportation, route-specific “not needed” acknowledgement, leg removal, per-leg departure dates, and two-flight booking counts for round trips; final confirmation checks homeward coverage on the backend (`src/TripForm.tsx`, `src/TransportationTab.tsx`, `convex/homeJourney.ts`, `convex/trips.ts`).
Improved multi-carrier name matching and ranked return options by shared airlines, then price, while preserving itinerary checks; added outgoing-search recovery and clearer fare diagnostics (`convex/airlineNames.ts`, `convex/returnFlights.ts`, `convex/flightSearch.ts`).
Changed the booking handoff to the selected itinerary’s Google Flights booking-options page, with official airline-search links and available flight numbers as a manual backup. Backup links do not prefill or guarantee the selected fare (`convex/bookingLinks.ts`, `convex/flightSegments.ts`, `src/AirlineBookingLink.tsx`).
Added bounded navigation retries, same-session booking-output recovery, and network diagnostics. Increased the booking-link burst allowance from three to six, retaining ten-per-hour replenishment, and displayed retry timing (`convex/firecrawl.ts`, `convex/flightDiagnostics.ts`, `convex/bookingLinks.ts`).
Verification passed 211 tests and frontend/backend TypeScript checks; backend changes were deployed to personal dev. A live lookup reached a selected itinerary’s Google Flights booking page, but subsequent user attempts exposed unreadable output and the app’s rate limit; the latest recovery changes are automatically tested, with live recovery still unverified.
No public frontend deployment or completed airline purchase was verified. Browser-based extraction remains a reliability limitation; temporary diagnostics were removed. This entry records uncommitted changes after `837f2a7`.
