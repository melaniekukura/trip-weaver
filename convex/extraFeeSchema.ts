import { defineTable } from "convex/server";
import { v } from "convex/values";

export const feeCategory = v.union(v.literal("activities"), v.literal("restaurants"), v.literal("baggage"), v.literal("car"));
export const feeSettings = v.object({
  bagsPerTraveler: v.number(), rentalCar: v.boolean(), rentalProvider: v.string(), parkingLocation: v.string(), carDays: v.number(),
});
export const feeTarget = v.object({
  id: v.string(), category: feeCategory, title: v.string(), query: v.string(), context: v.string(),
  quantity: v.number(), unit: v.string(), date: v.optional(v.string()), sourceUrl: v.optional(v.string()),
});
export const feeResult = v.object({
  target: feeTarget, status: v.union(v.literal("pending"), v.literal("priced"), v.literal("unknown")),
  amount: v.optional(v.number()), currency: v.optional(v.string()), sourceUrl: v.optional(v.string()),
  evidence: v.optional(v.string()), note: v.optional(v.string()), retrievedAt: v.optional(v.string()),
});
export const extraFeeTables = {
  extraFeeRuns: defineTable({
    tripId: v.id("trips"), ownerId: v.id("users"), searchKey: v.string(),
    status: v.union(v.literal("running"), v.literal("completed")), results: v.array(feeResult),
    workIds: v.optional(v.array(v.string())),
    finishedAt: v.optional(v.number()), expiresAt: v.optional(v.number()),
  }).index("by_tripId_searchKey", ["tripId", "searchKey"]).index("by_tripId", ["tripId"]),
};
