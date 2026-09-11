import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import schema from "./schema";
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
    return null;
  },
});
