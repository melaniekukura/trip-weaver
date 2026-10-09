/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
test("profiles are private, preserve auth email, and validate travel settings", async () => {
  const t = convexTest(schema, modules);
  const [aliceId, bobId] = await t.run(async ctx => [await ctx.db.insert("users", { email: "alice@example.test" }), await ctx.db.insert("users", { email: "bob@example.test" })]);
  const alice = t.withIdentity({ subject: `${aliceId}|session` }), bob = t.withIdentity({ subject: `${bobId}|session` });
  const values = { name: "Traveler", defaultAirport: "Detroit — Detroit Metro (DTW)", maxConnections: 1, revision: 0 };
  await expect(t.query(api.profile.get, {})).rejects.toThrow();
  await expect(t.mutation(api.profile.save, values)).rejects.toThrow();
  expect(await alice.query(api.profile.get, {})).toMatchObject({ defaultAirport: null, maxConnections: null, revision: 0 });
  await alice.mutation(api.profile.save, values);
  expect(await alice.query(api.profile.get, {})).toEqual({ ...values, email: "alice@example.test", defaultAccessibility: "", revision: 1 });
  expect(await bob.query(api.profile.get, {})).toMatchObject({ name: "", defaultAirport: null, maxConnections: null });
  await expect(alice.mutation(api.profile.save, values)).rejects.toThrow("another window");
  for (const changes of [{ maxConnections: -1 }, { maxConnections: 1.5 }, { maxConnections: 4 }, { defaultAirport: "Detroit (DTT; all airports)" }, { defaultAirport: "random" }, { name: "x".repeat(121) }]) {
    await expect(alice.mutation(api.profile.save, { ...values, revision: 1, ...changes })).rejects.toThrow();
  }
  await alice.mutation(api.profile.save, { ...values, revision: 1, defaultAirport: null, maxConnections: null });
  expect(await alice.query(api.profile.get, {})).toMatchObject({ defaultAirport: null, maxConnections: null, revision: 2 });
});

test("accessibility defaults are copied only at creation and can be removed independently", async () => {
  const t = convexTest(schema, modules);
  const [owner, other] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const alice = t.withIdentity({ subject: `${owner}|session` }), bob = t.withIdentity({ subject: `${other}|session` });
  const trip = { name: "Trip", origin: "DTW", destinations: ["Paris"], startDate: "2026-10-01", endDate: "2026-10-05", budget: null, currency: "USD", travelers: 1, interests: [] };
  const before = await alice.mutation(api.trips.create, trip);
  const settings = { name: "Traveler", defaultAirport: null, maxConnections: null, revision: 0, defaultAccessibility: "Step-free access\nQuiet environments" };
  await alice.mutation(api.profile.save, settings);
  const after = await alice.mutation(api.trips.create, trip);
  expect((await alice.query(api.trips.get, { tripId: before })).accessibility).toBe("");
  expect((await alice.query(api.trips.get, { tripId: after })).accessibility).toBe(settings.defaultAccessibility);
  const otherTrip = await bob.mutation(api.trips.create, trip);
  expect((await bob.query(api.trips.get, { tripId: otherTrip })).accessibility).toBe("");
  const explicitEmpty = await alice.mutation(api.trips.create, { ...trip, accessibility: "" });
  expect((await alice.query(api.trips.get, { tripId: explicitEmpty })).accessibility).toBe("");
  await alice.mutation(api.profile.save, { ...settings, revision: 1, defaultAccessibility: "Captioned experiences" });
  expect((await alice.query(api.trips.get, { tripId: after })).accessibility).toBe(settings.defaultAccessibility);
  const saved = await alice.query(api.trips.get, { tripId: after });
  await alice.mutation(api.trips.update, { tripId: after, expectedUpdatedAt: saved.updatedAt, changes: { ...trip, accessibility: "" } });
  expect((await alice.query(api.trips.get, { tripId: after })).accessibility).toBe("");
  expect((await alice.query(api.profile.get, {})).defaultAccessibility).toBe("Captioned experiences");
  const newest = await alice.mutation(api.trips.create, trip);
  expect((await alice.query(api.trips.get, { tripId: newest })).accessibility).toBe("Captioned experiences");
  await expect(alice.mutation(api.profile.save, { ...settings, revision: 2, defaultAccessibility: "x".repeat(2001) })).rejects.toThrow();
  await alice.mutation(api.profile.save, { ...settings, revision: 2, defaultAccessibility: "" });
  expect((await alice.query(api.profile.get, {})).defaultAccessibility).toBe("");
});
