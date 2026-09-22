import { getAuthUserId } from "@convex-dev/auth/server";
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { Workpool, vOnCompleteValidator } from "@convex-dev/workpool";
import type { WorkId } from "@convex-dev/workpool";
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { checkFirecrawlBudget } from "./firecrawl";
import { requiredDocumentResult } from "./requiredDocumentSchema";
import schema from "./schema";

const pool = new Workpool(components.researchPool, { maxParallelism: 2, retryActionsByDefault: false });
const limiter = new RateLimiter(components.rateLimiter, {
  documentUser: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },
  documentGlobal: { kind: "token bucket", rate: 80, period: HOUR, capacity: 10 },
});
const searchArgs = { tripId: v.id("trips"), destination: v.string() };
const excludedDomains = ["facebook.com", "instagram.com", "pinterest.com", "quora.com", "reddit.com",
  "tiktok.com", "tripadvisor.com", "x.com", "youtube.com"];

const claimRef = makeFunctionReference<"mutation", { runId: Id<"requiredDocumentRuns"> },
  Doc<"requiredDocumentRuns"> | null>("requiredDocumentJobs:claim");
const finishRef = makeFunctionReference<"mutation", {
  runId: Id<"requiredDocumentRuns">;
  results: Array<{ destination: string; type: "passport" | "visa" | "travel-authorization" | "health" |
    "arrival-form" | "entry-requirements"; title: string; description: string; url: string; retrievedAt: string }>;
  warning?: string;
  error?: string;
}, null>("requiredDocumentJobs:finish");
const executeRef = makeFunctionReference<"action", { runId: Id<"requiredDocumentRuns">; sessionId?: string }, null>(
  "requiredDocumentJobs:execute");
const cleanupRef = makeFunctionReference<"mutation", { tripId: Id<"trips"> }, null>("requiredDocumentJobs:cleanupTrip");

async function ownedTrip(ctx: QueryCtx, tripId: Id<"trips">) {
  const userId = await getAuthUserId(ctx);
  const trip = await ctx.db.get("trips", tripId);
  if (!userId || !trip || trip.ownerId !== userId) throw new ConvexError({ message: "This trip is unavailable." });
  return trip;
}

function placeLabel(value: string) {
  return value.split(" — ")[0].replace(/\s*\([^)]*\)$/, "").trim();
}

function searchDetails(trip: Doc<"trips">, destination: string) {
  const selected = trip.destinations.find(value => value === destination);
  if (!selected) throw new ConvexError({ message: "Choose a destination from this trip." });
  const origin = placeLabel(trip.origin);
  const destinationLabel = placeLabel(selected);
  if (!origin || !destinationLabel) throw new ConvexError({ message: "Add a valid departure point and destination first." });
  return { origin, destination: selected, destinationLabel, startDate: trip.startDate,
    searchKey: JSON.stringify([origin, selected, trip.startDate, "required-documents-v1"]) };
}

export function documentType(title: string, description: string): "passport" | "visa" | "travel-authorization" |
    "health" | "arrival-form" | "entry-requirements" {
  const value = `${title} ${description}`.toLocaleLowerCase();
  if (/\b(esta|etias|eta|electronic travel authori[sz]ation|travel authori[sz]ation)\b/.test(value)) return "travel-authorization";
  if (/\b(e-?visa|visas?)\b/.test(value)) return "visa";
  if (/\b(passports?)\b/.test(value)) return "passport";
  if (/\b(vaccin|yellow fever|health declaration|health certificate|immuni[sz]ation)\b/.test(value)) return "health";
  if (/\b(arrival card|entry form|customs declaration|passenger locator|immigration form)\b/.test(value)) return "arrival-form";
  return "entry-requirements";
}

export const start = mutation({
  args: { ...searchArgs, refresh: v.optional(v.boolean()), sessionId: v.optional(v.string()) },
  returns: v.object({ runId: v.id("requiredDocumentRuns"), reused: v.boolean() }),
  handler: async (ctx, args) => {
    const trip = await ownedTrip(ctx, args.tripId);
    const search = searchDetails(trip, args.destination);
    const recent = await ctx.db.query("requiredDocumentRuns").withIndex("by_tripId_and_searchKey", q =>
      q.eq("tripId", trip._id).eq("searchKey", search.searchKey)).order("desc").take(10);
    const existing = recent.find(run => run.status === "pending" || run.status === "running") ??
      (!args.refresh ? recent.find(run => run.status === "completed" && (run.expiresAt ?? 0) > Date.now()) : undefined);
    if (existing) return { runId: existing._id, reused: true };
    if (!process.env.FIRECRAWL_API_KEY?.trim()) throw new ConvexError({ message: "Required-document search is not configured yet." });
    for (const [name, key] of [["documentUser", trip.ownerId], ["documentGlobal", undefined]] as const) {
      const status = await limiter.limit(ctx, name, { key });
      if (!status.ok) throw new ConvexError({ message: `Document search limit reached. Try again in ${Math.max(1, Math.ceil(status.retryAfter / 60000))} minute(s).` });
    }
    await checkFirecrawlBudget(ctx, args.sessionId);
    const runId = await ctx.db.insert("requiredDocumentRuns", { tripId: trip._id, origin: search.origin,
      destination: search.destination, startDate: search.startDate, searchKey: search.searchKey, status: "pending", results: [] });
    const workId = await pool.enqueueAction(ctx, executeRef, { runId, ...(args.sessionId ? { sessionId: args.sessionId } : {}) },
      { retry: false, onComplete: makeFunctionReference("requiredDocumentJobs:onComplete"), context: { runId } });
    await ctx.db.patch("requiredDocumentRuns", runId, { workId });
    return { runId, reused: false };
  },
});

export const latest = query({
  args: { ...searchArgs, runId: v.optional(v.id("requiredDocumentRuns")) },
  returns: v.union(v.null(), schema.doc("requiredDocumentRuns")),
  handler: async (ctx, args) => {
    const trip = await ownedTrip(ctx, args.tripId);
    const { searchKey } = searchDetails(trip, args.destination);
    if (args.runId) {
      const run = await ctx.db.get("requiredDocumentRuns", args.runId);
      if (run?.tripId === trip._id && run.searchKey === searchKey) return run;
    }
    return await ctx.db.query("requiredDocumentRuns").withIndex("by_tripId_and_searchKey", q =>
      q.eq("tripId", trip._id).eq("searchKey", searchKey)).order("desc").first();
  },
});

export const claim = internalMutation({
  args: { runId: v.id("requiredDocumentRuns") },
  returns: v.union(v.null(), schema.doc("requiredDocumentRuns")),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("requiredDocumentRuns", runId);
    if (!run || run.status !== "pending" || !await ctx.db.get("trips", run.tripId)) return null;
    await ctx.db.patch("requiredDocumentRuns", runId, { status: "running" });
    return run;
  },
});

export const finish = internalMutation({
  args: { runId: v.id("requiredDocumentRuns"), results: v.array(requiredDocumentResult),
    warning: v.optional(v.string()), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { runId, results, warning, error }) => {
    const run = await ctx.db.get("requiredDocumentRuns", runId);
    if (!run || !["pending", "running"].includes(run.status) || !await ctx.db.get("trips", run.tripId)) return null;
    await ctx.db.patch("requiredDocumentRuns", runId, { results: results.slice(0, 5),
      ...(warning ? { warning: warning.slice(0, 2000) } : {}), ...(error ? { error } : {}),
      status: error ? "failed" : "completed", finishedAt: Date.now(), expiresAt: Date.now() + 6 * HOUR });
    return null;
  },
});

export const execute = internalAction({
  args: { runId: v.id("requiredDocumentRuns"), sessionId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { runId, sessionId }) => {
    const run = await ctx.runMutation(claimRef, { runId });
    if (!run) return null;
    try {
      const destination = placeLabel(run.destination);
      const response = await ctx.runAction(internal.firecrawl.search, {
        query: `official government entry requirements passport visa travel authorization arrival forms for a traveler departing from "${run.origin}" and visiting "${destination}" on ${run.startDate} application form PDF`,
        limit: 5, includeContent: true, excludeDomains: excludedDomains, budgetReserved: true,
        ...(sessionId ? { sessionId } : {}),
      });
      const seen = new Set<string>();
      const results = response.results.filter(result => {
        const url = new URL(result.url);
        const key = `${url.hostname}${url.pathname}`.replace(/\/$/, "").toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).map(result => ({ destination: run.destination, type: documentType(result.title, result.description),
        title: result.title || new URL(result.url).hostname.replace(/^www\./, ""), description: result.description,
        url: result.url, retrievedAt: response.retrievedAt }));
      const warning = [response.warning,
        "Requirements can depend on citizenship, passport, transit points, and trip purpose. Confirm details with the linked authority."].filter(Boolean).join(" ");
      await ctx.runMutation(finishRef, { runId, results, warning });
    } catch {
      await ctx.runMutation(finishRef, { runId, results: [], error: "Required-document search is unavailable. Please try again." });
    }
    return null;
  },
});

export const onComplete = internalMutation({
  args: vOnCompleteValidator(v.object({ runId: v.id("requiredDocumentRuns") })),
  returns: v.null(),
  handler: async (ctx, { context }) => {
    await ctx.runMutation(finishRef, { runId: context.runId, results: [],
      error: "Required-document search was interrupted. Please try again." });
    return null;
  },
});

export const cleanupTrip = internalMutation({
  args: { tripId: v.id("trips") },
  returns: v.null(),
  handler: async (ctx, { tripId }) => {
    if (await ctx.db.get("trips", tripId)) return null;
    const runs = await ctx.db.query("requiredDocumentRuns").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(20);
    for (const run of runs) {
      if (run.workId && ["pending", "running"].includes(run.status)) await pool.cancel(ctx, run.workId as WorkId);
      await ctx.db.delete("requiredDocumentRuns", run._id);
    }
    if (runs.length === 20) await ctx.scheduler.runAfter(0, cleanupRef, { tripId });
    return null;
  },
});
