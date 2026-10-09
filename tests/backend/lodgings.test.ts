/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const trip = { name: "California", origin: "DTW", destinations: ["LAX", "SFO"], startDate: "2026-10-15",
  endDate: "2026-10-22", budget: null, currency: "USD", travelers: 2, interests: [] };
const stay = { type: "hotel" as const, destination: "LAX", name: "Ocean Hotel", address: "1 Ocean Ave", checkInDate: "2026-10-15",
  checkOutDate: "2026-10-18", booked: true, totalCost: 725.5, currency: "EUR", bookingUrl: "https://example.com/booking",
  confirmationNumber: "HOTEL123", notes: "Late arrival" };

async function setup() {
  const t = convexTest(schema, modules);
  const [aliceId, bobId] = await t.run(async ctx => [
    await ctx.db.insert("users", { email: "alice@example.test" }),
    await ctx.db.insert("users", { email: "bob@example.test" }),
  ]);
  return { t, alice: t.withIdentity({ subject: `${aliceId}|session` }), bob: t.withIdentity({ subject: `${bobId}|session` }) };
}

test("lodging CRUD is scoped to the trip owner", async () => {
  const { t, alice, bob } = await setup();
  const tripId = await alice.mutation(api.trips.create, trip);
  const customCityStay = { ...stay, destination: "San Diego" };
  const lodgingId = await alice.mutation(api.lodgings.create, { tripId, lodging: customCityStay });
  expect(await alice.query(api.lodgings.list, { tripId })).toEqual([expect.objectContaining(customCityStay)]);
  await expect(t.query(api.lodgings.list, { tripId })).rejects.toThrow("unavailable");
  await expect(bob.mutation(api.lodgings.update, { lodgingId, lodging: { ...stay, name: "Taken over" } })).rejects.toThrow("unavailable");
  await alice.mutation(api.lodgings.update, { lodgingId, lodging: { ...stay, name: "Pacific Hotel", booked: false } });
  expect((await alice.query(api.lodgings.list, { tripId }))[0]).toMatchObject({ name: "Pacific Hotel", booked: false });
  await expect(bob.mutation(api.lodgings.remove, { lodgingId })).rejects.toThrow("unavailable");
  await alice.mutation(api.lodgings.remove, { lodgingId });
  expect(await alice.query(api.lodgings.list, { tripId })).toEqual([]);
});

test.each([
  { destination: " " }, { destination: "x".repeat(121) }, { name: " " }, { checkInDate: "2026-02-30" },
  { checkOutDate: "2026-10-15" }, { checkOutDate: "2026-10-23" },
  { totalCost: -1 }, { totalCost: 2.001 }, { currency: "BTC" }, { bookingUrl: "javascript:alert(1)" },
])("rejects invalid lodging details: %j", async changes => {
  const { alice } = await setup();
  const tripId = await alice.mutation(api.trips.create, trip);
  await expect(alice.mutation(api.lodgings.create, { tripId, lodging: { ...stay, ...changes } })).rejects.toThrow();
  expect(await alice.query(api.lodgings.list, { tripId })).toEqual([]);
});

test("deleting a trip schedules lodging cleanup", async () => {
  const { t, alice } = await setup();
  const tripId = await alice.mutation(api.trips.create, trip);
  await alice.mutation(api.lodgings.create, { tripId, lodging: stay });
  await alice.mutation(api.trips.remove, { tripId });
  await t.finishAllScheduledFunctions(() => {});
  expect(await t.run(ctx => ctx.db.query("lodgings").withIndex("by_tripId", q => q.eq("tripId", tripId)).collect())).toEqual([]);
});
