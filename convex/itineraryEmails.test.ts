/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { itineraryEmailContent } from "./itineraryEmailContent";

const modules = import.meta.glob("./**/*.ts");
const trip = { name: "Japan <Fall>", origin: "Detroit", destinations: ["Kyoto"], startDate: "2026-10-01",
  endDate: "2026-10-09", budget: 3000, currency: "USD", travelers: 2, interests: ["Food"], accessibility: "Step-free routes" };

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const [aliceId, bobId] = await t.run(async ctx => [
    await ctx.db.insert("users", { email: "alice@example.test" }),
    await ctx.db.insert("users", { email: "bob@example.test" }),
  ]);
  const alice = t.withIdentity({ subject: `${aliceId}|session` });
  const bob = t.withIdentity({ subject: `${bobId}|session` });
  const tripId = await alice.mutation(api.trips.create, trip);
  const favoriteId = await t.run(async ctx => ctx.db.insert("interestFavorites", { tripId, item: {
    kind: "activities", title: "Tea & pottery", description: "Workshop", venue: "Studio", url: "https://example.com/tea",
    destination: "Kyoto", retrievedAt: "2026-09-01",
  }, itinerary: { date: "2026-10-03", time: "13:30", notes: "Arrive early" } }));
  return { t, alice, bob, tripId, favoriteId };
}

test("owner requests one immutable itinerary snapshot per request identifier", async () => {
  const { t, alice, tripId, favoriteId } = await setup();
  const first = await alice.mutation(api.itineraryEmails.request, { tripId, requestId: "request-1" });
  const duplicate = await alice.mutation(api.itineraryEmails.request, { tripId, requestId: "request-1" });
  expect(duplicate).toBe(first);
  const deliveries = await t.run(async ctx => ctx.db.query("emailDeliveries")
    .withIndex("by_tripId", q => q.eq("tripId", tripId)).take(10));
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0]).toMatchObject({ recipient: "alice@example.test", status: "queued", attempts: 0,
    snapshot: { name: trip.name, destinations: ["Kyoto"], items: [{ kind: "activity", title: "Tea & pottery",
      date: "2026-10-03", time: "13:30", notes: "Arrive early" }] } });
  expect(deliveries[0].snapshotVersion).toMatch(/^v1-[0-9a-f]{8}$/);
  await t.run(async ctx => ctx.db.patch("interestFavorites", favoriteId, { itinerary: { date: "2026-10-04" } }));
  const unchanged = await t.run(async ctx => ctx.db.get("emailDeliveries", first));
  expect(unchanged?.snapshot.items[0].date).toBe("2026-10-03");
});

test("anonymous and other users cannot request or read a trip email", async () => {
  const { t, alice, bob, tripId } = await setup();
  await expect(t.mutation(api.itineraryEmails.request, { tripId, requestId: "anonymous" })).rejects.toThrow("UNAUTHENTICATED");
  await expect(bob.mutation(api.itineraryEmails.request, { tripId, requestId: "other-user" })).rejects.toThrow("TRIP_NOT_FOUND");
  await expect(bob.query(api.itineraryEmails.latest, { tripId })).rejects.toThrow("TRIP_NOT_FOUND");
  expect(await alice.query(api.itineraryEmails.latest, { tripId })).toBeNull();
});

test("only the owner can retry a failed delivery", async () => {
  const { t, alice, bob, tripId } = await setup();
  const deliveryId = await alice.mutation(api.itineraryEmails.request, { tripId, requestId: "retry-1" });
  await t.run(async ctx => ctx.db.patch("emailDeliveries", deliveryId, { status: "failed", attempts: 1, error: "Temporary failure" }));
  await expect(bob.mutation(api.itineraryEmails.retry, { deliveryId })).rejects.toThrow("TRIP_NOT_FOUND");
  await alice.mutation(api.itineraryEmails.retry, { deliveryId });
  expect(await t.run(async ctx => ctx.db.get("emailDeliveries", deliveryId))).toMatchObject({ status: "queued", attempts: 1 });
});

test("email content includes text and escaped HTML", () => {
  const snapshot = { ...trip, items: [{ kind: "activity" as const, title: "Tea <Pottery>", location: "Kyoto & Gion",
    notes: "Bring <tickets>", url: "javascript:alert(1)" }] };
  const content = itineraryEmailContent(snapshot);
  expect(content.subject).toContain("Japan <Fall>");
  expect(content.text).toContain("Tea <Pottery>");
  expect(content.html).toContain("Japan &lt;Fall&gt;");
  expect(content.html).toContain("Tea &lt;Pottery&gt;");
  expect(content.html).not.toContain("javascript:");
});
