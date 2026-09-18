import { getAuthUserId } from "@convex-dev/auth/server";
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { agentMailEventType, itineraryEmailSnapshot } from "./emailSchema";
import { flightPlanItinerary } from "./flightPlanFields";
import schema from "./schema";

type ReadCtx = QueryCtx | MutationCtx;
const limiter = new RateLimiter(components.rateLimiter, {
  itineraryEmailUser: { kind: "token bucket", rate: 6, period: HOUR, capacity: 3 },
  itineraryEmailGlobal: { kind: "token bucket", rate: 100, period: HOUR, capacity: 20 },
});

async function requireUser(ctx: ReadCtx, requireVerified = false) {
  const userId = await getAuthUserId(ctx);
  const user = userId ? await ctx.db.get("users", userId) : null;
  if (!userId || !user) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to email an itinerary." });
  if (!user.email) throw new ConvexError({ code: "EMAIL_UNAVAILABLE", message: "Your account does not have an email address." });
  if (requireVerified && !user.emailVerificationTime) throw new ConvexError({ code: "EMAIL_UNVERIFIED", message: "Verify your account email before sending an itinerary." });
  return { userId, user };
}

async function requireTrip(ctx: ReadCtx, tripId: Id<"trips">, requireVerified = false) {
  const { userId, user } = await requireUser(ctx, requireVerified);
  const trip = await ctx.db.get("trips", tripId);
  if (!trip || trip.ownerId !== userId) throw new ConvexError({ code: "TRIP_NOT_FOUND", message: "This trip is unavailable." });
  return { trip, userId, user };
}

function flightTime(value: string) {
  return value.match(/^\d{1,2}:\d{2} [AP]M/)?.[0];
}

function timeValue(value?: string) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const twelveHour = value.match(/^(\d{1,2}):(\d{2}) ([AP]M)$/);
  if (twelveHour) return (Number(twelveHour[1]) % 12 + (twelveHour[3] === "PM" ? 12 : 0)) * 60 + Number(twelveHour[2]);
  const twentyFourHour = value.match(/^(\d{2}):(\d{2})$/);
  return twentyFourHour ? Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]) : Number.MAX_SAFE_INTEGER;
}

export function snapshotFor(trip: Doc<"trips">, favorites: Doc<"interestFavorites">[]) {
  const itinerary = flightPlanItinerary(trip);
  const items: Doc<"emailDeliveries">["snapshot"]["items"] = [];
  for (const leg of (trip.flightPlan?.legs ?? []).filter(item => item.booked && item.itinerary === itinerary)) {
    const outgoing = leg.outbound.flight;
    items.push({ kind: "transportation", date: leg.request.departureDate, time: flightTime(outgoing.departure),
      title: `${leg.request.origin} to ${leg.request.destination}`,
      location: `${outgoing.originAirport ?? leg.request.origin} → ${outgoing.destinationAirport ?? leg.request.destination}`,
      detail: `${outgoing.airline} · ${outgoing.duration} · ${outgoing.stops}`, reference: leg.reference });
    if (leg.request.tripType === "round-trip" && leg.request.returnDate && leg.returning) {
      const returning = leg.returning.flight;
      items.push({ kind: "transportation", date: leg.request.returnDate, time: flightTime(returning.departure),
        title: `${leg.request.destination} to ${leg.request.origin}`,
        location: `${returning.originAirport ?? leg.request.destination} → ${returning.destinationAirport ?? leg.request.origin}`,
        detail: `${returning.airline} · ${returning.duration} · ${returning.stops}`, reference: leg.reference });
    }
  }
  for (const favorite of favorites) {
    if (!favorite.itinerary) continue;
    items.push({ kind: "activity", date: favorite.itinerary.date, time: favorite.itinerary.time,
      title: favorite.item.title, location: favorite.item.destination, detail: favorite.item.venue,
      notes: favorite.itinerary.notes, url: favorite.item.url });
  }
  items.sort((left, right) => (left.date ?? "9999-99-99").localeCompare(right.date ?? "9999-99-99") ||
    timeValue(left.time) - timeValue(right.time) || left.title.localeCompare(right.title));
  return { name: trip.name, origin: trip.origin, destinations: trip.destinations, startDate: trip.startDate,
    endDate: trip.endDate, travelers: trip.travelers, budget: trip.budget, currency: trip.currency,
    ...(trip.accessibility ? { accessibility: trip.accessibility } : {}), items };
}

function snapshotVersion(snapshot: Doc<"emailDeliveries">["snapshot"]): string {
  const value = JSON.stringify(snapshot);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export const request = mutation({
  args: { tripId: v.id("trips"), requestId: v.string() },
  returns: v.id("emailDeliveries"),
  handler: async (ctx, { tripId, requestId }) => {
    const { trip, userId, user } = await requireTrip(ctx, tripId, true);
    if (!/^[A-Za-z0-9._~-]{1,128}$/.test(requestId)) throw new ConvexError({ message: "Invalid email request identifier." });
    const existing = await ctx.db.query("emailDeliveries").withIndex("by_ownerId_and_requestId", q => q.eq("ownerId", userId).eq("requestId", requestId)).unique();
    if (existing) {
      if (existing.tripId !== tripId) throw new ConvexError({ message: "This email request identifier is already in use." });
      return existing._id;
    }
    for (const [name, key] of [["itineraryEmailUser", userId], ["itineraryEmailGlobal", undefined]] as const) {
      const limit = await limiter.limit(ctx, name, { key });
      if (!limit.ok) throw new ConvexError({ message: `Email limit reached. Try again in ${Math.max(1, Math.ceil(limit.retryAfter / 60000))} minute(s).` });
    }
    const favorites = await ctx.db.query("interestFavorites").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(100);
    const snapshot = snapshotFor(trip, favorites);
    const now = Date.now();
    const deliveryId = await ctx.db.insert("emailDeliveries", { tripId, ownerId: userId, requestId,
      recipient: user.email!, snapshot, snapshotVersion: snapshotVersion(snapshot), status: "queued", attempts: 0, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.agentmail.sendItinerary, { deliveryId });
    return deliveryId;
  },
});

export const latest = query({
  args: { tripId: v.id("trips") },
  returns: v.union(v.null(), schema.doc("emailDeliveries")),
  handler: async (ctx, { tripId }) => {
    await requireTrip(ctx, tripId);
    return await ctx.db.query("emailDeliveries").withIndex("by_tripId", q => q.eq("tripId", tripId)).order("desc").first();
  },
});

export const account = query({
  args: {},
  returns: v.object({ email: v.string(), verified: v.boolean() }),
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    return { email: user.email!, verified: Boolean(user.emailVerificationTime) };
  },
});

export const retry = mutation({
  args: { deliveryId: v.id("emailDeliveries") },
  returns: v.null(),
  handler: async (ctx, { deliveryId }) => {
    const delivery = await ctx.db.get("emailDeliveries", deliveryId);
    if (!delivery) throw new ConvexError({ message: "This email delivery is unavailable." });
    const { userId } = await requireTrip(ctx, delivery.tripId, true);
    if (delivery.ownerId !== userId) throw new ConvexError({ message: "This email delivery is unavailable." });
    if (delivery.status !== "failed") throw new ConvexError({ message: "Only failed deliveries can be retried." });
    if (delivery.attempts >= 3) throw new ConvexError({ message: "This delivery cannot be retried again. Request a new email instead." });
    await ctx.db.patch("emailDeliveries", deliveryId, { status: "queued", error: undefined, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.agentmail.sendItinerary, { deliveryId });
    return null;
  },
});

export const claim = internalMutation({
  args: { deliveryId: v.id("emailDeliveries") },
  returns: v.union(v.null(), schema.doc("emailDeliveries")),
  handler: async (ctx, { deliveryId }) => {
    const delivery = await ctx.db.get("emailDeliveries", deliveryId);
    if (!delivery || delivery.status !== "queued") return null;
    if (!await ctx.db.get("trips", delivery.tripId)) {
      await ctx.db.delete("emailDeliveries", deliveryId);
      return null;
    }
    await ctx.db.patch("emailDeliveries", deliveryId, { status: "sending", attempts: delivery.attempts + 1, updatedAt: Date.now() });
    return { ...delivery, status: "sending" as const, attempts: delivery.attempts + 1 };
  },
});

export const finish = internalMutation({
  args: { deliveryId: v.id("emailDeliveries"), result: v.union(
    v.object({ status: v.literal("sent"), messageId: v.string(), threadId: v.string() }),
    v.object({ status: v.literal("failed"), error: v.string() }),
  ) },
  returns: v.null(),
  handler: async (ctx, { deliveryId, result }) => {
    const delivery = await ctx.db.get("emailDeliveries", deliveryId);
    if (!delivery || delivery.status !== "sending") return null;
    const now = Date.now();
    if (result.status === "failed") {
      await ctx.db.patch("emailDeliveries", deliveryId, { status: "failed", error: result.error.slice(0, 500), failedAt: now, updatedAt: now });
      return null;
    }
    const events = await ctx.db.query("agentmailWebhookEvents").withIndex("by_messageId", q => q.eq("messageId", result.messageId)).take(20);
    let status: Doc<"emailDeliveries">["status"] = "sent";
    let error: string | undefined;
    let deliveredAt: number | undefined;
    let failedAt: number | undefined;
    for (const event of events) {
      if (event.eventType === "message.delivered" && status === "sent") {
        status = "delivered"; deliveredAt = event.occurredAt ?? event.receivedAt;
      } else if (event.eventType === "message.bounced" || event.eventType === "message.rejected") {
        status = event.eventType === "message.bounced" ? "bounced" : "rejected";
        error = event.error; failedAt = event.occurredAt ?? event.receivedAt;
      }
      await ctx.db.patch("agentmailWebhookEvents", event._id, { processed: true, deliveryId });
    }
    await ctx.db.patch("emailDeliveries", deliveryId, { status, agentmailMessageId: result.messageId,
      agentmailThreadId: result.threadId, sentAt: now, deliveredAt, failedAt, error, updatedAt: now });
    return null;
  },
});

export const recordWebhook = internalMutation({
  args: { eventId: v.string(), eventType: agentMailEventType, messageId: v.string(),
    occurredAt: v.optional(v.number()), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.query("agentmailWebhookEvents").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).unique()) return null;
    const delivery = await ctx.db.query("emailDeliveries").withIndex("by_agentmailMessageId", q => q.eq("agentmailMessageId", args.messageId)).unique();
    const now = Date.now();
    const eventId = await ctx.db.insert("agentmailWebhookEvents", { ...args, processed: Boolean(delivery),
      ...(delivery ? { deliveryId: delivery._id } : {}), receivedAt: now });
    if (!delivery) return null;
    const occurredAt = args.occurredAt ?? now;
    if (args.eventType === "message.sent") {
      if (delivery.status === "queued" || delivery.status === "sending") {
        await ctx.db.patch("emailDeliveries", delivery._id, { status: "sent", sentAt: occurredAt, updatedAt: now });
      }
    } else if (args.eventType === "message.delivered") {
      if (delivery.status !== "bounced" && delivery.status !== "rejected") {
        await ctx.db.patch("emailDeliveries", delivery._id, { status: "delivered", deliveredAt: occurredAt, updatedAt: now });
      }
    } else {
      await ctx.db.patch("emailDeliveries", delivery._id, { status: args.eventType === "message.bounced" ? "bounced" : "rejected",
        error: args.error?.slice(0, 500), failedAt: occurredAt, updatedAt: now });
    }
    await ctx.db.patch("agentmailWebhookEvents", eventId, { processed: true });
    return null;
  },
});

export const cleanupTrip = internalMutation({
  args: { tripId: v.id("trips") },
  returns: v.null(),
  handler: async (ctx, { tripId }) => {
    if (await ctx.db.get("trips", tripId)) return null;
    const deliveries = await ctx.db.query("emailDeliveries").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(20);
    for (const delivery of deliveries) await ctx.db.delete("emailDeliveries", delivery._id);
    if (deliveries.length === 20) await ctx.scheduler.runAfter(0, internal.itineraryEmails.cleanupTrip, { tripId });
    return null;
  },
});
