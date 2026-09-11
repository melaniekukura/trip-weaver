# Trip-Weaver MVP backend plan

## MVP outcome

A user creates a trip, researches it through an AI travel assistant inside the
app, saves and edits an itinerary, and emails themselves a summary.

The assistant does not specifically require a Codex runtime. Choose its model
and integration when implementing phase 4.

## Starting point

As of September 9, 2026:

- React frontend connects to the local Convex backend.
- Internal Firecrawl search and scrape actions exist with mocked integration tests.
- Flight search returns explicitly labeled mock data.
- The database schema is empty.
- Authentication, saved trips, chat, and AgentMail are not implemented.
- The frontend dates field is not passed to the backend.

## 1. Authentication and saved trips

- [x] Choose and implement sign-in (email and password via Convex Auth).
- [x] Add trip records with owner, origin, destinations, actual dates, budget,
      currency, travelers, and interests.
- [x] Implement create, list, read, update, and delete operations.
- [x] Derive ownership from the authenticated identity and enforce it on every
      trip operation.
- [x] Connect the frontend to saved trips and pass structured dates.
- [x] Verify persistence after reload and rejection of another user's access.

**Done when:** a user can create and retrieve their trips after reloading, and
another user cannot access them.

**Verification, September 9:** unit tests and a live local API check cover sign-up,
sign-in, wrong-password rejection, persistence across sessions/new clients,
ownership isolation, and trip CRUD. Lint and production build pass.
Two synthetic local test accounts remain signed out;
the live test trip was deleted.

**Browser verification, September 10:** user confirmed creating a trip in the UI,
retaining all saved fields after reload, retrieving the trip after signing out
and back in, and isolation from a second account. All 46 tests, lint, and build
also passed during the PR review. Step 1 is complete.

**Before public launch:** implement password reset and email verification with
email delivery. The existing flight demo's free-text date input remains separate
from the saved-trip form, which sends structured start and end dates.

## 2. Editable itineraries

- [x] Store flights, stays, activities, and transfers as individual trip-owned
      records with ordering, local dates, time zones, notes, and source links.
- [x] Implement adding, editing, moving, and removing items.
- [ ] Validate dates and enforce ownership for all item operations.
- [x] Connect the itinerary UI to reactive Convex queries.
- [ ] Define cleanup of related records when a trip is deleted.

**Done when:** a manually created itinerary persists and updates immediately in
the UI.

## 3. Trip research

- [x] Connect the existing internal Firecrawl actions to authenticated trip
      research operations.
- [ ] Support research topics: sights, events, weather, safety, flights, and stays.
- [x] Save research runs, source URLs, retrieval times, and results.
- [x] Add request limits, caching, and visible progress and error states.
- [ ] Handle partial failures and interrupted research without losing saved work.
- [ ] Let the user save a sourced recommendation to the itinerary.
- [ ] Treat retrieved web content as untrusted material, never agent instructions.
- [ ] Distinguish sourced research from verified live fares and availability.

**Done when:** a user researches a destination and saves a sourced recommendation
to their itinerary.

**First milestone, September 11:** the saved-trip UI now focuses on flight
research using Firecrawl to read Google Flights. The prototype supports one-way
economy, one adult, USD, with route/date validation, observed fares, source links,
15-minute caching, background jobs, ownership checks, and credit limits. City/sights research is deferred.
Flight parser and queue tests, lint, build, and an authenticated live search
through the local backend have been verified. Browser visual verification remains pending. See
`references/flight-search.md`.

**Flight scope:** prices are observations from Google Flights, not verified
checkout inventory. Round trips, additional travelers/cabins/currencies, other
research topics, and saving results into the itinerary remain unfinished.

## 4. AI travel assistant

- [ ] Choose the model/provider and persistent agent integration.
- [ ] Associate a persistent conversation with each trip.
- [ ] Give the assistant tools to read trip details and run bounded research.
- [ ] Have it propose sourced itinerary changes for the user to accept.
- [ ] Apply accepted changes through validated, ownership-checked operations.
- [ ] Add visible generation progress, failure handling, and usage limits.
- [ ] Ensure retries or concurrent changes do not duplicate itinerary items or
      overwrite newer user edits.

**Done when:** “Find activities for day two” produces sourced suggestions the user
can add to their trip.

## 5. AgentMail itinerary delivery

- [ ] Configure the AgentMail integration and backend secrets.
- [ ] Add an explicit “Email my itinerary” action.
- [ ] Send a snapshot of the saved itinerary to the user's verified address.
- [ ] Record which itinerary version was sent and its delivery status.
- [ ] Prevent duplicate sends during retries and expose actionable failures.

**Done when:** the user receives the requested itinerary and can see whether
delivery succeeded.

## 6. MVP verification

- [ ] Test unauthenticated requests and cross-user access to all trip resources.
- [ ] Test invalid dates and itinerary inputs.
- [ ] Test provider failures and interrupted research.
- [ ] Test duplicate requests and email retry behavior.
- [ ] Run `npm test`, `npm run lint`, and `npm run build`.
- [ ] Verify the complete create → research → save → email flow.

**Done when:** the complete flow works, with recoverable errors when a provider is
unavailable.

## Initial data model

| Record | Purpose |
| --- | --- |
| Trips | Ownership and planning preferences |
| Itinerary items | Individual flights, stays, activities, and transfers belonging to a trip |
| Research runs | Research request, progress, completion, and error state |
| Research sources | Results, provenance, and retrieval times |
| Chat threads | Trip conversations; message storage depends on the agent integration |
| Email deliveries | Snapshot/version sent, recipient, and delivery status |

Finalize validators, indexes, and component-managed storage during each phase.
Keep growing collections in separate records rather than unbounded trip arrays.

## Deferred beyond the MVP

- Newsletter ingestion and matching incoming content to trips.
- Automatic background monitoring and alerts.
- Collaborative itinerary editing.
- Booking and payment processing.
- Automated route optimization.
- Verified live flight pricing and availability unless explicitly added to scope.

## Working through this plan

Start with phase 1, then phase 2 so research and chat have persistent trip data to
work with. Check off items only after implementation and verification. Record
scope changes and unresolved decisions here as work proceeds.
