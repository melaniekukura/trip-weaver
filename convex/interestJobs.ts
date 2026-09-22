import { accessibilityRequirements } from "./accessibility";
import { eventOutsideTrip } from "./interestDates";
import { getAuthUserId } from "@convex-dev/auth/server";
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { Workpool, vOnCompleteValidator } from "@convex-dev/workpool";
import type { WorkId } from "@convex-dev/workpool";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { discoveryItem, discoveryKind, ideaItinerary } from "./interestSchema";
import { diversifyIdeas } from "./interestDiversity";
import { discoverSpecificIdeas } from "./interestDiscovery";
import { foodInterest, interestQuery, interestSearchKey, sightseeingInterest, sightseeingQuery } from "./interestSearch";
import { checkFirecrawlBudget } from "./firecrawl";

const pool = new Workpool(components.researchPool, { maxParallelism: 2, retryActionsByDefault: false });
const limiter = new RateLimiter(components.rateLimiter, {
  interestUser: { kind: "token bucket", rate: 12, period: HOUR, capacity: 6 },
  interestGlobal: { kind: "token bucket", rate: 100, period: HOUR, capacity: 12 },
});
const searchArgs = { tripId: v.id("trips"), destination: v.string(), kind: discoveryKind, interest: v.optional(v.string()) };
async function ownedTrip(ctx: QueryCtx, tripId: Id<"trips">) {
  const userId = await getAuthUserId(ctx);
  const trip = await ctx.db.get("trips", tripId);
  if (!userId || !trip || trip.ownerId !== userId) throw new ConvexError({ message: "This trip is unavailable." });
  return trip;
}
function details(trip: Doc<"trips">, destination: string, kind: "activities" | "events" | "both", interest?: string) {
  destination = destination.trim();
  if (!destination || destination.length > 200 || /[\x00-\x1f\x7f]/.test(destination)) throw new ConvexError({ message: "Choose a city to explore (up to 200 characters)." });
  if (interest !== undefined && !trip.interests.includes(interest)) throw new ConvexError({ message: "Choose one of this trip’s interests." });
  return { destination, kind, accessibility: accessibilityRequirements(trip.accessibility), startDate: trip.startDate, endDate: trip.endDate, interests: interest === undefined ? trip.interests : [interest] };
}
export const start = mutation({
  args: { ...searchArgs, refresh: v.optional(v.boolean()), sessionId: v.optional(v.string()) }, returns: v.object({ runId: v.id("interestRuns"), reused: v.boolean() }),
  handler: async (ctx, args) => {
    const trip = await ownedTrip(ctx, args.tripId);
    const search = details(trip, args.destination, args.kind, args.interest);
    const searchKey = interestSearchKey(search);
    const recent = await ctx.db.query("interestRuns").withIndex("by_tripId_searchKey", q => q.eq("tripId", trip._id).eq("searchKey", searchKey)).order("desc").take(10);
    const existing = recent.find(run => run.status === "pending" || run.status === "running") ??
      (!args.refresh ? recent.find(run => run.status === "completed" && (run.expiresAt ?? 0) > Date.now() && !run.warnings.length) : undefined);
    if (existing) return { runId: existing._id, reused: true };
    if (!process.env.FIRECRAWL_API_KEY?.trim()) throw new ConvexError({ message: "Interest search is not configured yet." });
    for (const [name, key] of [["interestUser", trip.ownerId], ["interestGlobal", undefined]] as const) {
      const status = await limiter.limit(ctx, name, { key });
      if (!status.ok) throw new ConvexError({ message: `Interest search limit reached. Try again in ${Math.max(1, Math.ceil(status.retryAfter / 60000))} minute(s).` });
    }
    await checkFirecrawlBudget(ctx, args.sessionId);
    const runId = await ctx.db.insert("interestRuns", { ...search, tripId: trip._id, searchKey, status: "pending", results: [], warnings: [],
      ...(args.sessionId ? { firecrawlSessionId: args.sessionId } : {}) });
    const workId = await pool.enqueueAction(ctx, internal.interestJobs.execute, { runId }, { retry: false, onComplete: internal.interestJobs.onComplete, context: { runId } });
    await ctx.db.patch("interestRuns", runId, { workId });
    return { runId, reused: false };
  },
});
export const latest = query({
  args: { ...searchArgs, runId: v.optional(v.id("interestRuns")) }, returns: v.union(v.null(), schema.doc("interestRuns")),
  handler: async (ctx, args) => {
    const trip = await ownedTrip(ctx, args.tripId);
    const searchKey = interestSearchKey(details(trip, args.destination, args.kind, args.interest));
    if (args.runId) {
      const run = await ctx.db.get("interestRuns", args.runId);
      if (run?.tripId === trip._id && run.searchKey === searchKey) return run;
    }
    return ctx.db.query("interestRuns").withIndex("by_tripId_searchKey", q => q.eq("tripId", trip._id).eq("searchKey", searchKey)).order("desc").first();
  },
});
export const claim = internalMutation({
  args: { runId: v.id("interestRuns") }, returns: v.union(v.null(), schema.doc("interestRuns")),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("interestRuns", runId);
    if (!run || run.status !== "pending" || !await ctx.db.get("trips", run.tripId)) return null;
    await ctx.db.patch("interestRuns", runId, { status: "running" });
    return run;
  },
});
export const finish = internalMutation({
  args: { runId: v.id("interestRuns"), results: v.array(discoveryItem), warnings: v.array(v.string()), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, { runId, results, warnings, error }) => {
    const run = await ctx.db.get("interestRuns", runId);
    if (!run || !["pending", "running"].includes(run.status) || !await ctx.db.get("trips", run.tripId)) return null;
    await ctx.db.patch("interestRuns", runId, { results: results.slice(0, 24), warnings: warnings.slice(0, 2),
      status: error ? "failed" : "completed", ...(error ? { error } : {}), finishedAt: Date.now(), expiresAt: Date.now() + 6 * HOUR });
    return null;
  },
});
export const execute = internalAction({
  args: { runId: v.id("interestRuns") }, returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.runMutation(internal.interestJobs.claim, { runId });
    if (!run) return null;
    const result = await ctx.runAction(internal.interestJobs.discover, { destination: run.destination, interests: run.interests,
      startDate: run.startDate, endDate: run.endDate, kind: run.kind, accessibility: run.accessibility ?? [],
      ...(run.firecrawlSessionId ? { sessionId: run.firecrawlSessionId } : {}) });
    await ctx.runMutation(internal.interestJobs.finish, { runId, ...result });
    return null;
  },
});
export const discover = internalAction({
  args: { accessibility: v.optional(v.array(v.string())), destination: v.string(), interests: v.array(v.string()), startDate: v.string(), endDate: v.string(), kind: discoveryKind,
    sessionId: v.optional(v.string()) },
  returns: v.object({ results: v.array(discoveryItem), warnings: v.array(v.string()), error: v.optional(v.string()) }),
  handler: async (ctx, run): Promise<{ results: Doc<"interestRuns">["results"]; warnings: string[]; error?: string }> => {
    const kinds: ("activities" | "events")[] = run.kind === "both" ? ["activities", "events"] : [run.kind];
    const activityInterests = (run.interests.length ? run.interests : ["Local culture", "Food"]).slice(0, 3);
    const tasks = kinds.flatMap<{ kind: "activities" | "events"; interests: string[]; focus: string; restaurants?: "local" | "tasting"; sights?: "museums" | "landmarks" }>(kind => kind === "activities"
      ? activityInterests.flatMap(interest => [
        ...(foodInterest(interest) ? [{ kind, interests: [interest], focus: interest, restaurants: "local" as const }, { kind, interests: [interest], focus: interest, restaurants: "tasting" as const }] : []),
        ...(sightseeingInterest(interest) ? (["museums", "landmarks"] as const).map(sights => ({ kind, interests: [interest], focus: interest, sights })) : []),
        { kind, interests: [interest], focus: interest },
      ]) : [{ kind, interests: run.interests, focus: "Events" }]);
    const searches = await Promise.allSettled(tasks.map(task => ctx.runAction(internal.firecrawl.search, {
      query: task.sights ? sightseeingQuery(run.destination, task.sights) : interestQuery({ ...run, interests: task.interests }, task.kind, task.restaurants),
      limit: 5, budgetReserved: true, ...(run.sessionId ? { sessionId: run.sessionId } : {}),
    })));
    const results: Doc<"interestRuns">["results"] = [];
    const warnings: string[] = [];
    const deadline = Date.now() + 240000;
    const discoveries: { kind: "activities" | "events"; items: Doc<"interestRuns">["results"]; failedPages: number; focus: string }[] = [];
    for (let offset = 0; offset < tasks.length; offset += 3) {
      const batch = await Promise.allSettled(tasks.slice(offset, offset + 3).map(async (task, index) => {
        const response = searches[offset + index];
        if (response.status === "rejected") return { ...task, items: [], failedPages: 1 };
        const discovered = await discoverSpecificIdeas(response.value.results, url => ctx.runAction(internal.firecrawl.interestPage, {
          url, accessibility: run.accessibility ?? [], restaurants: Boolean(task.restaurants), kind: task.kind,
          destination: run.destination, interests: task.interests, startDate: run.startDate, endDate: run.endDate, budgetReserved: true,
          ...(run.sessionId ? { sessionId: run.sessionId } : {}),
        }), { deadline, perHost: 3, maxItems: 8, maxDepth: 2, maxVisits: 10, activities: task.kind === "activities" });
        return { ...task, failedPages: discovered.failedPages, items: discovered.items.filter(item => task.kind !== "events" || !eventOutsideTrip(item.dates, run.startDate, run.endDate)).map(item => ({ ...item, kind: task.kind,
          ...(task.kind === "activities" ? { interest: task.focus } : {}), detailed: true, destination: run.destination, retrievedAt: new Date().toISOString() })) };
      }));
      batch.forEach((response, index) => discoveries.push(response.status === "fulfilled" ? response.value : { ...tasks[offset + index], items: [], failedPages: 1 }));
    }
    for (const kind of kinds) {
      const groups = discoveries.filter(discovery => discovery.kind === kind);
      const selected = diversifyIdeas(groups.map(group => group.items), kind === "events" ? 6 : 18, 4, kind === "activities");
      results.push(...selected);
      if (!selected.length) warnings.push(`No specific ${kind === "events" ? "events" : "activities"} passed the checks within the pages searched. This does not mean none are available.`);
      else {
        const missing = groups.filter(group => !selected.some(item => item.interest === group.focus) && kind === "activities").map(group => group.focus);
        if (missing.length) warnings.push(`No distinct activity found yet for: ${missing.join(", ")}.`);
        else if (groups.some(group => group.failedPages)) warnings.push(`Some ${kind} pages could not be read; showing details from the other sources.`);
      }
    }
    return { results, warnings,
      ...(searches.every(result => result.status === "rejected") ? { error: "Activity and event search is unavailable. Please try again later." } : {}) };
  },
});
export const onComplete = internalMutation({
  args: vOnCompleteValidator(v.object({ runId: v.id("interestRuns") })), returns: v.null(),
  handler: async (ctx, { context }) => {
    await ctx.runMutation(internal.interestJobs.finish, { runId: context.runId, results: [], warnings: [], error: "Interest search was interrupted. Please try again." });
    return null;
  },
});
export const favorites = query({
  args: { tripId: v.id("trips") }, returns: v.array(schema.doc("interestFavorites")),
  handler: async (ctx, { tripId }) => { await ownedTrip(ctx, tripId); return ctx.db.query("interestFavorites").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(100); },
});
export const save = mutation({
  args: { runId: v.id("interestRuns"), index: v.number() }, returns: v.null(),
  handler: async (ctx, { runId, index }) => {
    const run = await ctx.db.get("interestRuns", runId);
    if (!run) throw new ConvexError({ message: "Search result is unavailable." });
    await ownedTrip(ctx, run.tripId);
    const item = Number.isInteger(index) && index >= 0 ? run.results[index] : undefined;
    if (!item || run.status !== "completed") throw new ConvexError({ message: "Choose a completed search result." });
    const existing = await ctx.db.query("interestFavorites").withIndex("by_tripId_url", q => q.eq("tripId", run.tripId).eq("item.url", item.url)).first();
    if (existing) return null;
    if ((await ctx.db.query("interestFavorites").withIndex("by_tripId", q => q.eq("tripId", run.tripId)).take(100)).length >= 100) throw new ConvexError({ message: "Remove a saved idea before adding more (100 maximum)." });
    await ctx.db.insert("interestFavorites", { tripId: run.tripId, item });
    return null;
  },
});
export const updateItinerary = mutation({
  args: { favoriteId: v.id("interestFavorites"), itinerary: v.union(ideaItinerary, v.null()) }, returns: v.null(),
  handler: async (ctx, { favoriteId, itinerary }) => {
    const favorite = await ctx.db.get("interestFavorites", favoriteId);
    if (!favorite) throw new ConvexError({ message: "Saved idea is unavailable." });
    await ownedTrip(ctx, favorite.tripId);
    if (itinerary) {
      const { date, time, notes } = itinerary;
      if (date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) {
        throw new ConvexError({ message: "Enter a valid itinerary date." });
      }
      if (time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ConvexError({ message: "Enter a valid itinerary time." });
      if (notes !== undefined && notes.length > 4000) throw new ConvexError({ message: "Keep itinerary notes within 4,000 characters." });
    }
    await ctx.db.patch("interestFavorites", favoriteId, { itinerary: itinerary ?? undefined });
    return null;
  },
});
export const removeFavorite = mutation({
  args: { favoriteId: v.id("interestFavorites") }, returns: v.null(),
  handler: async (ctx, { favoriteId }) => {
    const favorite = await ctx.db.get("interestFavorites", favoriteId);
    if (!favorite) throw new ConvexError({ message: "Saved idea is unavailable." });
    await ownedTrip(ctx, favorite.tripId);
    await ctx.db.delete("interestFavorites", favoriteId);
    return null;
  },
});
export const cleanupTrip = internalMutation({
  args: { tripId: v.id("trips") }, returns: v.null(),
  handler: async (ctx, { tripId }) => {
    if (await ctx.db.get("trips", tripId)) return null;
    const runs = await ctx.db.query("interestRuns").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(20);
    const favorites = await ctx.db.query("interestFavorites").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(20);
    for (const run of runs) {
      if (run.workId && ["pending", "running"].includes(run.status)) await pool.cancel(ctx, run.workId as WorkId);
      await ctx.db.delete("interestRuns", run._id);
    }
    for (const favorite of favorites) await ctx.db.delete("interestFavorites", favorite._id);
    if (runs.length === 20 || favorites.length === 20) await ctx.scheduler.runAfter(0, internal.interestJobs.cleanupTrip, { tripId });
    return null;
  },
});
