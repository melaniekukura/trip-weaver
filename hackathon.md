# Hackathon log

- **Project:** Trip-Weaver
- **Event:** Convex All Gas Hackathon
- **What it does:** Trip planning with private saved trips, email/password sign-in, a dedicated planner, and Firecrawl-powered flight search with outgoing and return filters.
- **Live app:** not deployed
- **Repo:** private
- **Frontend:** not deployed
- **Convex deployment:** not deployed
- **Components:** @convex-dev/workpool, @convex-dev/rate-limiter
- **Convex features:** schema, tables, indexes, queries, paginated queries, mutations, actions, HTTP actions, scheduled functions, realtime queries
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-09-04T19:25:03Z
- **Last updated:** 2026-09-12T16:33:49Z

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

### 2026-09-12 - 2ffeb13 and development verification
Merged authentication and flight work into `main`; added a dedicated trip-planning page, destination ordering, location selection, and transportation setup (`src/pages/TripPlannerPage.tsx`, `src/TripForm.tsx`, `src/DestinationsEditor.tsx`).
Replaced the initial sights feature with flight-only search: one-way and round-trip options, observed USD fares, source links, and separate outgoing/return time, stop, and price filters (`src/FlightSearchPanel.tsx`, `src/ReturnFlightPicker.tsx`).
Added owned, queued searches with 15-minute caching, request limits, and deletion cleanup using registered Workpool and Rate Limiter components (`convex/flightJobs.ts`, `convex/convex.config.ts`). Firecrawl browser selection retrieves matching returns and displays one combined round-trip price (`convex/returnFlights.ts`).
Verified the paired-flight flow against the local backend and real Firecrawl, including persisted results and cache reuse. Merge checks passed tests, TypeScript lint, and build; browser visual verification remains pending.
Diagnosed a signup hang caused by the frontend pointing at a stopped local backend while Convex selected cloud development. Confirmed cloud health and provided the URL-alignment fix; signup after that change has not been verified.
No public frontend deployment is recorded. Observed fares are not confirmed checkout inventory; itinerary saving of selected flights, broader passenger/cabin support, email verification, and password reset remain follow-ups.
