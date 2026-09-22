import { getAuthUserId } from "@convex-dev/auth/server";
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import type { WorkId } from "@convex-dev/workpool";
import { Workpool, vOnCompleteValidator } from "@convex-dev/workpool";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { feeResult, feeSettings } from "./extraFeeSchema";
import { feeSearchKey, feeTargets } from "./extraFeeResearch";
import type { FeeResult } from "./extraFeeResearch";
import { checkFirecrawlBudget, researchFeePage, searchFeeSources } from "./firecrawl";

const pool = new Workpool(components.researchPool, { maxParallelism: 3, retryActionsByDefault: false });
const limiter = new RateLimiter(components.rateLimiter, {
  feesUser: { kind: "token bucket", rate: 3, period: HOUR, capacity: 2 },
  feesGlobal: { kind: "token bucket", rate: 30, period: HOUR, capacity: 5 },
});
async function ownedTrip(ctx: QueryCtx, tripId: Id<"trips">) {
  const userId = await getAuthUserId(ctx);
  const trip = await ctx.db.get("trips", tripId);
  if (!userId || !trip || trip.ownerId !== userId) throw new ConvexError({ message: "This trip is unavailable." });
  return trip;
}
async function targetsFor(ctx: QueryCtx, tripId: Id<"trips">) {
  const trip = await ownedTrip(ctx, tripId);
  const favorites = await ctx.db.query("interestFavorites").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(100);
  return { trip, targets: feeTargets(trip, favorites) };
}
export const saveSettings = mutation({
  args: { tripId: v.id("trips"), settings: feeSettings }, returns: v.null(),
  handler: async (ctx, { tripId, settings }) => {
    await ownedTrip(ctx, tripId);
    if (!Number.isInteger(settings.bagsPerTraveler) || settings.bagsPerTraveler < 0 || settings.bagsPerTraveler > 2 ||
      !Number.isInteger(settings.carDays) || settings.carDays < 1 || settings.carDays > 366 ||
      settings.rentalProvider.length > 150 || settings.parkingLocation.length > 200) throw new ConvexError({ message: "Choose 0–2 checked bags, 1–366 car days, and shorter provider/location names." });
    await ctx.db.patch("trips", tripId, { extraFeeSettings: { ...settings,
      rentalProvider: settings.rentalProvider.trim(), parkingLocation: settings.parkingLocation.trim() } });
    return null;
  },
});
export const latest = query({
  args: { tripId: v.id("trips") },
  returns: v.object({ results: v.array(feeResult), run: v.union(v.null(), schema.doc("extraFeeRuns")) }),
  handler: async (ctx, { tripId }) => {
    const { targets } = await targetsFor(ctx, tripId);
    const searchKey = await feeSearchKey(targets);
    const run = await ctx.db.query("extraFeeRuns").withIndex("by_tripId_searchKey", q => q.eq("tripId", tripId).eq("searchKey", searchKey)).order("desc").first();
    const results: FeeResult[] = run?.results ?? targets.map(target => ({ target, status: "unknown", note: "Not researched yet." }));
    return { run, results };
  },
});
export const start = mutation({
  args: { tripId: v.id("trips"), refresh: v.optional(v.boolean()), sessionId: v.optional(v.string()) }, returns: v.id("extraFeeRuns"),
  handler: async (ctx, { tripId, refresh, sessionId }) => {
    const { trip, targets } = await targetsFor(ctx, tripId);
    if (!targets.length) throw new ConvexError({ message: "Add itinerary activities, select flights, or enable rental-car fees first." });
    const searchKey = await feeSearchKey(targets);
    const latest = await ctx.db.query("extraFeeRuns").withIndex("by_tripId_searchKey", q => q.eq("tripId", tripId).eq("searchKey", searchKey)).order("desc").first();
    if (latest && (latest.status === "running" || (!refresh && (latest.expiresAt ?? 0) > Date.now()))) return latest._id;
    if (!process.env.FIRECRAWL_API_KEY?.trim()) throw new ConvexError({ message: "Fee research is not configured yet." });
    for (const [name, key] of [["feesUser", trip.ownerId], ["feesGlobal", undefined]] as const) {
      const status = await limiter.limit(ctx, name, { key });
      if (!status.ok) throw new ConvexError({ message: "Fee research limit reached. Please try again later." });
    }
    await checkFirecrawlBudget(ctx, sessionId);
    const runId = await ctx.db.insert("extraFeeRuns", { tripId, ownerId: trip.ownerId, searchKey, status: "running",
      results: targets.map(target => ({ target, status: "pending" as const })) });
    const workIds = await pool.enqueueActionBatch(ctx, internal.extraFees.execute, targets.map((_, index) => ({ runId, index,
      ...(sessionId ? { sessionId } : {}) })), {
      retry: false, onComplete: internal.extraFees.onComplete, context: { runId },
    });
    await ctx.db.patch("extraFeeRuns", runId, { workIds });
    return runId;
  },
});
export const loadTarget = internalQuery({
  args: { runId: v.id("extraFeeRuns"), index: v.number() }, returns: v.union(v.null(), feeResult),
  handler: async (ctx, { runId, index }) => {
    const run = await ctx.db.get("extraFeeRuns", runId);
    const trip = run && await ctx.db.get("trips", run.tripId);
    if (!run || !trip || trip.ownerId !== run.ownerId || !Number.isInteger(index)) return null;
    const row = run.results[index];
    return row?.status === "pending" ? row : null;
  },
});
export const finish = internalMutation({
  args: { runId: v.id("extraFeeRuns"), index: v.number(), result: feeResult }, returns: v.null(),
  handler: async (ctx, { runId, index, result }) => {
    const run = await ctx.db.get("extraFeeRuns", runId);
    if (!run || run.results[index]?.status !== "pending" || !await ctx.db.get("trips", run.tripId)) return null;
    const results = [...run.results]; results[index] = result;
    const completed = results.every(row => row.status !== "pending");
    await ctx.db.patch("extraFeeRuns", runId, { results, ...(completed ? { status: "completed" as const,
      finishedAt: Date.now(), expiresAt: Date.now() + 6 * HOUR } : {}) });
    return null;
  },
});
export const execute = internalAction({
  args: { runId: v.id("extraFeeRuns"), index: v.number(), sessionId: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, { runId, index, sessionId }) => {
    const row = await ctx.runQuery(internal.extraFees.loadTarget, { runId, index });
    if (!row) return null;
    let result: FeeResult = { ...row, status: "unknown", note: "No applicable price confirmed. Check the provider before booking." };
    try {
      const urls = await searchFeeSources(ctx, row.target.query, sessionId);
      const candidates = [...new Set([...(row.target.sourceUrl ? [row.target.sourceUrl] : []), ...urls])].slice(0, 3);
      for (const url of candidates) {
        const quote = await researchFeePage(ctx, url, row.target.context, sessionId).catch(() => null);
        if (quote) { result = { target: row.target, status: "priced", ...quote, retrievedAt: new Date().toISOString() }; break; }
      }
      if (result.status === "unknown" && candidates.length) result.sourceUrl = candidates[0];
    } catch {
      result.note = "Price research was unavailable. Try again later.";
    }
    await ctx.runMutation(internal.extraFees.finish, { runId, index, result });
    return null;
  },
});
export const onComplete = internalMutation({
  args: vOnCompleteValidator(v.object({ runId: v.id("extraFeeRuns") })), returns: v.null(),
  handler: async (ctx, { context, result, workId }) => {
    if (result.kind === "success") return null;
    const run = await ctx.db.get("extraFeeRuns", context.runId);
    if (!run) return null;
    const index = run.workIds?.indexOf(workId) ?? -1;
    const row = run.results[index];
    if (row?.status === "pending") await ctx.runMutation(internal.extraFees.finish, { runId: run._id, index,
      result: { ...row, status: "unknown", note: "Research interrupted. Search again to retry." } });
    return null;
  },
});
export const cleanupTrip = internalMutation({
  args: { tripId: v.id("trips") }, returns: v.null(),
  handler: async (ctx, { tripId }) => {
    if (await ctx.db.get("trips", tripId)) return null;
    const runs = await ctx.db.query("extraFeeRuns").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(20);
    for (const run of runs) {
      if (run.status === "running") for (const workId of run.workIds ?? []) await pool.cancel(ctx, workId as WorkId);
      await ctx.db.delete("extraFeeRuns", run._id);
    }
    if (runs.length === 20) await ctx.scheduler.runAfter(0, internal.extraFees.cleanupTrip, { tripId });
    return null;
  },
});
