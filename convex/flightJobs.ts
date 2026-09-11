import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { Workpool, vOnCompleteValidator } from "@convex-dev/workpool";
import type { WorkId } from "@convex-dev/workpool";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { resolveAirportScope } from "./cityAirports";
import { browseReturnFlights, scrapeFlightPage } from "./firecrawl";
import { sourceFields } from "./flightSchema";
import schema from "./schema";
import { flightRequest, flightSearchUrl, parseFlightPage, validateFlightRequest } from "./flightSearch";
import { parseReturnResults, returnBrowserCode } from "./returnFlights";
import type { FlightRequest } from "./flightSearch";

import { accessibilityRequirements, checkFlightAccessibility } from "./accessibility";

const pool = new Workpool(components.researchPool, { maxParallelism: 2, retryActionsByDefault: false });
const limiter = new RateLimiter(components.rateLimiter, {
  researchUser: { kind: "token bucket", rate: 10, period: HOUR, capacity: 3 },
  researchGlobal: { kind: "token bucket", rate: 100, period: HOUR, capacity: 10 },
});
const CACHE_MS = 15 * 60000;

async function ownedTrip(ctx: QueryCtx, tripId: Id<"trips">) {
  const ownerId = await getAuthUserId(ctx);
  if (!ownerId || !await ctx.db.get("users", ownerId)) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to search flights for your trip." });
  }
  const trip = await ctx.db.get("trips", tripId);
  if (!trip || trip.ownerId !== ownerId) {
    throw new ConvexError({ code: "TRIP_NOT_FOUND", message: "This trip is unavailable." });
  }
  return trip;
}

function searchDetails(flight: FlightRequest, outboundSourceId?: Id<"researchSources">) {
  const request = validateFlightRequest(flight);
  return { destination: request.destination, searchKey: JSON.stringify(outboundSourceId ? ["returns-v1", request, outboundSourceId] : ["flights-v2", request]), queryText: flightSearchUrl(request), flightRequest: request };
}

async function checkOutbound(ctx: QueryCtx, tripId: Id<"trips">, flight: FlightRequest, sourceId?: Id<"researchSources">) {
  if (!sourceId) return null;
  const source = await ctx.db.get("researchSources", sourceId);
  const run = source ? await ctx.db.get("researchRuns", source.runId) : null;
  if (!source || source.tripId !== tripId || !run || run.tripId !== tripId || run.outboundSourceId ||
    run.status !== "completed" || flight.tripType !== "round-trip" ||
    JSON.stringify(validateFlightRequest(run.flightRequest)) !== JSON.stringify(validateFlightRequest(flight))) {
    throw new ConvexError({ code: "INVALID_OUTBOUND", message: "Choose an outgoing flight from this trip's matching search." });
  }
  return source;
}

export const start = mutation({
  args: { tripId: v.id("trips"), flight: flightRequest, outboundSourceId: v.optional(v.id("researchSources")), refresh: v.optional(v.boolean()) },
  returns: v.object({ runId: v.id("researchRuns"), reused: v.boolean() }),
  handler: async (ctx, args) => {
    const trip = await ownedTrip(ctx, args.tripId);
    await checkOutbound(ctx, trip._id, args.flight, args.outboundSourceId);
    const details = searchDetails(args.flight, args.outboundSourceId);
    if (details.flightRequest) {
      const departure = Date.parse(`${details.flightRequest.departureDate}T00:00:00Z`);
      const today = Date.parse(new Date().toISOString().slice(0, 10));
      const returning = details.flightRequest.returnDate ? Date.parse(`${details.flightRequest.returnDate}T00:00:00Z`) : departure;
      if (departure < today || departure > today + 330 * 86400000 || returning > today + 330 * 86400000) {
        throw new ConvexError({ code: "INVALID_FLIGHT_SEARCH", message: "Choose travel dates within the next 330 days." });
      }
    }
    const existing = await ctx.db.query("researchRuns").withIndex("by_tripId_searchKey", (q) =>
      q.eq("tripId", trip._id).eq("searchKey", details.searchKey)).order("desc").first();
    if (existing && (existing.status === "pending" || existing.status === "running" ||
      (!args.refresh && existing.status === "completed" && (existing.expiresAt ?? 0) > Date.now()))) {
      return { runId: existing._id, reused: true };
    }
    if (!process.env.FIRECRAWL_API_KEY?.trim()) {
      throw new ConvexError({ code: "RESEARCH_NOT_CONFIGURED", message: "Flight search is not configured yet. Set the Firecrawl key in Convex." });
    }
    for (const [name, key] of [["researchUser", trip.ownerId], ["researchGlobal", undefined]] as const) {
      const status = await limiter.limit(ctx, name, { key });
      if (!status.ok) throw new ConvexError({ code: "RESEARCH_RATE_LIMITED", message: `Flight search limit reached. Try again in ${Math.max(1, Math.ceil(status.retryAfter / 60000))} minute(s).` });
    }
    const runId = await ctx.db.insert("researchRuns", {
      tripId: trip._id, ownerId: trip.ownerId, destination: details.destination, topic: "flights",
      flightRequest: details.flightRequest,
      ...(args.outboundSourceId ? { outboundSourceId: args.outboundSourceId } : {}),
      searchKey: details.searchKey, query: details.queryText, tripUpdatedAt: trip.updatedAt, status: "pending",
    });
    const workId = await pool.enqueueAction(ctx, internal.flightJobs.execute, { runId }, {
      retry: false, onComplete: internal.flightJobs.onComplete, context: { runId },
    });
    await ctx.db.patch("researchRuns", runId, { workId });
    return { runId, reused: false };
  },
});

export const latest = query({
  args: { tripId: v.id("trips"), flight: flightRequest, outboundSourceId: v.optional(v.id("researchSources")) },
  returns: v.union(v.null(), v.object({ run: schema.doc("researchRuns"), sources: v.array(schema.doc("researchSources")),
    accessibility: v.optional(v.object({ excludedCount: v.number(), unverified: v.array(v.string()), notApplicable: v.array(v.string()) })),
  })),
  handler: async (ctx, args) => {
    const trip = await ownedTrip(ctx, args.tripId);
    await checkOutbound(ctx, trip._id, args.flight, args.outboundSourceId);
    const details = searchDetails(args.flight, args.outboundSourceId);
    const run = await ctx.db.query("researchRuns").withIndex("by_tripId_searchKey", (q) =>
      q.eq("tripId", trip._id).eq("searchKey", details.searchKey)).order("desc").first();
    if (!run) return null;
    const sources = await ctx.db.query("researchSources").withIndex("by_runId", (q) => q.eq("runId", run._id)).take(5);
    const assessment = checkFlightAccessibility(accessibilityRequirements(trip.accessibility));
    return { run, sources, accessibility: {
      excludedCount: 0,
      unverified: assessment.checks.filter(check => check.status === "unverified").map(check => check.requirement),
      notApplicable: assessment.checks.filter(check => check.status === "not-applicable").map(check => check.requirement),
    } };
  },
});

export const selectedOutbound = internalQuery({
  args: { runId: v.id("researchRuns") }, returns: v.union(v.null(), schema.doc("researchSources")),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("researchRuns", runId);
    if (!run || !run.outboundSourceId) return null;
    const trip = await ctx.db.get("trips", run.tripId);
    if (!trip || trip.ownerId !== run.ownerId) return null;
    return checkOutbound(ctx, run.tripId, run.flightRequest, run.outboundSourceId);
  },
});

export const claim = internalMutation({
  args: { runId: v.id("researchRuns") }, returns: v.union(v.null(), schema.doc("researchRuns")),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("researchRuns", runId);
    if (!run || run.status !== "pending") return null;
    const trip = await ctx.db.get("trips", run.tripId);
    if (!trip || trip.ownerId !== run.ownerId) return null;
    await ctx.db.patch("researchRuns", runId, { status: "running", startedAt: Date.now() });
    return run;
  },
});

const providerErrors: Record<string, string> = {
  AIRPORT_LOOKUP_FAILED: "City airports could not be verified. Please try again or select an individual airport.",
  FLIGHTS_UNAVAILABLE: "Matching flight prices could not be verified. Try again or open Google Flights.",
  FIRECRAWL_UNAUTHORIZED: "The flight search service key is invalid. Contact the app administrator.",
  FIRECRAWL_CREDITS_EXHAUSTED: "The flight search service is out of credits. Try again after credits are added.",
  FIRECRAWL_RATE_LIMITED: "The flight search provider is busy. Try again later.",
  FIRECRAWL_TIMEOUT: "Flight search timed out. You can try again.",
  FIRECRAWL_NOT_CONFIGURED: "Flight search is not configured yet. Contact the app administrator.",
};

export const execute = internalAction({
  args: { runId: v.id("researchRuns") }, returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.runMutation(internal.flightJobs.claim, { runId });
    if (!run || !run.flightRequest) return null;
    try {
      if (run.outboundSourceId) {
        const outbound = await ctx.runQuery(internal.flightJobs.selectedOutbound, { runId });
        if (!outbound) throw new Error("Outbound unavailable");
        const raw = await browseReturnFlights(returnBrowserCode(run.flightRequest, outbound.flight));
        const response = parseReturnResults(raw, run.flightRequest, outbound.flight);
        await ctx.runMutation(internal.flightJobs.finish, { runId, sources: response.flights.map((flight) => ({
          title: flight.airline, category: "flights" as const, description: `${flight.duration} · ${flight.stops}`,
          destination: run.flightRequest.origin, sourceUrl: response.sourceUrl, retrievedAt: new Date().toISOString(), flight,
        })) });
        return null;
      }
      const scope = await resolveAirportScope(run.flightRequest);
      const response = await scrapeFlightPage(run.query);
      const flights = parseFlightPage(response.markdown, run.flightRequest, scope);
      await ctx.runMutation(internal.flightJobs.finish, { runId, airportScope: scope, sources: flights.map((flight) => ({
        title: flight.airline, category: "flights" as const, description: `${flight.duration} · ${flight.stops}`,
        destination: run.destination, sourceUrl: run.query, retrievedAt: response.retrievedAt, flight,
      })) });
    } catch (error) {
      const code = error instanceof ConvexError && typeof error.data === "object" && error.data !== null && "code" in error.data
        ? String(error.data.code) : "";
      await ctx.runMutation(internal.flightJobs.fail, {
        runId, message: providerErrors[code] ?? "Flight search could not be completed. Please try again.",
      });
    }
    return null;
  },
});

export const finish = internalMutation({
  args: { runId: v.id("researchRuns"), sources: v.array(sourceFields), airportScope: v.optional(v.object({ origin: v.array(v.string()), destination: v.array(v.string()) })) }, returns: v.null(),
  handler: async (ctx, { runId, sources, airportScope }) => {
    const run = await ctx.db.get("researchRuns", runId);
    if (!run || run.status !== "running") return null;
    const trip = await ctx.db.get("trips", run.tripId);
    if (!trip || trip.ownerId !== run.ownerId) return null;
    for (const source of [...sources].sort((a, b) => a.flight.amount - b.flight.amount).slice(0, 5)) await ctx.db.insert("researchSources", { ...source, tripId: run.tripId, runId });
    await ctx.db.patch("researchRuns", runId, { status: "completed", finishedAt: Date.now(), expiresAt: Date.now() + CACHE_MS, ...(airportScope ? { airportScope } : {}) });
    return null;
  },
});

export const fail = internalMutation({
  args: { runId: v.id("researchRuns"), message: v.string() }, returns: v.null(),
  handler: async (ctx, { runId, message }) => {
    const run = await ctx.db.get("researchRuns", runId);
    if (run && (run.status === "pending" || run.status === "running")) {
      await ctx.db.patch("researchRuns", runId, { status: "failed", finishedAt: Date.now(), error: message });
    }
    return null;
  },
});

export const onComplete = internalMutation({
  args: vOnCompleteValidator(v.object({ runId: v.id("researchRuns") })), returns: v.null(),
  handler: async (ctx, { context, result }) => {
    await ctx.runMutation(internal.flightJobs.fail, { runId: context.runId,
      message: result.kind === "canceled" ? "Flight search was canceled. You can try again." : "Flight search was interrupted. You can try again." });
    return null;
  },
});

export const cleanupTrip = internalMutation({
  args: { tripId: v.id("trips") }, returns: v.null(),
  handler: async (ctx, { tripId }) => {
    if (await ctx.db.get("trips", tripId)) return null;
    const runs = await ctx.db.query("researchRuns").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).take(20);
    for (const run of runs) {
      if (run.workId && (run.status === "pending" || run.status === "running")) await pool.cancel(ctx, run.workId as WorkId);
      const sources = await ctx.db.query("researchSources").withIndex("by_runId", (q) => q.eq("runId", run._id)).take(5);
      for (const source of sources) await ctx.db.delete("researchSources", source._id);
      await ctx.db.delete("researchRuns", run._id);
    }
    if (runs.length === 20) await ctx.scheduler.runAfter(0, internal.flightJobs.cleanupTrip, { tripId });
    return null;
  },
});
