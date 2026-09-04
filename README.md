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
