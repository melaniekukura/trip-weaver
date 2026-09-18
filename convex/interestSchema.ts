import { activityAccessibilityEvidence } from "./activityAccessibility";
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const discoveryKind = v.union(v.literal("activities"), v.literal("events"), v.literal("both"));
export const discoveryItem = v.object({
  kind: v.union(v.literal("activities"), v.literal("events")), title: v.string(), description: v.string(),
  accessibilityEvidence: v.optional(v.array(activityAccessibilityEvidence)),
  venue: v.optional(v.string()), dates: v.optional(v.string()), price: v.optional(v.string()),
  interest: v.optional(v.string()), detailed: v.optional(v.boolean()), url: v.string(), destination: v.string(), retrievedAt: v.string(),
});
export const ideaItinerary = v.object({ date: v.optional(v.string()), time: v.optional(v.string()), notes: v.optional(v.string()) });
export const interestTables = {
  interestRuns: defineTable({
    tripId: v.id("trips"), destination: v.string(), kind: discoveryKind, searchKey: v.string(),
    startDate: v.string(), endDate: v.string(), interests: v.array(v.string()),
    accessibility: v.optional(v.array(v.string())),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    results: v.array(discoveryItem), warnings: v.array(v.string()), error: v.optional(v.string()),
    workId: v.optional(v.string()), finishedAt: v.optional(v.number()), expiresAt: v.optional(v.number()),
  }).index("by_tripId_searchKey", ["tripId", "searchKey"]).index("by_tripId", ["tripId"]),
  interestFavorites: defineTable({ tripId: v.id("trips"), item: discoveryItem, itinerary: v.optional(ideaItinerary) })
    .index("by_tripId", ["tripId"]).index("by_tripId_url", ["tripId", "item.url"]),
};
