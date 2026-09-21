import { defineTable } from "convex/server";
import { v } from "convex/values";

export const lodgingType = v.union(v.literal("hotel"), v.literal("hostel"), v.literal("vacation-rental"),
  v.literal("resort"), v.literal("bed-and-breakfast"), v.literal("other"));

export const lodgingFields = v.object({
  type: v.optional(lodgingType),
  destination: v.string(),
  name: v.string(),
  address: v.optional(v.string()),
  checkInDate: v.string(),
  checkOutDate: v.string(),
  booked: v.boolean(),
  totalCost: v.optional(v.number()),
  currency: v.string(),
  bookingUrl: v.optional(v.string()),
  confirmationNumber: v.optional(v.string()),
  notes: v.optional(v.string()),
});

export const lodgingTables = {
  lodgings: defineTable(lodgingFields.extend({
    tripId: v.id("trips"),
    updatedAt: v.number(),
  })).index("by_tripId", ["tripId"]),
  lodgingRuns: defineTable({
    tripId: v.id("trips"),
    destination: v.string(),
    type: lodgingType,
    searchKey: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    results: v.array(v.object({ title: v.string(), description: v.string(), url: v.string(), retrievedAt: v.string() })),
    warning: v.optional(v.string()),
    error: v.optional(v.string()),
    workId: v.optional(v.string()),
    finishedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  }).index("by_tripId_and_searchKey", ["tripId", "searchKey"]).index("by_tripId", ["tripId"]),
};
