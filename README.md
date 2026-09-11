# Trip-Weaver

Travel agent app for the Convex All-Gas Hackathon.

## Local development setup

Each developer runs an independent local Convex backend and database. Backend
code is shared through Git, but local data and environment configuration are not.

### Prerequisites

Before configuring the project, a Trip Weaver team administrator must:

1. Open the [Convex dashboard](https://dashboard.convex.dev/).
2. Select **Trip Weaver team**.
3. Open **Team Settings**, then **Members**.
4. Invite the developer to the team.

The developer must also have a supported Node.js and npm installation.

### Install and configure

Clone the repository, install its locked dependencies, and configure Convex:

```sh
git clone git@github.com:melaniekukura/trip-weaver.git
cd trip-weaver
npm ci
npm run dev:backend -- --configure existing
```

Log in to Convex if prompted, then select:

1. **Trip Weaver team**.
2. The existing **trip-weaver** project.
3. **local deployment (BETA)**.

The Convex CLI generates the client bindings under `convex/_generated/` and
creates `.env.local` with values similar to:

```env
CONVEX_DEPLOYMENT=local:local-trip_weaver-trip_weaver
CONVEX_URL=http://127.0.0.1:3210
CONVEX_SITE_URL=http://127.0.0.1:3211
```

Ports may differ when another local service is already using them. Manually add
`VITE_CONVEX_URL` using the exact value generated for `CONVEX_URL`:

```env
VITE_CONVEX_URL=http://127.0.0.1:3210
```

Do not use environment-variable interpolation here; copy the complete URL.

### Run the application

Keep the backend running in the first terminal:

```sh
npm run dev:backend
```

Start the Vite frontend in a second terminal:

```sh
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

The local backend stops when `npm run dev:backend` exits. Do not commit or share
`.env.local` or the `.convex/` local database directory. Each developer receives
an independent local database.

## Convex backend

The backend stores Convex Auth accounts and private saved trips. It also exposes
`api.health.check` to verify the connection and `api.flights.search` for mock
flight searches.

### Authentication and saved trips

Create an account with an email address and a password of 12–128 characters.
After signing in, **My trips** supports creating, editing, and deleting plans.
Trips include destinations, calendar dates, budget, currency, traveler count,
and interests. Changes persist in the local Convex database.

The frontend signs users out after 30 minutes without typing, clicking, or
scrolling. A warning appears two minutes beforehand with a **Stay signed in**
button. Activity is shared across tabs and retained on reload; elapsed time is
checked again when a tab resumes. Unsaved form changes are lost on sign-out.
This is a browser inactivity timer, not a server-enforced idle-session limit.

The `trips:list`, `trips:get`, `trips:create`, `trips:update`, and `trips:remove`
functions require authentication. Ownership is derived from Convex Auth's stable
user ID. Lists use an owner index and pagination; updates reject stale forms.

Each developer's local deployment needs its own `JWT_PRIVATE_KEY` and `JWKS`
signing keys. Follow the [manual Convex Auth key setup](https://labs.convex.dev/auth/setup/manual)
to generate these and set them in the **local deployment's** environment settings.
Do not put signing keys in Vite variables or commit them. `SITE_URL` can be set to
the frontend origin, normally `http://localhost:5173`.

Password reset and email verification are not implemented yet. Add them with
email delivery before public launch; account emails are currently unverified.

### Legacy mock flight action

The UI no longer uses this action. For the real prototype, see below.
Call `api.flights.search` with a source and destination:

```ts
const result = await convex.action(api.flights.search, {
  source: "Detroit, MI",
  destination: "Los Angeles, CA",
});
```

The action currently returns clearly labeled mock flight data. Its network-capable
action boundary is separate from the Firecrawl research integration below.

### Firecrawl web research

Saved trips include a **Find flights** prototype: one-way or round-trip economy for one adult
in USD, using Firecrawl to read Google Flights. Enter airport codes and a departure
date to see up to five observed fares, source links, progress/errors, and refresh.
Matching results are cached for 15 minutes, with ownership checks and request limits.
See [the research API and itinerary handoff](references/flight-search.md).

`convex/firecrawl.ts` uses Firecrawl's v2 REST API directly from Convex; no browser
SDK or additional service is required. It provides two internal actions:

- `firecrawl:search`: search any travel topic; returns source URLs, titles,
  descriptions, retrieval time, and optional Markdown.
- `firecrawl:scrape`: read one HTTP(S) page as Markdown with its source URL.

These low-level actions remain internal. The authenticated, rate-limited
`flightJobs:start` mutation queues flight searches, and `flightJobs:latest` reads results.
They can be invoked by backend actions, the Convex dashboard, or the authenticated
Convex CLI. The old mock flight form is removed from the UI. The prototype does
not verify checkout availability or support multiple travelers. Round-trip results
let you choose an outgoing flight, retrieve matching returns, and filter each leg
separately. Return-option prices cover both flights. Confirm availability and
booking details in Google Flights; return selection uses Firecrawl browser credits.

#### Configure and verify

1. Create a key in the [Firecrawl dashboard](https://www.firecrawl.dev/app).
2. Start the existing local backend in a terminal:

   ```sh
   npm run dev:backend
   ```

3. In another terminal, set the backend secret interactively so it stays out of
   shell history:

   ```sh
   npx convex env set FIRECRAWL_API_KEY --deployment local
   ```

   `.env.local` configures the CLI and Vite; putting a secret there alone does
   **not** configure the Convex runtime. Never use `VITE_FIRECRAWL_API_KEY`.
   Each cloud development or production deployment needs its own secret setting.

4. Run a minimal live search (uses Firecrawl credits):

   ```sh
   npx convex run firecrawl:search '{"query":"Kyoto official tourism","limit":1}'
   ```

5. To read one returned source, pass its URL:

   ```sh
   npx convex run firecrawl:scrape '{"url":"https://www.japan.travel/en/"}'
   ```

Once Convex regenerates its bindings, a backend action can call:

```ts
import { internal } from "./_generated/api";

const research = await ctx.runAction(internal.firecrawl.search, {
  query: "Kyoto events October 2026 official tourism",
  limit: 3,
  includeContent: true,
});
```

Search defaults to five results and snippets only. `includeContent: true` also
scrapes those results and uses additional credits. Results contain at most 30,000
Markdown characters per page and mark shortened content with `truncated: true`.
Requests time out after 45 seconds and are not retried automatically.

Missing keys, invalid keys, insufficient credits, rate limits, failed pages, and
network failures produce explicit errors; the integration never substitutes mock
results. Web content is untrusted source material for the agent, not instructions.
Search results are research leads, not verified live fares or booking inventory;
the existing mock flight API remains explicitly labeled as mock.

Run `npm test` for mocked integration tests (no credits used), `npm run lint` for
frontend and backend type checks, and `npm run build` for the frontend build.

API references: [Search](https://docs.firecrawl.dev/api-reference/endpoint/search)
and [Scrape](https://docs.firecrawl.dev/api-reference/endpoint/scrape).
