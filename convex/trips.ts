import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import schema from "./schema";
import { flightPlanItinerary } from "./flightPlanFields";
import { homeJourneyStatus } from "./homeJourney";
import { tripFields, validateTrip } from "./tripFields";

async function requireUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId || !await ctx.db.get("users", userId)) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to manage your trips." });
  }
  return userId;
}

async function requireTrip(ctx: QueryCtx, tripId: Id<"trips">) {
  const userId = await requireUser(ctx);
  const trip = await ctx.db.get("trips", tripId);
  if (!trip || trip.ownerId !== userId) {
    throw new ConvexError({ code: "TRIP_NOT_FOUND", message: "This trip is unavailable." });
  }
  return trip;
}

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(schema.doc("trips")),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const ownerId = await requireUser(ctx);
    return await ctx.db.query("trips").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .order("desc").paginate({ ...paginationOpts, numItems: Math.min(50, Math.max(1, paginationOpts.numItems)) });
  },
});

export const get = query({
  args: { tripId: v.id("trips") },
  returns: schema.doc("trips"),
  handler: async (ctx, { tripId }) => await requireTrip(ctx, tripId),
});

export const create = mutation({
  args: tripFields.fields,
  returns: v.id("trips"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    return await ctx.db.insert("trips", { ...validateTrip(args), ownerId, updatedAt: Date.now() });
  },
});

export const update = mutation({
  args: { tripId: v.id("trips"), changes: tripFields, expectedUpdatedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { tripId, changes, expectedUpdatedAt }) => {
    const trip = await requireTrip(ctx, tripId);
    if (trip.updatedAt !== expectedUpdatedAt) {
      throw new ConvexError({ code: "TRIP_CHANGED", message: "This trip changed in another window. Reopen it before saving." });
    }
    await ctx.db.patch("trips", tripId, {
      ...(trip.flightPlan && (flightPlanItinerary(trip) !== flightPlanItinerary(changes) ||
        (changes.homeReturnNotNeededFor !== undefined && changes.homeReturnNotNeededFor !== trip.homeReturnNotNeededFor))
        ? { flightPlan: { ...trip.flightPlan, confirmed: false, revision: trip.flightPlan.revision + 1 } } : {}),
      ...validateTrip(changes), updatedAt: Math.max(Date.now(), trip.updatedAt + 1),
    });
    return null;
  },
});

export const remove = mutation({
  args: { tripId: v.id("trips") },
  returns: v.null(),
  handler: async (ctx, { tripId }) => {
    await requireTrip(ctx, tripId);
    await ctx.db.delete("trips", tripId);
    await ctx.scheduler.runAfter(0, internal.flightJobs.cleanupTrip, { tripId });
    await ctx.scheduler.runAfter(0, internal.interestJobs.cleanupTrip, { tripId });
    await ctx.scheduler.runAfter(0, internal.itineraryEmails.cleanupTrip, { tripId });
    return null;
  },
});


export const changeFlightPlan = mutation({
  args: { tripId: v.id("trips"), revision: v.number(), index: v.number(),
    action: v.union(v.literal("select"), v.literal("book"), v.literal("edit"), v.literal("clear"), v.literal("confirm")),
    outboundId: v.optional(v.id("researchSources")), returnId: v.optional(v.id("researchSources")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const trip = await requireTrip(ctx, args.tripId);
    const plan = trip.flightPlan ?? { revision: 0, confirmed: false, legs: [] };
    if (args.revision !== plan.revision) throw new ConvexError({ message: "The flight plan changed. Please try again." });
    const itinerary = flightPlanItinerary(trip);
    if (!Number.isInteger(args.index) || args.index < 0 || args.index >= trip.destinations.length) throw new ConvexError({ message: "This leg no longer exists." });
    const legs = [...plan.legs];
    const position = legs.findIndex(leg => leg.index === args.index);
    const leg = legs[position];
    if (args.action === "confirm") {
      if (!trip.destinations.every((_, index) => legs.some(item => item.index === index && item.itinerary === itinerary && item.booked))) {
        throw new ConvexError({ message: "Book every current leg before confirming the flight plan." });
      }
      if (homeJourneyStatus(trip, legs) === "missing") throw new ConvexError({ message: "Add and book your journey home, or mark it as not needed, before confirming." });
    } else if (args.action === "select") {
      if (leg?.booked && leg.itinerary === itinerary) throw new ConvexError({ message: "Edit the booked leg before changing its flight." });
      const outbound = args.outboundId ? await ctx.db.get("researchSources", args.outboundId) : null;
      const run = outbound ? await ctx.db.get("researchRuns", outbound.runId) : null;
      const code = (value: string) => value.match(/(?:^|\()([A-Z]{3})(?:; all airports\)|\))?$/i)?.[1].toUpperCase();
      const origin = args.index === 0 ? trip.origin : trip.destinations[args.index - 1];
      if (!outbound || outbound.tripId !== trip._id || !run || run.tripId !== trip._id || run.status !== "completed" || run.outboundSourceId ||
        run.flightRequest.origin !== code(origin) || run.flightRequest.destination !== code(trip.destinations[args.index]) ||
        run.flightRequest.departureDate < trip.startDate || run.flightRequest.departureDate > trip.endDate ||
        (args.index === 0 && run.flightRequest.departureDate !== trip.startDate) ||
        (run.flightRequest.returnDate && run.flightRequest.returnDate !== trip.endDate)) throw new ConvexError({ message: "Choose a flight from a completed search for this leg." });
      if (trip.destinations.length > 1 && run.flightRequest.tripType === "round-trip") {
        throw new ConvexError({ message: "For multi-city trips, select one-way flights for each leg, including the journey home." });
      }
      const returning = args.returnId ? await ctx.db.get("researchSources", args.returnId) : null;
      if (args.returnId) {
        const returnRun = returning ? await ctx.db.get("researchRuns", returning.runId) : null;
        if (!returning || returning.tripId !== trip._id || !returnRun || returnRun.tripId !== trip._id || returnRun.status !== "completed" ||
          returnRun.outboundSourceId !== outbound._id || JSON.stringify(returnRun.flightRequest) !== JSON.stringify(run.flightRequest)) {
          throw new ConvexError({ message: "Choose a return flight matching the selected outgoing flight." });
        }
      }
      const selection = { index: args.index, itinerary, request: run.flightRequest, outbound, ...(returning ? { returning } : {}), booked: false };
      if (position < 0) legs.push(selection); else legs[position] = selection;
    } else if (args.action === "clear") {
      if (leg?.booked && leg.itinerary === itinerary) throw new ConvexError({ message: "Edit the booked leg before searching again." });
      if (position >= 0) legs.splice(position, 1);
    } else {
      if (!leg || (args.action !== "edit" && leg.itinerary !== itinerary)) throw new ConvexError({ message: "Search and select a flight for this leg first." });
      if (args.action === "book" && leg.request.tripType === "round-trip" && !leg.returning) throw new ConvexError({ message: "Select a return flight before marking this leg as booked." });
      legs[position] = { ...leg, booked: args.action === "book",
        ...(args.action === "book" ? { reference: leg.reference ?? `TW-${trip._id.slice(-6).toUpperCase()}-${args.index + 1}-${plan.revision + 1}` } : { reference: undefined }) };
    }
    await ctx.db.patch("trips", trip._id, { flightPlan: { revision: plan.revision + 1, confirmed: args.action === "confirm", legs } });
    return null;
  },
});
