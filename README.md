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

The backend currently uses an empty schema so its data model can evolve during
prototyping. It exposes `api.health.check` to verify the connection and
`api.flights.search` for flight searches.

### Flight search

Call `api.flights.search` with a source and destination:

```ts
const result = await convex.action(api.flights.search, {
  source: "Detroit, MI",
  destination: "Los Angeles, CA",
});
```

The action currently returns clearly labeled mock flight data. Its network-capable
action boundary is ready to be replaced with a Firecrawl request later.
