import { defineTable } from "convex/server";
import { v } from "convex/values";

import { flightRequest, flightOption } from "./flightSearch";

const flightTopic = v.literal("flights");
export const sourceFields = v.object({
  title: v.string(), category: flightTopic, description: v.string(),
  flight: flightOption,
  destination: v.string(), sourceUrl: v.string(), retrievedAt: v.string(),
});
export const flightTables = {
  researchRuns: defineTable({
    tripId: v.id("trips"), ownerId: v.id("users"), destination: v.string(), topic: flightTopic,
    flightRequest: flightRequest,
    outboundSourceId: v.optional(v.id("researchSources")),
    searchKey: v.string(), query: v.string(), tripUpdatedAt: v.number(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    workId: v.optional(v.string()), startedAt: v.optional(v.number()), finishedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()), error: v.optional(v.string()),
  }).index("by_tripId", ["tripId"]).index("by_tripId_searchKey", ["tripId", "searchKey"]),
  researchSources: defineTable(sourceFields.extend({ tripId: v.id("trips"), runId: v.id("researchRuns") }))
    .index("by_runId", ["runId"]).index("by_tripId", ["tripId"]),
};
