/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { itineraryEmailContent } from "./itineraryEmailContent";
import { eventDetails } from "./agentmailWebhook";

const modules = import.meta.glob("./**/*.ts");
const trip = { name: "Japan <Fall>", origin: "Detroit", destinations: ["Kyoto"], startDate: "2026-10-01",
  endDate: "2026-10-09", budget: 3000, currency: "USD", travelers: 2, interests: ["Food"], accessibility: "Step-free routes" };

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const [aliceId, bobId] = await t.run(async ctx => [
    await ctx.db.insert("users", { email: "alice@example.test", emailVerificationTime: 1 }),
    await ctx.db.insert("users", { email: "bob@example.test", emailVerificationTime: 1 }),
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

test("owner can send an itinerary to a different validated email address", async () => {
  const { t, alice, tripId } = await setup();
  const deliveryId = await alice.mutation(api.itineraryEmails.request, {
    tripId, requestId: "alternate-recipient", recipient: "  Travel.Partner@Example.Test ",
  });
  expect(await t.run(async ctx => ctx.db.get("emailDeliveries", deliveryId)))
    .toMatchObject({ recipient: "travel.partner@example.test", status: "queued" });
  await expect(alice.mutation(api.itineraryEmails.request, {
    tripId, requestId: "invalid-recipient", recipient: "not-an-email",
  })).rejects.toThrow("INVALID_RECIPIENT");
});

test("a request identifier cannot be reused for a different recipient", async () => {
  const { alice, tripId } = await setup();
  await alice.mutation(api.itineraryEmails.request, {
    tripId, requestId: "recipient-bound", recipient: "first@example.test",
  });
  await expect(alice.mutation(api.itineraryEmails.request, {
    tripId, requestId: "recipient-bound", recipient: "second@example.test",
  })).rejects.toThrow("already in use");
});

test("anonymous and other users cannot request or read a trip email", async () => {
  const { t, alice, bob, tripId } = await setup();
  await expect(t.mutation(api.itineraryEmails.request, { tripId, requestId: "anonymous" })).rejects.toThrow("UNAUTHENTICATED");
  await expect(bob.mutation(api.itineraryEmails.request, { tripId, requestId: "other-user" })).rejects.toThrow("TRIP_NOT_FOUND");
  await expect(bob.query(api.itineraryEmails.latest, { tripId })).rejects.toThrow("TRIP_NOT_FOUND");
  expect(await alice.query(api.itineraryEmails.latest, { tripId })).toBeNull();
});

test("an unverified account cannot request an itinerary email", async () => {
  const { t, tripId } = await setup();
  const userId = await t.run(async ctx => ctx.db.insert("users", { email: "unverified@example.test" }));
  await t.run(async ctx => ctx.db.patch("trips", tripId, { ownerId: userId }));
  const user = t.withIdentity({ subject: `${userId}|session` });
  expect(await user.query(api.itineraryEmails.account)).toEqual({ email: "unverified@example.test", verified: false });
  expect(await user.query(api.itineraryEmails.latest, { tripId })).toBeNull();
  await expect(user.mutation(api.itineraryEmails.request, { tripId, requestId: "unverified" })).rejects.toThrow("EMAIL_UNVERIFIED");
});

test("only the owner can retry a failed delivery", async () => {
  const { t, alice, bob, tripId } = await setup();
  const deliveryId = await alice.mutation(api.itineraryEmails.request, { tripId, requestId: "retry-1" });
  await t.run(async ctx => ctx.db.patch("emailDeliveries", deliveryId, { status: "failed", attempts: 1, error: "Temporary failure" }));
  await expect(bob.mutation(api.itineraryEmails.retry, { deliveryId })).rejects.toThrow("TRIP_NOT_FOUND");
  await alice.mutation(api.itineraryEmails.retry, { deliveryId });
  expect(await t.run(async ctx => ctx.db.get("emailDeliveries", deliveryId))).toMatchObject({ status: "queued", attempts: 1 });
});

test("delivery webhooks are deduplicated and update reactive delivery status", async () => {
  const { t, alice, tripId } = await setup();
  const deliveryId = await alice.mutation(api.itineraryEmails.request, { tripId, requestId: "webhook-1" });
  await t.run(async ctx => ctx.db.patch("emailDeliveries", deliveryId, {
    status: "sent", agentmailMessageId: "message-1", agentmailThreadId: "thread-1", sentAt: 10,
  }));
  const event = { eventId: "event-1", eventType: "message.delivered" as const, messageId: "message-1", occurredAt: 20 };
  await t.mutation(internal.itineraryEmails.recordWebhook, event);
  await t.mutation(internal.itineraryEmails.recordWebhook, event);
  expect(await alice.query(api.itineraryEmails.latest, { tripId })).toMatchObject({ status: "delivered", deliveredAt: 20 });
  expect(await t.run(async ctx => ctx.db.query("agentmailWebhookEvents").withIndex("by_eventId", q => q.eq("eventId", "event-1")).take(10))).toHaveLength(1);
});

test("an early webhook is reconciled after AgentMail returns the message id", async () => {
  const { t, alice, tripId } = await setup();
  const deliveryId = await alice.mutation(api.itineraryEmails.request, { tripId, requestId: "webhook-race" });
  await t.mutation(internal.itineraryEmails.recordWebhook, {
    eventId: "event-early", eventType: "message.bounced", messageId: "message-race", occurredAt: 30, error: "Permanent: General",
  });
  await t.run(async ctx => ctx.db.patch("emailDeliveries", deliveryId, { status: "sending" }));
  await t.mutation(internal.itineraryEmails.finish, { deliveryId,
    result: { status: "sent", messageId: "message-race", threadId: "thread-race" } });
  expect(await alice.query(api.itineraryEmails.latest, { tripId })).toMatchObject({ status: "bounced", failedAt: 30, error: "Permanent: General" });
});

test("AgentMail webhook payloads are narrowed before storage", () => {
  expect(eventDetails({ event_id: "event-2", event_type: "message.rejected",
    reject: { message_id: "message-2", timestamp: "2026-09-17T20:00:00Z", reason: "Invalid recipient" } })).toEqual({
    eventId: "event-2", eventType: "message.rejected", messageId: "message-2",
    occurredAt: Date.parse("2026-09-17T20:00:00Z"), error: "Invalid recipient",
  });
  expect(eventDetails({ event_type: "message.delivered" })).toBeNull();
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
