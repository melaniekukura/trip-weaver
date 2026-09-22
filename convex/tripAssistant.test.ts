/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { flightPlanItinerary } from "./flightPlanFields";
import schema from "./schema";
import { assistantTripContext, promptContext } from "./tripAssistant";

const modules = import.meta.glob("./**/*.ts");
const trip = { name: "Japan", origin: "Detroit", destinations: ["Kyoto"], startDate: "2026-10-01",
  endDate: "2026-10-09", budget: 3000, currency: "USD", travelers: 2, interests: ["Food"],
  accessibility: "Step-free access\nQuiet environments" };

async function setup() {
  const t = convexTest(schema, modules);
  agentTest.register(t);
  rateLimiterTest.register(t);
  const [aliceId, bobId] = await t.run(async ctx => [
    await ctx.db.insert("users", { email: "alice@example.test" }),
    await ctx.db.insert("users", { email: "bob@example.test" }),
  ]);
  const alice = t.withIdentity({ subject: `${aliceId}|session` });
  const bob = t.withIdentity({ subject: `${bobId}|session` });
  const tripId = await alice.mutation(api.trips.create, trip);
  return { t, alice, bob, tripId };
}

test("a trip owner gets one durable assistant thread and request", async () => {
  const { t, alice, tripId } = await setup();
  const first = await alice.mutation(internal.tripAssistant.claim, { tripId, requestId: "request-1" });
  expect(first.kind).toBe("claimed");
  const duplicate = await alice.mutation(internal.tripAssistant.claim, { tripId, requestId: "request-1" });
  expect(duplicate).toMatchObject({ kind: "duplicate", threadId: first.threadId, status: "pending" });
  expect(await alice.query(api.tripAssistant.session, { tripId })).toMatchObject({ threadId: first.threadId, status: "pending" });
  expect(await t.run(async ctx => ctx.db.query("assistantThreads").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(10))).toHaveLength(1);
  expect(await t.run(async ctx => ctx.db.query("assistantRequests").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(10))).toHaveLength(1);
});

test("assistant receives a read-only itinerary without lodging or financial data", async () => {
  const { t, alice, tripId } = await setup();
  await t.run(async ctx => {
    const current = (await ctx.db.get("trips", tripId))!;
    const request = { origin: "DTW", destination: "NRT", departureDate: "2026-10-01" };
    const runId = await ctx.db.insert("researchRuns", { tripId, ownerId: current.ownerId, destination: "NRT",
      topic: "flights", flightRequest: request, searchKey: "flight-context", query: "test",
      tripUpdatedAt: current.updatedAt, status: "completed" });
    const sourceId = await ctx.db.insert("researchSources", { tripId, runId, title: "Example Air", category: "flights",
      description: "Nonstop", destination: "NRT", sourceUrl: "https://example.test/flight", retrievedAt: "2026-01-01",
      flight: { airline: "Example Air", departure: "9:00 AM on Thu, Oct 1", arrival: "1:00 PM on Fri, Oct 2",
        duration: "14 hr", stops: "Nonstop", amount: 900, currency: "USD", originAirport: "DTW", destinationAirport: "NRT" } });
    const outbound = (await ctx.db.get("researchSources", sourceId))!;
    await ctx.db.patch("trips", tripId, { expenses: [{ id: "private-cost", name: "Private expense", category: "Miscellaneous",
      amount: 1234, currency: "USD", date: "2026-10-03", revision: 1 }], flightPlan: { revision: 1, confirmed: false,
      legs: [{ index: 0, itinerary: flightPlanItinerary(current), request, outbound, booked: false, reference: "PRIVATE-BOOKING" }] } });
    await ctx.db.insert("interestFavorites", { tripId, item: { kind: "activities", title: "Market tour",
      description: "Guided food market visit", venue: "Central Market", dates: "Daily", price: "$40",
      interest: "Food", url: "https://example.test/tour", destination: "Kyoto", retrievedAt: "2026-01-01" },
      itinerary: { date: "2026-10-04", time: "10:00", notes: "Meet at the entrance" } });
    await ctx.db.insert("interestFavorites", { tripId, item: { kind: "activities", title: "Temple visit",
      description: "Historic temple", venue: "North Temple", price: "$25", interest: "History",
      url: "https://example.test/temple", destination: "Kyoto", retrievedAt: "2026-01-01" },
      itinerary: { date: "2026-10-05" } });
    await ctx.db.insert("interestFavorites", { tripId, item: { kind: "events", title: "Evening festival",
      description: "Neighborhood festival", url: "https://example.test/festival", destination: "Kyoto",
      retrievedAt: "2026-01-01" } });
    await ctx.db.insert("lodgings", { tripId, type: "hotel", destination: "Kyoto",
      name: "PRIVATE LODGING", checkInDate: "2026-10-01", checkOutDate: "2026-10-09", booked: true,
      currency: "USD", updatedAt: Date.now() });
  });
  const claimed = await alice.mutation(internal.tripAssistant.claim, { tripId, requestId: "context-request" });
  if (claimed.kind !== "claimed") throw new Error("Expected a claimed assistant request.");
  const context = assistantTripContext(claimed.trip, claimed.favorites);
  expect(context.trip).toMatchObject({ origin: "Detroit", destinations: ["Kyoto"], startDate: "2026-10-01",
    endDate: "2026-10-09", interests: ["Food"], accessibilityRequirements: ["step-free access", "quiet environments"] });
  expect(context.itinerary.flights[0]).toMatchObject({ status: "selected_not_booked", outbound: {
    origin: "DTW", destination: "NRT", date: "2026-10-01", departure: "9:00 AM on Thu, Oct 1",
    arrival: "1:00 PM on Fri, Oct 2", airline: "Example Air" } });
  expect(context.itinerary.activities).toEqual(expect.arrayContaining([
    expect.objectContaining({ title: "Market tour", location: { destination: "Kyoto", venue: "Central Market" },
      schedule: { date: "2026-10-04", time: "10:00", status: "scheduled" } }),
    expect.objectContaining({ title: "Temple visit",
      schedule: { date: "2026-10-05", time: null, status: "time_not_designated" } }),
    expect.objectContaining({ title: "Evening festival",
      schedule: { date: null, time: null, status: "saved_unscheduled" } }),
  ]));
  const serialized = JSON.stringify(context);
  for (const forbidden of ["budget", "currency", "amount", "price", "expense", "PRIVATE-BOOKING", "PRIVATE LODGING", "$40", "900"]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(promptContext(claimed.trip, claimed.favorites)).toContain("Current read-only Trip-Weaver itinerary context");
});

test("assistant conversations are private to the trip owner", async () => {
  const { t, alice, bob, tripId } = await setup();
  const claimed = await alice.mutation(internal.tripAssistant.claim, { tripId, requestId: "owner-request" });
  await expect(t.mutation(internal.tripAssistant.claim, { tripId, requestId: "anonymous" })).rejects.toThrow("TRIP_NOT_FOUND");
  await expect(bob.mutation(internal.tripAssistant.claim, { tripId, requestId: "other-user" })).rejects.toThrow("TRIP_NOT_FOUND");
  await expect(bob.query(api.tripAssistant.session, { tripId })).rejects.toThrow("TRIP_NOT_FOUND");
  await expect(bob.query(api.tripAssistant.messages, { tripId, threadId: claimed.threadId,
    paginationOpts: { cursor: null, numItems: 10 } })).rejects.toThrow("TRIP_NOT_FOUND");
});

test("assistant request completion and trip cleanup are recorded", async () => {
  const { t, alice, tripId } = await setup();
  const claimed = await alice.mutation(internal.tripAssistant.claim, { tripId, requestId: "finish-request" });
  if (claimed.kind !== "claimed") throw new Error("Expected a claimed assistant request.");
  await t.mutation(internal.tripAssistant.finish, { requestDocId: claimed.requestDocId });
  expect(await alice.query(api.tripAssistant.session, { tripId })).toMatchObject({ status: "completed", error: null });
  await t.run(async ctx => ctx.db.delete("trips", tripId));
  await t.mutation(internal.tripAssistant.cleanupTrip, { tripId });
  expect(await t.run(async ctx => ctx.db.query("assistantThreads").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(10))).toEqual([]);
  expect(await t.run(async ctx => ctx.db.query("assistantRequests").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(10))).toEqual([]);
});
