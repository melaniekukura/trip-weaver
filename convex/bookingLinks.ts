import { getAuthUserId } from "@convex-dev/auth/server";
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { flightOption, flightSearchUrl } from "./flightSearch";
import { bookingBrowserCode } from "./returnFlights";
import { executeReturnBrowser } from "./firecrawl";
import { diagnoseFlightFailure, flightFailure, sanitizeFlightDiagnostic } from "./flightDiagnostics";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const args = { tripId: v.id("trips"), outboundId: v.id("researchSources"), returnId: v.optional(v.id("researchSources")) };
const bookingLink = v.object({ url: v.string(), provider: v.string(), amount: v.number() });
const limiter = new RateLimiter(components.rateLimiter, { bookingLinks: { kind: "token bucket", rate: 10, period: HOUR, capacity: 3 } });

async function requireTrip(ctx: QueryCtx, tripId: Id<"trips">) {
  const ownerId = await getAuthUserId(ctx);
  const trip = await ctx.db.get("trips", tripId);
  if (!ownerId || !trip || trip.ownerId !== ownerId) throw new ConvexError({ message: "This trip is unavailable." });
  return trip;
}

export const selection = internalQuery({
  args, returns: v.object({ url: v.string(), flight: flightOption, date: v.string(), roundTrip: v.boolean() }),
  handler: async (ctx, args) => {
    await requireTrip(ctx, args.tripId);
    const outbound = await ctx.db.get("researchSources", args.outboundId);
    const run = outbound ? await ctx.db.get("researchRuns", outbound.runId) : null;
    if (!outbound || outbound.tripId !== args.tripId || !run || run.tripId !== args.tripId || run.status !== "completed" || run.outboundSourceId) {
      throw new ConvexError({ message: "Choose an outgoing flight from this trip first." });
    }
    if (run.flightRequest.tripType === "round-trip") {
      const returning = args.returnId ? await ctx.db.get("researchSources", args.returnId) : null;
      const returnRun = returning ? await ctx.db.get("researchRuns", returning.runId) : null;
      if (!returning || returning.tripId !== args.tripId || !returnRun || returnRun.tripId !== args.tripId || returnRun.status !== "completed" ||
        returnRun.outboundSourceId !== outbound._id || JSON.stringify(returnRun.flightRequest) !== JSON.stringify(run.flightRequest)) {
        throw new ConvexError({ message: "Choose a matching return flight first." });
      }
      return { url: returning.sourceUrl, flight: returning.flight, date: run.flightRequest.returnDate!, roundTrip: true };
    }
    if (args.returnId) throw new ConvexError({ message: "This is a one-way search." });
    return { url: flightSearchUrl({ ...run.flightRequest, origin: outbound.flight.originAirport ?? run.flightRequest.origin,
      destination: outbound.flight.destinationAirport ?? run.flightRequest.destination, originType: "airport", destinationType: "airport" }),
      flight: outbound.flight, date: run.flightRequest.departureDate, roundTrip: false };
  },
});

export const reserve = internalMutation({
  args: { tripId: v.id("trips") }, returns: v.null(),
  handler: async (ctx, { tripId }) => {
    const trip = await requireTrip(ctx, tripId);
    const result = await limiter.limit(ctx, "bookingLinks", { key: trip.ownerId });
    if (!result.ok) throw new ConvexError({ message: "Too many booking-link requests. Please try again later." });
    return null;
  },
});

export function parseBookingLink(raw: unknown) {
  if (!raw || typeof raw !== "object" || !("url" in raw) || typeof raw.url !== "string" ||
    !("provider" in raw) || typeof raw.provider !== "string" || raw.provider.length > 100 ||
    !("airlineHost" in raw) || typeof raw.airlineHost !== "string" ||
    !("amount" in raw) || typeof raw.amount !== "number" || !Number.isFinite(raw.amount) || raw.amount <= 0) {
    throw new ConvexError({ message: "A direct airline booking link is not available for this selection. Please try again later." });
  }
  const url = new URL(raw.url);
  if (url.protocol !== "https:" || url.username || url.password || raw.url.length > 20000 ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(raw.airlineHost) ||
    !(url.hostname === raw.airlineHost || url.hostname.endsWith(`.${raw.airlineHost}`)) ||
    /(?:^|\.)(?:google|googleadservices)\./.test(url.hostname)) {
    throw new ConvexError({ message: "The airline booking link could not be verified." });
  }
  return { url: url.href, provider: raw.provider, amount: raw.amount };
}

export function decodeBookingResult(response: Record<string, unknown>): unknown {
  const candidates: unknown[] = [];
  if (typeof response.stdout === "string" && response.stdout.length <= 500000) {
    const line = response.stdout.split("\n").reverse().find(line => line.startsWith("TRIP_WEAVER_BOOKING:"));
    if (line) candidates.push(line.slice("TRIP_WEAVER_BOOKING:".length));
  }
  candidates.push(response.result);
  for (const candidate of candidates) {
    let value: unknown = candidate;
    try {
      for (let depth = 0; depth < 2 && typeof value === "string"; depth++) value = JSON.parse(value);
    } catch { continue; }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if ("browserFailure" in value && value.browserFailure === true) {
      throw new ConvexError({ code: "FLIGHTS_UNAVAILABLE", diagnostic: sanitizeFlightDiagnostic(value, "browser_result") });
    }
    if ("url" in value && "provider" in value) return value;
  }
  return flightFailure("browser_result", candidates.some(value => value != null) ? "invalid_output" : "missing_output");
}

export const resolve = action({
  args, returns: bookingLink,
  handler: async (ctx, args): Promise<{ url: string; provider: string; amount: number }> => {
    const selected = await ctx.runQuery(internal.bookingLinks.selection, args);
    const target = new URL(selected.url);
    if (target.origin !== "https://www.google.com" || !["/travel/flights", "/travel/flights/search"].includes(target.pathname)) {
      throw new ConvexError({ message: "The selected flight search link is unavailable." });
    }
    await ctx.runMutation(internal.bookingLinks.reserve, { tripId: args.tripId });
    try {
      const response = await executeReturnBrowser(bookingBrowserCode(selected.url, selected.flight, selected.date, selected.roundTrip));
      return parseBookingLink(decodeBookingResult(response));
    } catch (error) {
      if (error instanceof ConvexError && typeof error.data === "object" && error.data && "message" in error.data && !("code" in error.data)) throw error;
      const diagnostic = diagnoseFlightFailure(error, "browser_result");
      const reference = crypto.randomUUID();
      console.warn("Airline booking link failed", JSON.stringify({ reference, diagnostic }));
      throw new ConvexError({ message: "The airline booking link could not be retrieved. Please try again.", diagnostic, reference });
    }
  },
});
