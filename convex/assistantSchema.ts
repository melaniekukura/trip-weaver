import { defineTable } from "convex/server";
import { v } from "convex/values";

export const assistantRequestStatus = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("failed"),
);

export const assistantTables = {
  assistantThreads: defineTable({
    tripId: v.id("trips"),
    ownerId: v.id("users"),
    threadId: v.string(),
    updatedAt: v.number(),
  }).index("by_tripId", ["tripId"]).index("by_ownerId", ["ownerId"]),
  assistantRequests: defineTable({
    tripId: v.id("trips"),
    ownerId: v.id("users"),
    threadId: v.string(),
    requestId: v.string(),
    status: assistantRequestStatus,
    attempts: v.number(),
    error: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_ownerId_and_requestId", ["ownerId", "requestId"])
    .index("by_tripId", ["tripId"]),
};
