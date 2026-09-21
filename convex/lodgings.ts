import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import schema from "./schema";
import { lodgingFields } from "./lodgingSchema";
import { isSupportedCurrency } from "./currencies";

async function ownedTrip(ctx: QueryCtx, tripId: Id<"trips">) {
  const userId = await getAuthUserId(ctx);
  const trip = await ctx.db.get("trips", tripId);
  if (!userId || !trip || trip.ownerId !== userId) {
    throw new ConvexError({ message: "This trip is unavailable." });
  }
  return trip;
}

function validDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function cleanOptional(value: string | undefined, maximum: number, label: string) {
  const cleaned = value?.trim();
  if (cleaned && cleaned.length > maximum) throw new ConvexError({ message: `${label} must be ${maximum} characters or fewer.` });
  return cleaned || undefined;
}

function validateLodging(trip: Doc<"trips">, input: Infer<typeof lodgingFields>) {
  const destination = input.destination.trim();
  const name = input.name.trim();
  if (!destination || destination.length > 120) {
    throw new ConvexError({ message: "City or destination must contain between 1 and 120 characters." });
  }
  if (!name || name.length > 160) throw new ConvexError({ message: "Property name must contain between 1 and 160 characters." });
  if (!validDate(input.checkInDate) || !validDate(input.checkOutDate) || input.checkOutDate <= input.checkInDate) {
    throw new ConvexError({ message: "Check-out must be after a valid check-in date." });
  }
  if (input.checkInDate < trip.startDate || input.checkOutDate > trip.endDate) {
    throw new ConvexError({ message: "Lodging dates must fall within the trip dates." });
  }
  if (input.totalCost !== undefined && (!Number.isFinite(input.totalCost) || input.totalCost < 0 ||
      input.totalCost > 1_000_000_000 || Math.abs(input.totalCost * 100 - Math.round(input.totalCost * 100)) > 0.0001)) {
    throw new ConvexError({ message: "Total cost must be a positive amount with at most two decimal places." });
  }
  const currency = input.currency.trim().toUpperCase();
  if (!isSupportedCurrency(currency)) throw new ConvexError({ message: "Choose a supported currency." });
  const bookingUrl = cleanOptional(input.bookingUrl, 2000, "Booking link");
  if (bookingUrl) {
    try {
      const url = new URL(bookingUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch { throw new ConvexError({ message: "Enter a valid http or https booking link." }); }
  }
  return {
    ...(input.type !== undefined ? { type: input.type } : {}),
    destination,
    name,
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    booked: input.booked,
    currency,
    ...(input.totalCost !== undefined ? { totalCost: input.totalCost } : {}),
    ...(cleanOptional(input.address, 300, "Address") ? { address: cleanOptional(input.address, 300, "Address") } : {}),
    ...(bookingUrl ? { bookingUrl } : {}),
    ...(cleanOptional(input.confirmationNumber, 120, "Confirmation number") ? { confirmationNumber: cleanOptional(input.confirmationNumber, 120, "Confirmation number") } : {}),
    ...(cleanOptional(input.notes, 4000, "Notes") ? { notes: cleanOptional(input.notes, 4000, "Notes") } : {}),
  };
}

export const list = query({
  args: { tripId: v.id("trips") },
  returns: v.array(schema.doc("lodgings")),
  handler: async (ctx, { tripId }) => {
    await ownedTrip(ctx, tripId);
    return await ctx.db.query("lodgings").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(100);
  },
});

export const create = mutation({
  args: { tripId: v.id("trips"), lodging: lodgingFields },
  returns: v.id("lodgings"),
  handler: async (ctx, { tripId, lodging }) => {
    const trip = await ownedTrip(ctx, tripId);
    const existing = await ctx.db.query("lodgings").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(100);
    if (existing.length >= 100) throw new ConvexError({ message: "Remove a stay before adding another (100 maximum)." });
    return await ctx.db.insert("lodgings", { tripId, ...validateLodging(trip, lodging), updatedAt: Date.now() });
  },
});

export const update = mutation({
  args: { lodgingId: v.id("lodgings"), lodging: lodgingFields },
  returns: v.null(),
  handler: async (ctx, { lodgingId, lodging }) => {
    const existing = await ctx.db.get("lodgings", lodgingId);
    if (!existing) throw new ConvexError({ message: "This stay is unavailable." });
    const trip = await ownedTrip(ctx, existing.tripId);
    await ctx.db.patch("lodgings", lodgingId, { ...validateLodging(trip, lodging), updatedAt: Date.now() });
    return null;
  },
});

export const remove = mutation({
  args: { lodgingId: v.id("lodgings") },
  returns: v.null(),
  handler: async (ctx, { lodgingId }) => {
    const lodging = await ctx.db.get("lodgings", lodgingId);
    if (!lodging) throw new ConvexError({ message: "This stay is unavailable." });
    await ownedTrip(ctx, lodging.tripId);
    await ctx.db.delete("lodgings", lodgingId);
    return null;
  },
});

export const cleanupTrip = internalMutation({
  args: { tripId: v.id("trips") },
  returns: v.null(),
  handler: async (ctx, { tripId }) => {
    if (await ctx.db.get("trips", tripId)) return null;
    const lodgings = await ctx.db.query("lodgings").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(100);
    for (const lodging of lodgings) await ctx.db.delete("lodgings", lodging._id);
    return null;
  },
});
