/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
const details = { homeReturnNotNeededFor: JSON.stringify(["DTW", ["LAX"], "2026-10-15", "2026-10-22"]), name: "Trip", origin: "DTW", destinations: ["LAX"], startDate: "2026-10-15", endDate: "2026-10-22",
  budget: null, currency: "USD", travelers: 1, interests: [] };

async function setup(roundTrip = false) {
  const t = convexTest(schema, modules);
  const [owner, other] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const user = t.withIdentity({ subject: `${owner}|session` });
  const stranger = t.withIdentity({ subject: `${other}|session` });
  const tripId = await user.mutation(api.trips.create, roundTrip ? { ...details, homeReturnNotNeededFor: "" } : details);
  const source = await t.run(async ctx => {
    const runId = await ctx.db.insert("researchRuns", { tripId, ownerId: owner, destination: "LAX", topic: "flights", status: "completed",
      flightRequest: { origin: "DTW", destination: "LAX", departureDate: details.startDate, ...(roundTrip ? { tripType: "round-trip" as const, returnDate: details.endDate } : {}) },
      searchKey: "test", query: "test", tripUpdatedAt: 0 });
    return await ctx.db.insert("researchSources", { tripId, runId, title: "Delta", category: "flights", description: "", destination: "LAX",
      sourceUrl: "https://www.google.com/travel/flights", retrievedAt: "2026-09-12", flight: { airline: "Delta", departure: "8:00 AM", arrival: "10:00 AM", duration: "5 hr", stops: "Nonstop", amount: 129, currency: "USD" } });
  });
  const change = (action: "select" | "book" | "edit" | "clear" | "confirm", revision: number) => user.mutation(api.trips.changeFlightPlan,
    { tripId, index: 0, revision, action, ...(action === "select" ? { outboundId: source } : {}) });
  return { t, user, stranger, tripId, source, change };
}

test("selection, booking, confirmation and editing persist and clear confirmation", async () => {
  const { user, tripId, change } = await setup();
  await expect(change("confirm", 0)).rejects.toThrow("Book every current leg");
  await change("select", 0);
  await expect(change("confirm", 1)).rejects.toThrow();
  await change("book", 1);
  let trip = await user.query(api.trips.get, { tripId });
  expect(trip.flightPlan?.legs[0]).toMatchObject({ booked: true, reference: expect.stringMatching(/^TW-/) });
  await expect(change("select", 2)).rejects.toThrow("Edit the booked leg");
  await change("confirm", 2);
  expect((await user.query(api.trips.get, { tripId })).flightPlan?.confirmed).toBe(true);
  await change("edit", 3);
  trip = await user.query(api.trips.get, { tripId });
  expect(trip.flightPlan?.confirmed).toBe(false);
  expect(trip.flightPlan?.legs[0].booked).toBe(false);
  expect(trip.flightPlan?.legs[0].reference).toBeUndefined();
  await expect(change("book", 3)).rejects.toThrow("changed");
});

test("route edits invalidate final plans and stale bookings cannot be reconfirmed", async () => {
  const { user, tripId, change } = await setup();
  await change("select", 0); await change("book", 1); await change("confirm", 2);
  const trip = await user.query(api.trips.get, { tripId });
  await user.mutation(api.trips.update, { tripId, expectedUpdatedAt: trip.updatedAt, changes: { ...details, destinations: ["JFK"] } });
  expect((await user.query(api.trips.get, { tripId })).flightPlan?.confirmed).toBe(false);
  await expect(change("confirm", 4)).rejects.toThrow("Book every current leg");
  await expect(change("book", 4)).rejects.toThrow("Search and select");
  await expect(change("select", 4)).rejects.toThrow("completed search for this leg");
});

test("round trips require a matching return before booking", async () => {
  const { change } = await setup(true);
  await change("select", 0);
  await expect(change("book", 1)).rejects.toThrow("Select a return flight");
});

test("other users cannot modify a flight plan or inject another trip's flight", async () => {
  const { t, user, stranger, tripId, source } = await setup();
  const args = { tripId, index: 0, revision: 0, action: "select" as const, outboundId: source };
  await expect(stranger.mutation(api.trips.changeFlightPlan, args)).rejects.toThrow();
  await expect(t.mutation(api.trips.changeFlightPlan, args)).rejects.toThrow();
  const otherTripId = await user.mutation(api.trips.create, details);
  await expect(user.mutation(api.trips.changeFlightPlan, { ...args, tripId: otherTripId })).rejects.toThrow();
});

test("a round trip can be booked and confirmed once its matching return is selected", async () => {
  const { t, user, tripId, source, change } = await setup(true);
  const returnId = await t.run(async ctx => {
    const outgoing = (await ctx.db.get("researchSources", source))!;
    const run = (await ctx.db.get("researchRuns", outgoing.runId))!;
    const { _id: _runId, _creationTime: _runTime, ...runFields } = run;
    const runId = await ctx.db.insert("researchRuns", { ...runFields, outboundSourceId: source });
    const { _id: _sourceId, _creationTime: _sourceTime, ...sourceFields } = outgoing;
    return await ctx.db.insert("researchSources", { ...sourceFields, runId });
  });
  await user.mutation(api.trips.changeFlightPlan, { tripId, index: 0, revision: 0, action: "select", outboundId: source, returnId });
  await change("book", 1); await change("confirm", 2);
  const trip = await user.query(api.trips.get, { tripId });
  expect(trip.flightPlan?.confirmed).toBe(true);
  expect(trip.flightPlan?.legs[0].returning?._id).toBe(returnId);
});

test("confirmation requires every leg, and unrelated trip edits preserve confirmation", async () => {
  const { user, tripId, change } = await setup();
  await change("select", 0); await change("book", 1); await change("confirm", 2);
  let trip = await user.query(api.trips.get, { tripId });
  await user.mutation(api.trips.update, { tripId, expectedUpdatedAt: trip.updatedAt, changes: { ...details, name: "New name" } });
  trip = await user.query(api.trips.get, { tripId });
  expect(trip.flightPlan?.confirmed).toBe(true);
  await user.mutation(api.trips.update, { tripId, expectedUpdatedAt: trip.updatedAt, changes: { ...details, destinations: ["LAX", "JFK"] } });
  await expect(change("confirm", 4)).rejects.toThrow("Book every current leg");
});

test("stale bookings can be unmarked without making them valid for the changed itinerary", async () => {
  const { user, tripId, change } = await setup();
  await change("select", 0); await change("book", 1); await change("confirm", 2);
  const trip = await user.query(api.trips.get, { tripId });
  await user.mutation(api.trips.update, { tripId, expectedUpdatedAt: trip.updatedAt, changes: { ...details, destinations: ["LAX", "JFK"] } });
  await change("edit", 4);
  const edited = await user.query(api.trips.get, { tripId });
  expect(edited.flightPlan?.legs[0].booked).toBe(false);
  expect(edited.flightPlan?.confirmed).toBe(false);
  await expect(change("book", 5)).rejects.toThrow("Search and select");
  await expect(change("confirm", 5)).rejects.toThrow("Book every current leg");
});

test("one-way plans cannot confirm until home travel is explicitly addressed", async () => {
  const { user, tripId, change } = await setup();
  let trip = await user.query(api.trips.get, { tripId });
  await user.mutation(api.trips.update, { tripId, expectedUpdatedAt: trip.updatedAt, changes: { ...details, homeReturnNotNeededFor: "" } });
  await change("select", 0); await change("book", 1);
  await expect(change("confirm", 2)).rejects.toThrow("journey home");
  trip = await user.query(api.trips.get, { tripId });
  await user.mutation(api.trips.update, { tripId, expectedUpdatedAt: trip.updatedAt, changes: details });
  await change("confirm", 3);
  trip = await user.query(api.trips.get, { tripId });
  expect(trip.homeReturnNotNeededFor).toBe(details.homeReturnNotNeededFor);
  expect(trip.flightPlan?.confirmed).toBe(true);
  await user.mutation(api.trips.update, { tripId, expectedUpdatedAt: trip.updatedAt, changes: { ...details, homeReturnNotNeededFor: "" } });
  expect((await user.query(api.trips.get, { tripId })).flightPlan?.confirmed).toBe(false);
  await expect(change("confirm", 5)).rejects.toThrow("journey home");
});

test("an appended home leg must be selected and booked before confirming", async () => {
  const { t, user, tripId, source, change } = await setup();
  let trip = await user.query(api.trips.get, { tripId });
  await user.mutation(api.trips.update, { tripId, expectedUpdatedAt: trip.updatedAt, changes: { ...details, destinations: ["LAX", "DTW"], homeReturnNotNeededFor: "" } });
  await change("select", 0); await change("book", 1);
  await expect(change("confirm", 2)).rejects.toThrow("Book every current leg");
  const homeId = await t.run(async ctx => {
    const outgoing = (await ctx.db.get("researchSources", source))!;
    const run = (await ctx.db.get("researchRuns", outgoing.runId))!;
    const { _id, _creationTime, ...fields } = run;
    const runId = await ctx.db.insert("researchRuns", { ...fields, flightRequest: { origin: "LAX", destination: "DTW", departureDate: details.endDate } });
    const { _id: id, _creationTime: creation, ...sourceFields } = outgoing;
    return ctx.db.insert("researchSources", { ...sourceFields, runId });
  });
  await user.mutation(api.trips.changeFlightPlan, { tripId, index: 1, revision: 2, action: "select", outboundId: homeId });
  await user.mutation(api.trips.changeFlightPlan, { tripId, index: 1, revision: 3, action: "book" });
  await change("confirm", 4);
  trip = await user.query(api.trips.get, { tripId });
  expect(trip.flightPlan?.confirmed).toBe(true);
});

test("multi-city legs reject a round-trip selection that would return before the final stop", async () => {
  const { user, tripId, change } = await setup(true);
  const trip = await user.query(api.trips.get, { tripId });
  await user.mutation(api.trips.update, { tripId, expectedUpdatedAt: trip.updatedAt, changes: { ...details, destinations: ["LAX", "JFK"] } });
  await expect(change("select", 0)).rejects.toThrow("one-way flights for each leg");
});
