import { getAuthUserId } from "@convex-dev/auth/server";
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { Workpool, vOnCompleteValidator } from "@convex-dev/workpool";
import type { WorkId } from "@convex-dev/workpool";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { localDestination, localFare, localFareContext, localRideMode, localSearchKey, rideLabels } from "./localTransportationFields";
import type { LocalDestination, LocalFare } from "./localTransportationFields";
import { rideModes } from "./transportationBudget";
import { researchFeePage, searchFeeSources } from "./firecrawl";

const pool = new Workpool(components.researchPool, { maxParallelism: 3, retryActionsByDefault: false });
const limiter = new RateLimiter(components.rateLimiter, {
  localFaresUser: { kind: "token bucket", rate: 20, period: HOUR, capacity: 20 },
  localFaresGlobal: { kind: "token bucket", rate: 100, period: HOUR, capacity: 30 },
});
const job = v.object({ tripId: v.id("trips"), destination: v.string(), generation: v.number(), mode: localRideMode });
async function ownedTrip(ctx: QueryCtx, tripId: Id<"trips">) {
  const user = await getAuthUserId(ctx), trip = await ctx.db.get("trips", tripId);
  if (!user || !trip || trip.ownerId !== user) throw new ConvexError({ message: "This trip is unavailable." });
  return trip;
}
export const setEnabled = mutation({
  args: { tripId: v.id("trips"), destination: v.string(), enabled: v.boolean(), refresh: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, { tripId, destination, enabled, refresh }) => {
    const trip = await ownedTrip(ctx, tripId);
    if (!trip.destinations.includes(destination)) throw new ConvexError({ message: "This destination is no longer in the trip." });
    const rows = (trip.localTransportation ?? []).filter(row => trip.destinations.includes(row.destination));
    const old = rows.find(row => row.destination === destination);
    const searchKey = localSearchKey(trip, destination);
    if (enabled && old?.enabled && old.searchKey === searchKey && !refresh) return null;
    if (!enabled && !old) return null;
    const cached = old?.searchKey === searchKey && old.completedAt !== undefined && old.completedAt > Date.now() - 6 * HOUR;
    const search = enabled && (!cached || refresh);
    if (search) {
      if (!process.env.FIRECRAWL_API_KEY?.trim()) throw new ConvexError({ message: "Transportation fare research is not configured yet." });
      for (const [name, key] of [["localFaresUser", trip.ownerId], ["localFaresGlobal", undefined]] as const) {
        if (!(await limiter.limit(ctx, name, { key })).ok) throw new ConvexError({ message: "Fare research limit reached. Please try again later." });
      }
    }
    for (const id of old?.workIds ?? []) await pool.cancel(ctx, id as WorkId);
    const generation = (old?.generation ?? 0) + 1;
    const next: LocalDestination = { destination, enabled, searchKey, generation,
      ...(cached && !search ? { completedAt: old!.completedAt } : {}),
      rides: rideModes.map(mode => {
        const previous = old?.rides.find(ride => ride.mode === mode);
        return !search && old?.searchKey === searchKey && previous && previous.status !== "pending" ? previous
          : { mode, count: previous?.count ?? 0, status: search ? "pending" : "unknown" };
      }),
    };
    if (search) next.workIds = await pool.enqueueActionBatch(ctx, internal.localTransportation.execute,
      rideModes.map(mode => ({ tripId, destination, generation, mode })),
      { retry: false, onComplete: internal.localTransportation.onComplete, context: { tripId, destination, generation } });
    await ctx.db.patch("trips", tripId, { localTransportation: [...rows.filter(row => row.destination !== destination), next] });
    return null;
  },
});
export const changeCount = mutation({
  args: { tripId: v.id("trips"), destination: v.string(), mode: localRideMode, delta: v.union(v.literal(-1), v.literal(1)) }, returns: v.null(),
  handler: async (ctx, { tripId, destination, mode, delta }) => {
    const trip = await ownedTrip(ctx, tripId);
    const selected = trip.localTransportation?.find(row => row.destination === destination);
    if (!trip.destinations.includes(destination) || !selected?.enabled || selected.searchKey !== localSearchKey(trip, destination)) {
      throw new ConvexError({ message: "Enable transportation for this destination first." });
    }
    await ctx.db.patch("trips", tripId, { localTransportation: trip.localTransportation!.map(row => row.destination !== destination ? row : {
      ...row, rides: row.rides.map(ride => ride.mode !== mode ? ride : { ...ride, count: Math.min(1000, Math.max(0, ride.count + delta)) }),
    }) });
    return null;
  },
});
export const load = internalQuery({
  args: job.fields, returns: v.union(v.null(), localDestination),
  handler: async (ctx, { tripId, destination, generation, mode }) => {
    const trip = await ctx.db.get("trips", tripId);
    const row = trip?.localTransportation?.find(item => item.destination === destination);
    return trip?.destinations.includes(destination) && row?.enabled && row.generation === generation &&
      row.searchKey === localSearchKey(trip, destination) && row.rides.some(ride => ride.mode === mode && ride.status === "pending") ? row : null;
  },
});
export const finish = internalMutation({
  args: { ...job.fields, fare: localFare }, returns: v.null(),
  handler: async (ctx, { fare, ...args }) => {
    const active: LocalDestination | null = await ctx.runQuery(internal.localTransportation.load, args);
    if (!active) return null;
    const trip = (await ctx.db.get("trips", args.tripId))!;
    const rides = active.rides.map(ride => ride.mode === args.mode ? { ...fare, mode: ride.mode, count: ride.count } : ride);
    await ctx.db.patch("trips", trip._id, { localTransportation: trip.localTransportation!.map(row => row.destination !== args.destination ? row : {
      ...row, rides, ...(rides.every(ride => ride.status !== "pending") ? { completedAt: Date.now(), workIds: [] } : {}),
    }) });
    return null;
  },
});
export const execute = internalAction({
  args: job.fields, returns: v.null(),
  handler: async (ctx, args) => {
    const active: LocalDestination | null = await ctx.runQuery(internal.localTransportation.load, args);
    if (!active) return null;
    let fare: LocalFare = { mode: args.mode, count: 0, status: "unknown", note: "No applicable per-ride price confirmed." };
    try {
      const dates = JSON.parse(active.searchKey).slice(1).join(" through ");
      const urls = await searchFeeSources(`${args.destination} ${rideLabels[args.mode]} official single ride fare ${dates}`);
      for (const url of urls) {
        if (!await ctx.runQuery(internal.localTransportation.load, args)) return null;
        const quote = await researchFeePage(url, localFareContext(args.destination, dates, args.mode)).catch(() => null);
        if (quote) { fare = { ...fare, ...quote, status: "priced", checkedAt: Date.now() }; break; }
      }
    } catch { fare.note = "Fare research unavailable. Try refreshing prices."; }
    await ctx.runMutation(internal.localTransportation.finish, { ...args, fare });
    return null;
  },
});
export const onComplete = internalMutation({
  args: vOnCompleteValidator(job.omit("mode")), returns: v.null(),
  handler: async (ctx, { context, result, workId }) => {
    if (result.kind === "success") return null;
    const trip = await ctx.db.get("trips", context.tripId);
    const row = trip?.localTransportation?.find(item => item.destination === context.destination);
    if (row?.generation !== context.generation) return null;
    const mode = rideModes[row.workIds?.indexOf(workId) ?? -1];
    if (mode) await ctx.runMutation(internal.localTransportation.finish, { ...context, mode,
      fare: { mode, count: 0, status: "unknown", note: "Research interrupted. Try refreshing prices." } });
    return null;
  },
});
