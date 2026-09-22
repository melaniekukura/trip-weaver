import { getAuthUserId } from "@convex-dev/auth/server";
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { Workpool, vOnCompleteValidator } from "@convex-dev/workpool";
import type { WorkId } from "@convex-dev/workpool";
import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { checkFirecrawlBudget } from "./firecrawl";
import { lodgingType } from "./lodgingSchema";
import schema from "./schema";

const pool = new Workpool(components.researchPool, { maxParallelism: 2, retryActionsByDefault: false });
const limiter = new RateLimiter(components.rateLimiter, {
  lodgingUser: { kind: "token bucket", rate: 12, period: HOUR, capacity: 6 },
  lodgingGlobal: { kind: "token bucket", rate: 100, period: HOUR, capacity: 12 },
});
const searchArgs = { tripId: v.id("trips"), destination: v.string(), type: lodgingType };
const lodgingIntermediaries = ["agoda.com", "americanexpress.com", "booking.com", "cntraveler.com", "expedia.com",
  "facebook.com", "hotels.com", "instagram.com", "kayak.com", "lonelyplanet.com", "oyster.com", "reddit.com",
  "thehotelguru.com", "tiktok.com", "timeout.com", "tripadvisor.com", "trivago.com", "travelandleisure.com",
  "usnews.com", "vio.com", "youtube.com"];

async function ownedTrip(ctx: QueryCtx, tripId: Id<"trips">) {
  const userId = await getAuthUserId(ctx);
  const trip = await ctx.db.get("trips", tripId);
  if (!userId || !trip || trip.ownerId !== userId) throw new ConvexError({ message: "This trip is unavailable." });
  return trip;
}

function details(destination: string, type: Infer<typeof lodgingType>, startDate: string, endDate: string) {
  destination = destination.trim();
  if (!destination || destination.length > 120) {
    throw new ConvexError({ message: "City or destination must contain between 1 and 120 characters." });
  }
  return { destination, type, startDate, endDate, searchKey: JSON.stringify([destination, type, startDate, endDate, "official-v7"]) };
}

function destinationLabel(value: string) {
  return value.split(" — ")[0].replace(/\s*\([^)]*\)$/, "");
}

function typeLabel(type: string) {
  return ({ hotel: "hotels", hostel: "hostels", "vacation-rental": "vacation rentals and Airbnb-style stays",
    resort: "resorts", "bed-and-breakfast": "bed and breakfasts", other: "lodging" } as Record<string, string>)[type] ?? "lodging";
}

export function isEnglishLodgingResult(title: string, description: string) {
  const text = `${title} ${description}`.toLocaleLowerCase();
  const letters = [...text].filter(character => /\p{L}/u.test(character));
  if (!letters.length) return false;
  const nonLatin = letters.filter(character => !/\p{Script=Latin}/u.test(character)).length;
  if (nonLatin / letters.length > 0.08) return false;
  const words = text.match(/\p{L}+/gu) ?? [];
  const nonEnglishMarkers = new Set(["avec", "chambres", "vue", "camere", "prenota", "albergo", "ubicado", "habitaciones",
    "desayuno", "zimmer", "unterkunft"]);
  return words.filter(word => nonEnglishMarkers.has(word)).length < 2;
}

function normalizedText(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesDestination(title: string, description: string, url: string, destination: string) {
  const city = normalizedText(destinationLabel(destination).split(",")[0]).trim();
  if (!city) return false;
  const cityPattern = escapePattern(city).replace(/\s+/g, "\\s+");
  const direct = new RegExp(`\\b${cityPattern}\\b`);
  const parsed = new URL(url);
  const titleAndUrl = normalizedText(`${title} ${parsed.hostname} ${parsed.pathname.replace(/[-_/]+/g, " ")}`);
  if (direct.test(titleAndUrl)) return true;
  const context = normalizedText(description);
  return new RegExp(`\\b(?:(?:in|near|at)\\s+(?:central\\s+|downtown\\s+)?${cityPattern}|(?:central|downtown)\\s+${cityPattern}|(?:center|centre|heart)\\s+of\\s+(?:historic\\s+)?${cityPattern}|${cityPattern}\\s+(?:hotel|hostel|resort|accommodation))\\b`).test(context);
}

export function isRelevantLodgingResult(title: string, description: string, url: string,
    type: Infer<typeof lodgingType>, destination?: string) {
  const text = normalizedText(`${title} ${description} ${url}`);
  const hostname = new URL(url).hostname.toLocaleLowerCase().replace(/^www\./, "");
  if (lodgingIntermediaries.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) return false;
  const pathname = new URL(url).pathname.toLocaleLowerCase();
  if (/\b(concert|event tickets?|tour dates?|car rentals?|rental cars?|vehicle hire|airport transfers?|real estate|homes? for sale|flights?|airlines?)\b/.test(text)) return false;
  const normalizedTitle = normalizedText(title);
  if (/\b(reviews?|my honest stay|travel blog|versus|vs\.?)\b/.test(normalizedTitle) ||
      /\/(?:blog|reviews?|articles?|guides?)(?:\/|$)/.test(pathname)) return false;
  if (/\b(?:best|top)\s+(?:luxury\s+)?hotels?\b|\b\d+\s+(?:best|top)\s+hotels?\b|\bwhere to stay\b|\bhotel guide\b|\bcompare hotels?\b|\bfavou?rite hotels?\b|\bhotels?\s*(?:&|and)\s*resorts?\b/.test(normalizedTitle)) return false;
  const typePatterns: Record<Infer<typeof lodgingType>, RegExp> = {
    hotel: /\b(hotels?|inns?|suites?|accommodations?|lodging)\b/,
    hostel: /\b(hostels?|backpackers?|dormitories|dorms?)\b/,
    "vacation-rental": /\b(vacation rentals?|holiday rentals?|airbnb|vrbo|villas?|cottages?|chalets?|rental homes?|serviced apartments?)\b/,
    resort: /\bresorts?\b/,
    "bed-and-breakfast": /\b(bed (?:and|&) breakfasts?|b&bs?|guesthouses?|inns?)\b/,
    other: /\b(hotels?|hostels?|resorts?|inns?|lodging|accommodations?|guesthouses?|vacation rentals?|airbnb|vrbo)\b/,
  };
  const matchesType = type === "hotel"
    ? typePatterns.hotel.test(text) && !/\b(hostels?|vacation rentals?|holiday rentals?|airbnb|vrbo|bed (?:and|&) breakfasts?|b&bs?)\b/.test(text)
    : typePatterns[type].test(text);
  return matchesType && (!destination || matchesDestination(title, description, url, destination));
}

export const start = mutation({
  args: { ...searchArgs, refresh: v.optional(v.boolean()), sessionId: v.optional(v.string()) },
  returns: v.object({ runId: v.id("lodgingRuns"), reused: v.boolean() }),
  handler: async (ctx, args) => {
    const trip = await ownedTrip(ctx, args.tripId);
    const search = details(args.destination, args.type, trip.startDate, trip.endDate);
    const recent = await ctx.db.query("lodgingRuns").withIndex("by_tripId_and_searchKey", q =>
      q.eq("tripId", trip._id).eq("searchKey", search.searchKey)).order("desc").take(10);
    const existing = recent.find(run => run.status === "pending" || run.status === "running") ??
      (!args.refresh ? recent.find(run => run.status === "completed" && (run.expiresAt ?? 0) > Date.now()) : undefined);
    if (existing) return { runId: existing._id, reused: true };
    if (!process.env.FIRECRAWL_API_KEY?.trim()) throw new ConvexError({ message: "Lodging search is not configured yet." });
    for (const [name, key] of [["lodgingUser", trip.ownerId], ["lodgingGlobal", undefined]] as const) {
      const status = await limiter.limit(ctx, name, { key });
      if (!status.ok) throw new ConvexError({ message: `Lodging search limit reached. Try again in ${Math.max(1, Math.ceil(status.retryAfter / 60000))} minute(s).` });
    }
    await checkFirecrawlBudget(ctx, args.sessionId);
    const runId = await ctx.db.insert("lodgingRuns", { tripId: trip._id, ...search, status: "pending", results: [] });
    const workId = await pool.enqueueAction(ctx, internal.lodgingJobs.execute,
      { runId, ...(args.sessionId ? { sessionId: args.sessionId } : {}) },
      { retry: false, onComplete: internal.lodgingJobs.onComplete, context: { runId } });
    await ctx.db.patch("lodgingRuns", runId, { workId });
    return { runId, reused: false };
  },
});

export const latest = query({
  args: { ...searchArgs, runId: v.optional(v.id("lodgingRuns")) },
  returns: v.union(v.null(), schema.doc("lodgingRuns")),
  handler: async (ctx, args) => {
    const trip = await ownedTrip(ctx, args.tripId);
    const { searchKey } = details(args.destination, args.type, trip.startDate, trip.endDate);
    if (args.runId) {
      const run = await ctx.db.get("lodgingRuns", args.runId);
      if (run?.tripId === trip._id && run.searchKey === searchKey) return run;
    }
    return await ctx.db.query("lodgingRuns").withIndex("by_tripId_and_searchKey", q =>
      q.eq("tripId", trip._id).eq("searchKey", searchKey)).order("desc").first();
  },
});

export const claim = internalMutation({
  args: { runId: v.id("lodgingRuns") },
  returns: v.union(v.null(), schema.doc("lodgingRuns")),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("lodgingRuns", runId);
    if (!run || run.status !== "pending" || !await ctx.db.get("trips", run.tripId)) return null;
    await ctx.db.patch("lodgingRuns", runId, { status: "running" });
    return run;
  },
});

export const finish = internalMutation({
  args: { runId: v.id("lodgingRuns"), results: v.array(v.object({ title: v.string(), description: v.string(), url: v.string(), retrievedAt: v.string() })),
    warning: v.optional(v.string()), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { runId, results, warning, error }) => {
    const run = await ctx.db.get("lodgingRuns", runId);
    if (!run || !["pending", "running"].includes(run.status) || !await ctx.db.get("trips", run.tripId)) return null;
    await ctx.db.patch("lodgingRuns", runId, { results: results.slice(0, 5), ...(warning ? { warning: warning.slice(0, 2000) } : {}),
      ...(error ? { error } : {}), status: error ? "failed" : "completed", finishedAt: Date.now(), expiresAt: Date.now() + 6 * HOUR });
    return null;
  },
});

export const execute = internalAction({
  args: { runId: v.id("lodgingRuns"), sessionId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { runId, sessionId }) => {
    const run = await ctx.runMutation(internal.lodgingJobs.claim, { runId });
    if (!run) return null;
    try {
      const location = destinationLabel(run.destination);
      const response = await ctx.runAction(internal.firecrawl.search, { query: `official ${typeLabel(run.type)} physically located in "${location}" direct booking English -review -reviews -blog -guide -facebook -reddit`, location,
        excludeDomains: lodgingIntermediaries, limit: 5, budgetReserved: true,
        ...(sessionId ? { sessionId } : {}) });
      const englishResults = response.results.filter(result => isEnglishLodgingResult(result.title, result.description));
      const results = englishResults.filter(result =>
        isRelevantLodgingResult(result.title, result.description, result.url, run.type, location)).slice(0, 5);
      const warnings = [response.warning,
        englishResults.length < response.results.length ? "Some non-English results were omitted." : null,
        results.length < englishResults.length ? "Some unrelated results were omitted." : null].filter(Boolean);
      await ctx.runMutation(internal.lodgingJobs.finish, { runId, results: results.map(result => ({
        title: result.title || new URL(result.url).hostname.replace(/^www\./, ""), description: result.description,
        url: result.url, retrievedAt: response.retrievedAt,
      })), ...(warnings.length ? { warning: warnings.join(" ") } : {}) });
    } catch {
      await ctx.runMutation(internal.lodgingJobs.finish, { runId, results: [], error: "Lodging search is unavailable. Please try again." });
    }
    return null;
  },
});

export const onComplete = internalMutation({
  args: vOnCompleteValidator(v.object({ runId: v.id("lodgingRuns") })),
  returns: v.null(),
  handler: async (ctx, { context }) => {
    await ctx.runMutation(internal.lodgingJobs.finish, { runId: context.runId, results: [], error: "Lodging search was interrupted. Please try again." });
    return null;
  },
});

export const cleanupTrip = internalMutation({
  args: { tripId: v.id("trips") },
  returns: v.null(),
  handler: async (ctx, { tripId }) => {
    if (await ctx.db.get("trips", tripId)) return null;
    const runs = await ctx.db.query("lodgingRuns").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(20);
    for (const run of runs) {
      if (run.workId && ["pending", "running"].includes(run.status)) await pool.cancel(ctx, run.workId as WorkId);
      await ctx.db.delete("lodgingRuns", run._id);
    }
    if (runs.length === 20) await ctx.scheduler.runAfter(0, internal.lodgingJobs.cleanupTrip, { tripId });
    return null;
  },
});
