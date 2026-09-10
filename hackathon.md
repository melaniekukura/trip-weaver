# Hackathon log

- **Project:** Trip-Weaver
- **Event:** Convex All Gas Hackathon
- **What it does:** Trip planning with private saved trips and sign-in on the feature branch, plus mock flight search and internal Firecrawl research.
- **Live app:** not deployed
- **Repo:** private
- **Frontend:** not deployed
- **Convex deployment:** not deployed
- **Components:** none
- **Convex features:** schema, tables, indexes, queries, paginated queries, mutations, actions, HTTP actions
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-09-04T19:25:03Z
- **Last updated:** 2026-09-10T21:38:14Z

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
