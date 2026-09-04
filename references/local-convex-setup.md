# Local Convex Setup

Each developer runs an independent Convex backend and database on their own
computer. Backend code is shared through Git, but local data is not.

## Before setup

An administrator of the Trip Weaver team must invite the developer:

1. Open the [Convex dashboard](https://dashboard.convex.dev/).
2. Select **Trip Weaver team**.
3. Open **Team Settings**, then **Members**.
4. Invite the developer as a team member.

## Start a local deployment

After cloning or pulling the repository, run:

```sh
npm ci
npm run dev:backend -- --configure existing
```

Choose these options when prompted:

1. Select **Trip Weaver team**.
2. Select the existing **trip-weaver** project.
3. Select **local deployment (BETA)**.

Keep this command running while developing. The local backend and frontend
connection stop when the command exits.

## Files and data

- Commit changes under `convex/`, including `convex/_generated/` bindings.
- Do not commit or share `.env.local`.
- Do not share the `.convex/` local database directory.
- Each developer's local database is separate. Add a seed function later if
  everyone needs the same sample data.

For more information, see the Convex documentation for
[local deployments](https://docs.convex.dev/cli/local-deployments) and
[team access](https://docs.convex.dev/dashboard/teams/teams).
