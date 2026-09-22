# Trip-Weaver MVP plan and status

## MVP outcome

Trip-Weaver lets a guest begin planning without an account, preserve that draft
through sign-in, and continue in a private saved trip. Signed-in travelers can
research and select trip options, track costs and accessibility needs, use a
trip-aware assistant, assemble an itinerary, and email themselves a snapshot.

This status reflects the repository as of September 21, 2026.

## 1. Access, authentication, and profiles

- [x] Show the same public home page to guests and signed-in users.
- [x] Provide email/password sign-up and sign-in through Convex Auth.
- [x] Verify new accounts with a six-digit code delivered through AgentMail.
- [x] Keep unauthenticated profile queries from blanking or crashing the app.
- [x] Store profile defaults for home airport, maximum connections, and
      accessibility needs.
- [x] Enforce a 30-minute browser inactivity timeout with a two-minute warning.
- [ ] Add password reset and account recovery.
- [ ] Add a server-enforced session lifetime if the browser-only idle timer is
      not sufficient for launch requirements.

## 2. Guest planning and draft handoff

- [x] Let guests begin from the home-page trip form without signing in.
- [x] Preserve entered airports, including leaving blank airports blank.
- [x] Provide the complete Overview and Accessibility tabs to guests.
- [x] Provide guest flight setup and interests editing while clearly gating
      account-only research, saved lists, lodging, and itinerary features.
- [x] Keep the guest draft in session storage while navigating to sign-in.
- [x] Import the draft exactly once into a new owned trip after sign-in or
      account creation, then open that trip in the editor.

Guest drafts are browser-session drafts. They do not sync between devices and
are not durable after the session storage is cleared.

## 3. Saved trips and planning workspace

- [x] Create, list, read, update, and delete private trips.
- [x] Store the trip name, origin, ordered multi-city destinations, dates,
      travelers, budget, currency, interests, accessibility needs, and return-home
      preference.
- [x] Derive ownership from the authenticated identity on every trip operation.
- [x] Validate trip inputs and reject stale concurrent edits.
- [x] Apply profile defaults when creating a trip.
- [x] Open trips from either the home-page flow or the Trips page in the same
      editor.
- [x] Clean up flight, lodging, interest, assistant, email, and fee records after
      a trip is deleted.

## 4. Transportation and flight research

- [x] Build flight legs from the saved route, including multi-city and return-home
      handling.
- [x] Search Google Flights through Firecrawl for one-way and round-trip options.
- [x] Support airport validation, connection filters, outbound and return
      selection, booking links, booking state, and plan confirmation.
- [x] Save observed prices, source URLs, retrieval times, and selected flight
      details.
- [x] Queue research with Workpool and provide rate limits, credit limits,
      caching, progress, diagnostics, and recoverable failure states.
- [x] Research local transportation fares and include itemized transportation
      expenses in the budget.
- [x] Label researched fares as observations rather than verified checkout
      inventory.
- [x] Apply the trip's traveler count to outgoing and return flight searches,
      provider-context validation, cached requests, displayed totals, and budgets.
- [ ] Support configurable cabins and currencies in flight search. The current
      search scope is economy and USD.
- [ ] Verify live fare availability or complete bookings inside Trip-Weaver.

## 5. Lodging, interests, and accessibility

- [x] Search for source-linked lodging options by destination and property type.
- [x] Add, edit, and remove stays with dates, cost, booking link, confirmation
      number, notes, and booked state.
- [x] Research activities, sights, food, and dated events by destination and
      saved interest.
- [x] Save and remove favorite ideas and schedule them with a date, time, and
      notes.
- [x] Compare activity results with the traveler's accessibility requirements
      and retain source-supported evidence.
- [x] Handle interrupted lodging and interest jobs without discarding saved trip
      work.
- [ ] Add dedicated weather research.
- [ ] Add dedicated safety research.

## 6. Itinerary

- [x] Build a chronological itinerary from booked flights, booked lodging, and
      scheduled saved activities.
- [x] Show unscheduled saved activities separately.
- [x] Link itinerary entries back to their source and editing workflow.
- [x] Keep itinerary queries reactive as the underlying plan changes.
- [ ] Support arbitrary manual itinerary entries such as transfers or notes.
- [ ] Support manual reordering independent of date and time sorting.

The current itinerary is a derived view of the flight, lodging, and activity
records rather than a separate generic itinerary-item collection.

## 7. Budgeting

- [x] Track a trip budget and supported currency.
- [x] Include selected transportation, lodging, manual expenses, researched
      local fares, and researched extra fees in totals.
- [x] Show category breakdowns and daily budget graphs.
- [x] Convert supported currencies with cached reference rates and visible error
      recovery.
- [x] Reject invalid costs and stale expense or transportation updates.

## 8. AI travel assistant

- [x] Use the Convex Agent component with an OpenRouter model.
- [x] Maintain one persistent, paginated conversation per owned trip.
- [x] Supply the assistant with a read-only, allowlisted context containing the
      route, dates, flight times, scheduled and unscheduled activities, interests,
      and accessibility requirements. Lodging and financial data are excluded.
- [x] Distinguish suggestions, selections, and confirmed bookings in the prompt.
- [x] Provide generation state, provider-error handling, request idempotency, and
      per-user/global usage limits.
- [ ] Give the assistant bounded research tools.
- [ ] Let the assistant propose structured itinerary changes for explicit user
      approval.
- [ ] Apply approved changes through validated, ownership-checked mutations.

The assistant can advise from saved context, but it cannot currently run research
or change the trip.

## 9. AgentMail itinerary delivery

- [x] Send an immutable itinerary snapshot to the signed-in user's verified
      address.
- [x] Record the snapshot, recipient, request identity, and delivery status.
- [x] Prevent duplicate sends and support explicit retry.
- [x] Verify signed webhooks for sent, delivered, bounced, and rejected events.
- [x] Expose actionable delivery and retry states in the itinerary UI.

## 10. Operations and verification

- [x] Serve the frontend and backend through Convex, with a production deployment
      workflow guarded by tests and type checking.
- [x] Keep third-party secrets and network calls in backend actions.
- [x] Treat retrieved web content as untrusted source material.
- [x] Test core ownership isolation, validation, stale edits, background research,
      duplicate requests, assistant failures, and email retries with mocked
      integrations.
- [x] Track and display conservative Firecrawl session and project credit usage.
- [ ] Complete a documented end-to-end browser acceptance pass covering guest
      draft -> account creation -> research -> selection -> itinerary -> email.
- [ ] Add automated browser-level end-to-end tests for the critical path.
- [ ] Add production monitoring and alerting for provider and background-job
      failures.

## Current data model

| Record group | Purpose |
| --- | --- |
| Auth users and profiles | Account identity, verification, and traveler defaults |
| Trips and guest import keys | Owned planning data, budgets, flight selections, and idempotent guest-draft handoff |
| Research runs and sources | Flight requests, progress, results, provenance, diagnostics, and cache state |
| Lodging runs and lodgings | Lodging research and saved or booked stays |
| Interest runs and favorites | Activity/event research, accessibility evidence, saved ideas, and schedules |
| Fee and transportation data | Extra-fee research, local fares, and manual costs |
| Assistant threads and requests | Persistent trip conversations and idempotent generation state |
| Email deliveries | Immutable itinerary snapshots and AgentMail delivery state |
| Firecrawl budgets | Per-session and project-wide research usage |

## Remaining MVP gaps

The current product covers the main saved-trip workflow. The remaining work is:

1. Dedicated weather and safety research.
2. Broader flight-search inputs beyond economy and USD.
3. Assistant research tools and user-approved structured trip changes.
4. Manual itinerary entries and custom ordering, if those remain MVP requirements.
5. A repeatable end-to-end browser acceptance test and production monitoring.

Verified live availability, in-app booking/payment, newsletter ingestion,
background price alerts, collaboration, and automated route optimization remain
post-MVP scope.
