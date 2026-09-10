/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const details = {
  name: "Japan", origin: "Detroit", destinations: ["Kyoto", "Osaka"],
  startDate: "2026-10-01", endDate: "2026-10-09", budget: 3000,
  currency: "USD", travelers: 2, interests: ["Food"],
};
const paginationOpts = { numItems: 2, cursor: null };

async function setup() {
  const t = convexTest(schema, modules);
  const [aliceId, bobId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { email: "alice@example.test" }),
    await ctx.db.insert("users", { email: "bob@example.test" }),
  ]);
  return { t, aliceId, alice: t.withIdentity({ subject: `${aliceId}|session1` }),
    bob: t.withIdentity({ subject: `${bobId}|session2` }) };
}

test("owner can create, read, update, and delete; ownership survives a new session", async () => {
  const { t, alice, aliceId } = await setup();
  const tripId = await alice.mutation(api.trips.create, details);
  const returned = await t.withIdentity({ subject: `${aliceId}|newSession` }).query(api.trips.get, { tripId });
  expect(returned).toMatchObject({ ...details, ownerId: aliceId });
  await alice.mutation(api.trips.update, { tripId, changes: { ...details, name: "Autumn in Japan" }, expectedUpdatedAt: returned.updatedAt });
  expect((await alice.query(api.trips.get, { tripId })).name).toBe("Autumn in Japan");
  await alice.mutation(api.trips.remove, { tripId });
  await expect(alice.query(api.trips.get, { tripId })).rejects.toThrow("TRIP_NOT_FOUND");
});

test("anonymous access is rejected for every trip operation", async () => {
  const { t, alice } = await setup();
  const tripId = await alice.mutation(api.trips.create, details);
  await expect(t.query(api.trips.list, { paginationOpts })).rejects.toThrow("UNAUTHENTICATED");
  await expect(t.query(api.trips.get, { tripId })).rejects.toThrow("UNAUTHENTICATED");
  await expect(t.mutation(api.trips.create, details)).rejects.toThrow("UNAUTHENTICATED");
  await expect(t.mutation(api.trips.update, { tripId, changes: details, expectedUpdatedAt: 0 })).rejects.toThrow("UNAUTHENTICATED");
  await expect(t.mutation(api.trips.remove, { tripId })).rejects.toThrow("UNAUTHENTICATED");
});

test("another user cannot read, change, or delete a trip, or see it in their list", async () => {
  const { alice, bob } = await setup();
  const tripId = await alice.mutation(api.trips.create, details);
  await expect(bob.query(api.trips.get, { tripId })).rejects.toThrow("TRIP_NOT_FOUND");
  await expect(bob.mutation(api.trips.update, { tripId, changes: details, expectedUpdatedAt: 0 })).rejects.toThrow("TRIP_NOT_FOUND");
  await expect(bob.mutation(api.trips.remove, { tripId })).rejects.toThrow("TRIP_NOT_FOUND");
  expect((await bob.query(api.trips.list, { paginationOpts })).page).toEqual([]);
  expect((await alice.query(api.trips.get, { tripId })).name).toBe(details.name);
});

test("pagination remains scoped to the owner", async () => {
  const { alice, bob } = await setup();
  for (let i = 0; i < 3; i++) await alice.mutation(api.trips.create, { ...details, name: `Trip ${i}` });
  await bob.mutation(api.trips.create, { ...details, name: "Private" });
  const first = await alice.query(api.trips.list, { paginationOpts });
  const second = await alice.query(api.trips.list, { paginationOpts: { ...paginationOpts, cursor: first.continueCursor } });
  expect(first.page).toHaveLength(2);
  expect(second.page).toHaveLength(1);
  expect(second.isDone).toBe(true);
  expect([...first.page, ...second.page].map((trip) => trip.name)).not.toContain("Private");
});

test.each([
  { startDate: "2026-02-30" }, { startDate: "not-a-date" }, { endDate: "2026-09-01" },
  { name: " " }, { destinations: [] }, { destinations: [" "] }, { travelers: 1.5 },
  { travelers: 0 }, { budget: -1 }, { budget: Number.NaN }, { budget: 1.234 },
  { currency: "INVALID" }, { interests: Array(21).fill("a") },
])("rejects invalid trip details: %j", async (changes) => {
  const { alice } = await setup();
  await expect(alice.mutation(api.trips.create, { ...details, ...changes })).rejects.toThrow("INVALID_TRIP");
  expect((await alice.query(api.trips.list, { paginationOpts })).page).toHaveLength(0);
});

test("invalid updates and stale forms preserve the saved trip", async () => {
  const { alice } = await setup();
  const tripId = await alice.mutation(api.trips.create, details);
  const original = await alice.query(api.trips.get, { tripId });
  await expect(alice.mutation(api.trips.update, { tripId, changes: { ...details, travelers: 0 }, expectedUpdatedAt: original.updatedAt })).rejects.toThrow("INVALID_TRIP");
  await alice.mutation(api.trips.update, { tripId, changes: { ...details, name: "New name" }, expectedUpdatedAt: original.updatedAt });
  await expect(alice.mutation(api.trips.update, { tripId, changes: details, expectedUpdatedAt: original.updatedAt })).rejects.toThrow("TRIP_CHANGED");
  expect((await alice.query(api.trips.get, { tripId })).name).toBe("New name");
});

test("caller cannot supply an owner to create a trip", async () => {
  const { alice, aliceId } = await setup();
  const forged = { ...details, ownerId: aliceId };
  await expect(alice.mutation(api.trips.create, forged)).rejects.toThrow();
  expect((await alice.query(api.trips.list, { paginationOpts })).page).toHaveLength(0);
});
