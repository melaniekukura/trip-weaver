import { extractText, listMessages } from "@convex-dev/agent";
import { getAuthUserId } from "@convex-dev/auth/server";
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { accessibilityRequirements } from "./accessibility";
import { flightPlanItinerary } from "./flightPlanFields";
import schema from "./schema";
import { tripAgent, tripAgentInstructions } from "./tripAgent";

type RequestStatus = "pending" | "completed" | "failed";
type ClaimResult = { kind: "duplicate"; threadId: string; status: RequestStatus } | {
  kind: "claimed"; requestDocId: Id<"assistantRequests">; threadId: string;
  ownerId: Id<"users">; trip: Doc<"trips">; favorites: Doc<"interestFavorites">[];
};

const limiter = new RateLimiter(components.rateLimiter, {
  assistantUser: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },
  assistantGlobal: { kind: "token bucket", rate: 100, period: HOUR, capacity: 20 },
});
const requestStatus = v.union(v.literal("pending"), v.literal("completed"), v.literal("failed"));
const messageStatus = v.union(v.literal("pending"), v.literal("success"), v.literal("failed"));
const messageRole = v.union(v.literal("system"), v.literal("user"), v.literal("assistant"), v.literal("tool"));
const message = v.object({ id: v.string(), role: messageRole, text: v.string(), status: messageStatus, createdAt: v.number() });
const page = v.object({ page: v.array(message), isDone: v.boolean(), continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())) });

async function ownedTrip(ctx: QueryCtx | MutationCtx, tripId: Id<"trips">) {
  const ownerId = await getAuthUserId(ctx);
  const trip = await ctx.db.get("trips", tripId);
  if (!ownerId || !trip || trip.ownerId !== ownerId) {
    throw new ConvexError({ code: "TRIP_NOT_FOUND", message: "This trip is unavailable." });
  }
  return { ownerId, trip };
}

function flightDetails(flight: Doc<"researchSources">["flight"], origin: string, destination: string, date?: string) {
  return {
    origin: flight.originAirport ?? origin,
    destination: flight.destinationAirport ?? destination,
    date: date ?? null,
    departure: flight.departure,
    arrival: flight.arrival,
    duration: flight.duration,
    stops: flight.stops,
    airline: flight.airline,
  };
}

export function assistantTripContext(trip: Doc<"trips">, favorites: Doc<"interestFavorites">[]) {
  const itinerary = flightPlanItinerary(trip);
  const flights = (trip.flightPlan?.legs ?? []).filter(leg => leg.itinerary === itinerary).map(leg => ({
    routeIndex: leg.index,
    status: leg.booked ? "booked" : "selected_not_booked",
    tripType: leg.request.tripType ?? "one-way",
    travelers: leg.request.travelers ?? trip.travelers,
    outbound: flightDetails(leg.outbound.flight, leg.request.origin, leg.request.destination, leg.request.departureDate),
    returning: leg.returning ? flightDetails(leg.returning.flight, leg.request.destination, leg.request.origin,
      leg.request.returnDate) : null,
  }));
  const activities = favorites.map(favorite => ({
    kind: favorite.item.kind,
    title: favorite.item.title,
    location: { destination: favorite.item.destination, venue: favorite.item.venue ?? null },
    availableDates: favorite.item.dates ?? null,
    interest: favorite.item.interest ?? null,
    schedule: {
      date: favorite.itinerary?.date ?? null,
      time: favorite.itinerary?.time ?? null,
      status: !favorite.itinerary ? "saved_unscheduled" : favorite.itinerary.time ? "scheduled" : "time_not_designated",
    },
    accessibility: (favorite.item.accessibilityEvidence ?? []).map(evidence => ({
      requirement: evidence.requirement,
      status: evidence.conforms ? "confirmed_match" : "confirmed_mismatch",
    })),
  }));
  return {
    trip: { name: trip.name, origin: trip.origin, destinations: trip.destinations,
      startDate: trip.startDate, endDate: trip.endDate, travelers: trip.travelers,
      interests: trip.interests, accessibilityRequirements: accessibilityRequirements(trip.accessibility) },
    itinerary: { flights, activities },
  };
}

export function promptContext(trip: Doc<"trips">, favorites: Doc<"interestFavorites">[]) {
  return `Current read-only Trip-Weaver itinerary context:\n${JSON.stringify(assistantTripContext(trip, favorites))}`;
}

function assistantError(error: unknown) {
  const detail = error instanceof Error ? error.message : "";
  if (/429|rate.?limit/i.test(detail)) return "The free assistant limit is busy. Please try again shortly.";
  if (/EMPTY_ASSISTANT_RESPONSE/.test(detail)) return "The free assistant returned no answer. Please try again.";
  return "The travel assistant is temporarily unavailable. Please try again.";
}

function providerErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { type: typeof error };
  const value = error as Record<string, unknown>;
  return {
    name: typeof value.name === "string" ? value.name : undefined,
    message: typeof value.message === "string" ? value.message.slice(0, 500) : undefined,
    statusCode: typeof value.statusCode === "number" ? value.statusCode : undefined,
    code: typeof value.code === "string" || typeof value.code === "number" ? String(value.code) : undefined,
  };
}

export const session = query({
  args: { tripId: v.id("trips") },
  returns: v.union(v.null(), v.object({ threadId: v.string(), status: v.union(requestStatus, v.null()),
    error: v.union(v.string(), v.null()) })),
  handler: async (ctx, { tripId }) => {
    await ownedTrip(ctx, tripId);
    const thread = await ctx.db.query("assistantThreads").withIndex("by_tripId", q => q.eq("tripId", tripId)).unique();
    if (!thread) return null;
    const latest = await ctx.db.query("assistantRequests").withIndex("by_tripId", q => q.eq("tripId", tripId)).order("desc").first();
    return { threadId: thread.threadId, status: latest?.status ?? null, error: latest?.error ?? null };
  },
});

export const messages = query({
  args: { tripId: v.id("trips"), threadId: v.string(), paginationOpts: paginationOptsValidator },
  returns: page,
  handler: async (ctx, args) => {
    await ownedTrip(ctx, args.tripId);
    const thread = await ctx.db.query("assistantThreads").withIndex("by_tripId", q => q.eq("tripId", args.tripId)).unique();
    if (!thread || thread.threadId !== args.threadId) throw new ConvexError({ message: "This conversation is unavailable." });
    const result = await listMessages(ctx, components.agent, { threadId: args.threadId,
      paginationOpts: args.paginationOpts, excludeToolMessages: true });
    return { ...result, page: result.page.map(item => ({ id: item._id, role: item.message?.role ?? "assistant",
      text: item.message ? extractText(item.message) ?? "" : "", status: item.status, createdAt: item._creationTime })) };
  },
});

export const claim = internalMutation({
  args: { tripId: v.id("trips"), requestId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal("duplicate"), threadId: v.string(), status: requestStatus }),
    v.object({ kind: v.literal("claimed"), requestDocId: v.id("assistantRequests"),
      threadId: v.string(), ownerId: v.id("users"), trip: schema.doc("trips"),
      favorites: v.array(schema.doc("interestFavorites")) }),
  ),
  handler: async (ctx, { tripId, requestId }) => {
    const { ownerId, trip } = await ownedTrip(ctx, tripId);
    const existing = await ctx.db.query("assistantRequests").withIndex("by_ownerId_and_requestId",
      q => q.eq("ownerId", ownerId).eq("requestId", requestId)).unique();
    if (existing) {
      if (existing.tripId !== tripId) throw new ConvexError({ message: "This assistant request identifier is already in use." });
      return { kind: "duplicate" as const, threadId: existing.threadId, status: existing.status };
    }
    const thread = await ctx.db.query("assistantThreads").withIndex("by_tripId", q => q.eq("tripId", tripId)).unique();
    let threadId = thread?.threadId;
    if (!threadId) {
      ({ threadId } = await tripAgent.createThread(ctx, { userId: ownerId, title: trip.name.slice(0, 120) }));
      await ctx.db.insert("assistantThreads", { tripId, ownerId, threadId, updatedAt: Date.now() });
    }
    for (const [name, key] of [["assistantUser", ownerId], ["assistantGlobal", undefined]] as const) {
      const status = await limiter.limit(ctx, name, { key });
      if (!status.ok) throw new ConvexError({ message: `Assistant limit reached. Try again in ${Math.max(1, Math.ceil(status.retryAfter / 60000))} minute(s).` });
    }
    const requestDocId = await ctx.db.insert("assistantRequests", { tripId, ownerId, threadId, requestId,
      status: "pending", attempts: 1, updatedAt: Date.now() });
    const favorites = await ctx.db.query("interestFavorites").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(100);
    return { kind: "claimed" as const, requestDocId, threadId, ownerId, trip, favorites };
  },
});

export const finish = internalMutation({
  args: { requestDocId: v.id("assistantRequests"), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, { requestDocId, error }) => {
    const request = await ctx.db.get("assistantRequests", requestDocId);
    if (!request || request.status !== "pending") return null;
    await ctx.db.patch("assistantRequests", requestDocId, { status: error ? "failed" : "completed",
      ...(error ? { error: error.slice(0, 300) } : {}), updatedAt: Date.now() });
    return null;
  },
});

export const send = action({
  args: { tripId: v.id("trips"), requestId: v.string(), prompt: v.string() },
  returns: v.object({ threadId: v.string(), status: requestStatus }),
  handler: async (ctx, { tripId, requestId, prompt }): Promise<{ threadId: string; status: RequestStatus }> => {
    prompt = prompt.trim();
    if (!prompt || prompt.length > 2000) throw new ConvexError({ message: "Enter a message between 1 and 2,000 characters." });
    if (!/^[A-Za-z0-9._~-]{1,128}$/.test(requestId)) throw new ConvexError({ message: "Invalid assistant request identifier." });
    if (!process.env.OPENROUTER_API_KEY?.trim()) throw new ConvexError({ message: "The travel assistant is not configured yet." });
    const claimed: ClaimResult = await ctx.runMutation(internal.tripAssistant.claim, { tripId, requestId });
    if (claimed.kind === "duplicate") return { threadId: claimed.threadId, status: claimed.status };
    try {
      const result = await tripAgent.generateText(ctx, { threadId: claimed.threadId, userId: claimed.ownerId }, {
        prompt, instructions: `${tripAgentInstructions}\n\n${promptContext(claimed.trip, claimed.favorites)}`,
        maxOutputTokens: 1600,
        providerOptions: { openrouter: { reasoning: { effort: "none", exclude: true } } },
      });
      if (!result.text.trim()) throw new Error(`EMPTY_ASSISTANT_RESPONSE:${result.finishReason}`);
      await ctx.runMutation(internal.tripAssistant.finish, { requestDocId: claimed.requestDocId });
      return { threadId: claimed.threadId, status: "completed" as const };
    } catch (error) {
      const message = assistantError(error);
      console.error("Trip assistant provider failure", providerErrorDetails(error));
      await ctx.runMutation(internal.tripAssistant.finish, { requestDocId: claimed.requestDocId, error: message });
      throw new ConvexError({ message });
    }
  },
});

export const cleanupTrip = internalMutation({
  args: { tripId: v.id("trips") }, returns: v.null(),
  handler: async (ctx, { tripId }) => {
    if (await ctx.db.get("trips", tripId)) return null;
    const threads = await ctx.db.query("assistantThreads").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(20);
    const requests = await ctx.db.query("assistantRequests").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(20);
    for (const thread of threads) {
      await tripAgent.deleteThreadAsync(ctx, { threadId: thread.threadId });
      await ctx.db.delete("assistantThreads", thread._id);
    }
    for (const request of requests) await ctx.db.delete("assistantRequests", request._id);
    if (threads.length === 20 || requests.length === 20) await ctx.scheduler.runAfter(0, internal.tripAssistant.cleanupTrip, { tripId });
    return null;
  },
});
