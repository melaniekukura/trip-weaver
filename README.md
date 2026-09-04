# Trip-Weaver

Travel agent app for the Convex All-Gas Hackathon.

## Convex backend

The backend starts without a database schema so the data model can evolve during
prototyping. It currently exposes `api.health.check`, a small query that can be
used to verify the client-to-backend connection.

Install dependencies and start the development deployment:

```sh
npm install
npm run dev:backend
```

The first run prompts you to create or select a Convex project. It also creates
the `convex/_generated` client bindings and writes the deployment URL to a local
environment file. Both are managed by the Convex CLI.

### Flight search

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

`convex/firecrawl.ts` uses Firecrawl's v2 REST API directly from Convex; no browser
SDK or additional service is required. It provides two internal actions:

- `firecrawl:search`: search any travel topic; returns source URLs, titles,
  descriptions, retrieval time, and optional Markdown.
- `firecrawl:scrape`: read one HTTP(S) page as Markdown with its source URL.

These actions are internal because the app does not have authentication yet.
They can be invoked by backend actions, the Convex dashboard, or the authenticated
Convex CLI. The landing-page form is not connected to them. Add authenticated,
rate-limited public wrappers when connecting the trip agent or browser UI.

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
