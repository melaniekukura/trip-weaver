# Hackathon log

- **Project:** Trip-Weaver
- **Event:** Convex All Gas Hackathon
- **What it does:** Guest-to-account multi-city trip planning with Firecrawl research for flights, lodging, activities, costs, and entry documents; accessibility requirements; reactive budgets; a unified day-by-day itinerary; AgentMail delivery; and a trip-aware AI planning assistant.
- **Live app:** https://rare-scorpion-458.convex.site
- **Repo:** private
- **Frontend:** Convex static hosting
- **Convex deployment:** https://rare-scorpion-458.convex.cloud
- **Components:** @convex-dev/agent, @convex-dev/static-hosting, @convex-dev/workpool (researchPool), @convex-dev/rate-limiter
- **Convex features:** schema, tables, indexes, queries, realtime queries, paginated queries, mutations, actions, HTTP actions, scheduled functions
- **Auth:** Convex Auth
- **AI models:** openrouter/free
- **Started:** 2026-09-04T19:25:03Z
- **Last updated:** 2026-09-22T04:10:31Z

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

### 2026-09-18 - 690a269
Added a persistent, per-trip planning conversation using the registered Convex Agent component and OpenRouter's `openrouter/free` model. The assistant receives the owned trip's overview, current-route flight selections and booking state, saved ideas, and scheduled activities while distinguishing recorded facts from suggestions (`convex/tripAgent.ts`, `convex/tripAssistant.ts`).
Added owner-scoped threads and paginated messages, duplicate-request protection, per-user and global limits, provider failure handling, and cleanup when a trip is deleted (`convex/assistantSchema.ts`, `convex/tripAssistant.ts`, `convex/trips.ts`).
Placed the assistant in a fixed, responsive rail beside every trip-planning tab, with persistent history, single-line suggested prompts, loading and error states, and sanitized Markdown and HTML rendering (`src/TripAssistant.tsx`, `src/AssistantMessageContent.tsx`, `src/TripForm.tsx`, `src/styles.css`).
Development checks passed 259 tests, TypeScript lint, and the production build. The user verified grounded trip review responses and the persistent assistant layout in the UI. The free routed model can vary by availability and is presented as a preview.

### 2026-09-18 - 63c2859 (tab-reorganization and accessibility backfill)
Added searchable accessibility requirements, custom entries, removable cards, and eight categories covering activity level, mobility, vision, hearing, sensory comfort, transportation assistance, accommodation, and dietary/health needs. Used accommodation-focused wording such as “No strenuous activity.” Backfills `50d280e` and `c81187c` on `accessibility`: saved requirements feed a reusable evidence-based checker; outgoing, return, and selected flights remain visible with a triangle warning, “cannot confirm accessibility requirements,” when applicable requirements are unverified (`src/AccessibilityTab.tsx`, `src/FlightAccessibilityNotice.tsx`, `convex/accessibility.ts`, `convex/flightJobs.ts`). Current flight listings do not supply verified accessibility evidence. The branch also added a Firecrawl content-scrape credit setting (`79e5e77`) and merged newer planning features from main (`0fb1aa1`).
Reorganized navigation around Trips, Budget, and About, removing the global Flight Tracker and Interests links. Added per-trip Budget cards with Show Budget and Total Cost, omitting edit/delete controls, dates, and locations; created a full-width Budget workflow with Overview, Transportation, Extra Fees, and Graphs, titled “Budget: {trip title}.” Persistent header buttons connect both workflows. Removed Budget from Plan My Trip and moved its destination controls into Overview, removing the planning Destinations tab while retaining the creation/edit modal. Removed redundant section descriptions and recorded the convention in `AGENTS.md` (`src/App.tsx`, `src/Trips.tsx`, `src/pages/TripBudgetPage.tsx`, `src/pages/TripPlannerPage.tsx`, `src/TripForm.tsx`, `src/styles.css`).
Added transportation costs from current-route selected flights, multiplying fares by traveler count and counting a round-trip fare once. Added editable bus, metro, tram, local train, ferry, taxi, and ride-hailing estimates with ride-count controls and an inclusion switch; rental cars are excluded from this table. Convex persists ride settings with ownership checks, validation, and revision protection (`src/TransportationBudget.tsx`, `src/budgetCalculations.ts`, `convex/transportationBudget.ts`, `convex/trips.ts`). Default local ride prices are planning estimates, not destination-specific researched quotes; stale route selections are excluded.
Added on-demand Firecrawl research for itinerary activity tickets and booking fees, fixed-price restaurant meals, checked baggage, and optional rental-car extras/parking. Category subtotals and an itemized table retain source links and price evidence, with missing or inapplicable prices marked unknown. Convex stores settings and indexed research runs, streams results through realtime queries, reuses matching runs for six hours, limits requests, queues actions through Workpool, and cleans up deleted trips; failed jobs preserve successful results (`src/ExtraFees.tsx`, `convex/extraFeeSchema.ts`, `convex/extraFeeResearch.ts`, `convex/extraFees.ts`, `convex/firecrawl.ts`). Rental fee research excludes the base rental price and refundable deposits.
Added a colorful category donut and daily-spending bars with currency selection, category filtering, and accessible value labels. Undated costs are spread across trip days without losing cents; round-trip costs are split across departure and return dates. Shared calculations combine included transportation and priced extra fees into Total Cost in both Budget Overview and its trip cards, keep currencies separate, and flag incomplete totals (`src/BudgetGraphs.tsx`, `src/budgetCosts.ts`, `src/BudgetCostSummary.tsx`). No exchange-rate conversion or invented prices are used for missing research results.
Development verification passed 288 tests and frontend/backend TypeScript checks after the final tab move; the production build passed earlier in the Budget work, and backend changes were synced to personal dev. Tests cover cost arithmetic, currency separation, daily allocation, ownership, stale edits, fee evidence, caching, worker failures, deletion cleanup, and tab wiring. Live fee research and browser visual verification remain unverified. Header component/hosting facts were refreshed from `convex/convex.config.ts` and `convex/http.ts`; hosting setup is not attributed to these branches, and no public deployment is claimed.

### 2026-09-18 - 76471b3
Published Trip-Weaver at `https://rare-scorpion-458.convex.site` using the registered Convex Static Hosting component. App-owned routing keeps Convex Auth and the signed AgentMail webhook at their existing root URLs before the static-site fallback (`convex/convex.config.ts`, `convex/http.ts`).
Added a single production command that builds the Vite frontend with the production Convex URL, deploys the backend, and uploads the static assets (`package.json`).
Added a GitHub Actions release workflow for pushes to `main` and manual runs from `main`. It installs locked dependencies, runs tests and TypeScript lint, prevents overlapping releases, and supplies the production-scoped deploy key only to the deployment step (`.github/workflows/deploy-production.yml`).
Local verification passed 259 tests, TypeScript lint, the production build, workflow YAML parsing, and `git diff --check`. The user confirmed the public site was running; the first automated post-merge deployment was still in progress when this entry was recorded.

### 2026-09-18 - 0279d71 (includes c1f76a6)
Replaced generic local transportation estimates with destination-specific Firecrawl fare research. Each destination has its own inclusion switch, fare table, source details, refresh action, and ride counts. Research starts only when enabled; switching off hides the table, excludes its costs, cancels queued work, and rejects late results. Convex stores results on the owned trip, queues bounded Workpool actions, applies rate limits, and reuses completed research for six hours; changed dates or removed destinations invalidate results (`convex/localTransportation.ts`, `convex/localTransportationFields.ts`, `src/TransportationBudget.tsx`). Unconfirmed fares remain unknown; taxi and ride-hailing base or distance rates are not presented as complete ride prices.
Unified flights, enabled local rides, and all priced extra-fee categories into one Total Cost in the trip’s currency, shared by Overview, both trip-card views, and the category/daily graphs. Added an Overview breakdown and replaced the old manually entered total on My Trips cards. Foreign prices use cached Frankfurter/ECB reference rates; conversion failures show a retry state instead of silently omitting foreign costs, while item tables retain original currencies (`src/budgetCosts.ts`, `src/useBudgetCosts.ts`, `src/exchangeRates.ts`, `src/BudgetCostSummary.tsx`, `src/BudgetGraphs.tsx`). This supersedes the earlier separate-currency totals.
Expanded activity discovery with dedicated major-museum and monument/landmark queries, more linked detail-page visits, and up to 18 activities plus six events. Added accessibility evidence extraction tied to selected requirements and verbatim source excerpts; requirements now participate in search cache keys. Results show confirmed matches first, unverified accessibility separately, and documented mismatches lower down with unmet requirements highlighted in orange and linked to evidence. Activities remain saveable in every group (`convex/interestJobs.ts`, `convex/interestSearch.ts`, `convex/activityAccessibility.ts`, `convex/interestDetails.ts`, `src/InterestDiscovery.tsx`). Missing information is not treated as a confirmed barrier.
Replaced About with Profile, including editable name, account-email display, an optional default airport, and maximum connections. Added private profile queries/mutations, a user-indexed settings table, validation, and stale-edit protection. New trip origins use the saved airport; existing trips offer an explicit Use default airport action. Outgoing and return filters initialize from the connection limit and allow overrides. Added a compact accessibility search/chip editor whose saved defaults are copied only when creating new trips; existing trips and later profile changes remain independent, and copied trip chips can be removed (`convex/profile.ts`, `convex/schema.ts`, `convex/trips.ts`, `src/pages/ProfilePage.tsx`, `src/profileDefaults.ts`, `src/AccessibilityTab.tsx`).
Removed New Trip from Budget while retaining it in My Trips. Save Trip and Create my trip stay gray and disabled until the new trip has a valid name, selected origin, destination list, dates, and traveler count; submission also guards against incomplete creation (`src/Trips.tsx`, `src/TripForm.tsx`, `src/tripCreation.ts`).
Latest verification passed 318 tests, frontend/backend TypeScript checks, and whitespace checks. The production build passed after the Profile/accessibility-default work, before the final button changes; backend updates were synced to personal dev. Tests cover destination isolation, disabled-search behavior, late-result rejection, fee totals and currency conversion, activity evidence and broader discovery, profile ownership, and new-trip-only accessibility inheritance. A live public exchange-rate request confirmed the API response format; destination fare research, expanded attraction coverage, and browser interaction remain unverified live. No new production deployment was performed in this work session.

### 2026-09-20 - 7efaaa4 (includes aaed3fc, ddc2651, and 805bcdc)
Hardened Firecrawl accounting with per-request reservations, reported-usage reconciliation, interrupted-request expiry, and session/project limits across active research flows. Multi-city route editing now keeps the return-home flight as the final leg.
Added owned lodging research and editable stays with custom cities, date validation, property-type filtering, prices, source and booking links, confirmation details, notes, and booked state. Booked lodging contributes to budgets and the chronological itinerary; interrupted research preserves saved work. The assistant gained a responsive toggleable drawer, and activity discovery excludes ideas already saved.

### 2026-09-21 - c3c9ed5 (includes dd73214 through c93c268)
Added manual expenses with custom categories, currencies, dates, totals, and graphs, plus itemized transportation costs in both the planner and its budget subtotal. Itinerary email delivery now defaults to the verified account address, accepts a validated alternate recipient, and includes booked lodging in its immutable snapshot. Accessibility editing gained searchable suggestions.
Restored a shared public home page and a guest trip builder with full Overview and Accessibility access, limited flight and interest setup, gated account-only tabs, session-storage draft preservation, and idempotent import into a newly owned trip after authentication. Refactored shared app-shell and trip-form controller responsibilities to keep guest and authenticated flows aligned.
Added required-field feedback, 15-minute-code password recovery, and full traveler-count propagation through outgoing and return flight research, cache identity, provider validation, displayed totals, and budgets. The trip assistant now receives only an allowlisted read-only view of routes, dates, flight times, scheduled and unscheduled activities, interests, and accessibility needs; lodging and financial data remain excluded.

### 2026-09-21 - 73481d7 (includes c810587, 57e9445, and 34ab16f)
Set the browser inactivity timeout to 30 minutes with a warning two minutes before sign-out. Added a signed-in-only Required Documents tab after Itinerary, with owned Firecrawl searches by origin, destination, and start date; categorized source links; six-hour reuse; Workpool scheduling; rate and credit limits; trip-deletion cleanup; and recoverable errors. A follow-up removed an unsupported search-content option that caused live request failures.
Scoped creation validation to required Overview fields so controls on other tabs no longer force navigation back to Overview. Added the supplied Space Indigo favicon and README mark plus a Cyan navigation logo for contrast.
Automated verification reached 397 passing tests, and frontend/backend type checks and the production build passed during this implementation work. A live required-document search completed with two reported Firecrawl credits; the result remains research guidance that travelers must confirm with the relevant authority. No production deployment was performed in this work session.

### 2026-09-22 - 9292a42 (includes 665dd75 and 9086f25)
Added a scalable Cyan SVG route mark above the home-page title with a smooth left-to-right reveal, sharp vector edges, and a reduced-motion fallback (`references/logo-icon/TW-cyan.svg`, `src/pages/HomePage.tsx`, `src/styles.css`).
Aligned the planning-page heading with Budget by using “Trip: {trip title}” and removed the duplicate in-form planner label and trip name while retaining modal creation/edit headers (`src/pages/TripPlannerPage.tsx`, `src/TripForm.tsx`). Verification included 397 passing tests, focused homepage and trip-form tests after the final refinements, frontend/backend TypeScript checks, the production build, and whitespace checks. No production deployment is recorded for this update.
