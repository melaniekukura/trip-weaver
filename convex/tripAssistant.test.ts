/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { flightPlanItinerary } from "./flightPlanFields";
import schema from "./schema";
import { promptContext } from "./tripAssistant";

const modules = import.meta.glob("./**/*.ts");
const trip = { name: "Japan", origin: "Detroit", destinations: ["Kyoto"], startDate: "2026-10-01",
  endDate: "2026-10-09", budget: 3000, currency: "USD", travelers: 2, interests: ["Food"] };

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

test("assistant context includes current flight selections and saved itinerary ideas", async () => {
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
    await ctx.db.patch("trips", tripId, { flightPlan: { revision: 1, confirmed: false,
      legs: [{ index: 0, itinerary: flightPlanItinerary(current), request, outbound, booked: false }] } });
    await ctx.db.insert("interestFavorites", { tripId, item: { kind: "activities", title: "Market tour",
      description: "Guided food market visit", venue: "Central Market", dates: "Daily", price: "$40",
      interest: "Food", url: "https://example.test/tour", destination: "Kyoto", retrievedAt: "2026-01-01" },
      itinerary: { date: "2026-10-04", time: "10:00", notes: "Meet at the entrance" } });
  });
  const claimed = await alice.mutation(internal.tripAssistant.claim, { tripId, requestId: "context-request" });
  if (claimed.kind !== "claimed") throw new Error("Expected a claimed assistant request.");
  const context = JSON.parse(promptContext(claimed.trip, claimed.favorites).split("\n").slice(1).join("\n"));
  expect(context.flightPlan.selections[0]).toMatchObject({ status: "selected_not_booked",
    outbound: { airline: "Example Air", amount: 900 } });
  expect(context.savedIdeas[0]).toMatchObject({ title: "Market tour",
    schedule: { date: "2026-10-04", time: "10:00", notes: "Meet at the entrance" } });
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
