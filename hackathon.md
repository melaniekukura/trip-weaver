# Hackathon log

- **Project:** Trip-Weaver
- **Event:** Convex All Gas Hackathon
- **What it does:** Private multi-city trip planning with Firecrawl flight searches, booking-status tracking, and interest-based discovery of restaurants, activities, and events, brought together in a unified day-by-day itinerary.
- **Live app:** not deployed
- **Repo:** private
- **Frontend:** not deployed
- **Convex deployment:** not deployed
- **Components:** @convex-dev/workpool (researchPool), @convex-dev/rate-limiter
- **Convex features:** schema, tables, indexes, queries, realtime queries, paginated queries, mutations, actions, HTTP actions, scheduled functions
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-09-04T19:25:03Z
- **Last updated:** 2026-09-17T22:03:09Z

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

### 2026-09-16 - 2981837
Added destination- and interest-based discovery to Plan My Trip, with individual interest entry, removable colored pills, a Find dropdown populated from those interests, and saved ideas. Searches save current trip details first and include both activities and events (`src/InterestsEditor.tsx`, `src/InterestDiscovery.tsx`, `src/TripForm.tsx`).
Added owned search runs and favorites with realtime results, six-hour reuse of successful matching searches, explicit refresh, request limits, and trip-deletion cleanup using the existing Workpool and Rate Limiter components (`convex/interestSchema.ts`, `convex/interestJobs.ts`).
Changed discovery from generic listicles to individual detail pages: follow actual source links, retain source-supported descriptions and optional venue/date/price details, remove similar packages, and spread results across sources. Food searches now separately explore local restaurants, tasting menus, and food experiences (`convex/firecrawl.ts`, `convex/interestSearch.ts`, `convex/interestDiscovery.ts`, `convex/interestDiversity.ts`).
Added event-date guidance and rejection of recognizable date ranges outside the trip, plus partial-result warnings when sources cannot be read (`convex/interestDetails.ts`, `convex/interestDates.ts`). Dates and booking availability still require confirmation with the source; saved ideas are not reservations.
Development verification passed 234 tests, TypeScript lint, and the production build. Live Firecrawl checks improved a single food-tour result to five food results, including three restaurants on their official websites; no suitable events were confirmed in the final test. Backend changes were deployed to personal dev; no public frontend deployment is recorded.

### 2026-09-17 - 594e803
Added saved-idea itinerary planning with optional date, destination-local time, and notes for booking references or other details. Users can edit details or remove an item from the itinerary while keeping the saved idea; Convex validates inputs and checks trip ownership (`convex/interestSchema.ts`, `convex/interestJobs.ts`, `src/IdeaItinerary.tsx`).
Added a city-date summary from selected transportation legs, including overnight arrivals and round-trip returns, with missing dates labeled and stale route selections excluded (`src/CityStaySummary.tsx`).
Enabled city-only searches beyond the trip’s listed destinations without changing the transportation route, retaining trip dates and the selected interest (`src/LocationPicker.tsx`, `src/locations.ts`, `src/InterestDiscovery.tsx`, `convex/interestJobs.ts`).
Redesigned Interests with a grouped planning panel, inline interest pills, a single search row, compact source-linked cards, collapsible results, and separate saved-idea and itinerary sections. Itinerary entries sort by date and expand for notes, editing, and full activity details (`src/TripForm.tsx`, `src/InterestDiscovery.tsx`, `src/styles.css`).
Development checks passed 240 tests, TypeScript lint, and the production build; tests cover ownership, itinerary edits and validation, city-date derivation, and searches outside the trip route. Backend updates were deployed to personal dev. The user reviewed the UI; automated live-browser visual verification was unavailable. Search source availability and event coverage remain limitations.
The Interests work through `594e803` was merged into `main` in PR #6 (`cbe6994`). No public frontend deployment or activity reservations are recorded.

### 2026-09-17 - ca04150
Added a final Itinerary tab that combines current-route booked transportation and planned activities into one date- and time-ordered schedule. Round-trip flights, booking references, activity notes, source links, and unscheduled activities remain visible in distinct timeline states (`src/TripItinerary.tsx`, `src/TripForm.tsx`).
Excluded stale and unbooked transportation, warned when earlier-route bookings are omitted, and linked empty and populated states back to Transportation and Interests. External activity links retain the existing sanitized HTTP(S) source boundary and ownership-protected Convex favorites query.
Standardized itinerary times to 12-hour display while preserving stored values and chronological ordering. Added responsive styling plus regression tests for grouping, stale records, cleared dates, time formats, final-tab order, and tab-to-panel accessibility wiring (`src/styles.css`, `src/TripItinerary.test.ts`, `src/TripFormTabs.test.ts`).
Development checks passed 246 tests, TypeScript lint, the production build, and `git diff --check`. The work was merged into `main` in PR #7 (`a06b566`); no backend schema change or public deployment was required.

### 2026-09-17 - c8705d7
Added AgentMail itinerary delivery from the final Itinerary tab. Each request saves an immutable, owner-scoped snapshot, queues an internal action, sends escaped HTML and plain text with an idempotency key, and exposes reactive queued, sending, sent, failed, and retry states (`convex/itineraryEmails.ts`, `convex/agentmail.ts`, `src/ItineraryEmailAction.tsx`).
Added per-user and global email limits, duplicate-request protection, bounded retries, deletion cleanup, and tests for authorization, snapshot immutability, HTML escaping, and retry ownership. Development checks passed 250 tests, TypeScript lint, the production build, and a push to personal dev.
The user verified receipt through the UI. Email verification and webhook-confirmed delivery, bounce, and rejection states remained follow-ups at this commit.

### 2026-09-17 - a75580e
Added AgentMail-backed six-digit email verification for password accounts, including a 15-minute expiry, resend flow, and an explicit migration state for already signed-in unverified users (`convex/auth.ts`, `src/AuthForm.tsx`). Itinerary sends now require a verified account address.
Added a signed AgentMail webhook endpoint with raw-body Svix verification, duplicate-event storage, out-of-order reconciliation, and reactive sent, delivered, bounced, and rejected states (`convex/agentmailWebhook.ts`, `convex/itineraryEmails.ts`, `convex/emailSchema.ts`).
Development checks passed 254 tests, TypeScript lint, the production build, and a push to personal dev. The user completed the AgentMail verification-code sign-in flow and confirmed webhook-reported itinerary delivery in the UI.
