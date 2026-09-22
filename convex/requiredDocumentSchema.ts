import { defineTable } from "convex/server";
import { v } from "convex/values";

export const requiredDocumentType = v.union(v.literal("passport"), v.literal("visa"),
  v.literal("travel-authorization"), v.literal("health"), v.literal("arrival-form"), v.literal("entry-requirements"));

export const requiredDocumentResult = v.object({
  destination: v.string(),
  type: requiredDocumentType,
  title: v.string(),
  description: v.string(),
  url: v.string(),
  retrievedAt: v.string(),
});

export const requiredDocumentTables = {
  requiredDocumentRuns: defineTable({
    tripId: v.id("trips"),
    origin: v.string(),
    destination: v.string(),
    startDate: v.string(),
    searchKey: v.string(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    results: v.array(requiredDocumentResult),
    warning: v.optional(v.string()),
    error: v.optional(v.string()),
    workId: v.optional(v.string()),
    finishedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  }).index("by_tripId_and_searchKey", ["tripId", "searchKey"]).index("by_tripId", ["tripId"]),
};
