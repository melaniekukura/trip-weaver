import { defineTable } from "convex/server";
import { v } from "convex/values";

export const itineraryEmailItem = v.object({
  kind: v.union(v.literal("transportation"), v.literal("activity")),
  date: v.optional(v.string()),
  time: v.optional(v.string()),
  title: v.string(),
  location: v.string(),
  detail: v.optional(v.string()),
  notes: v.optional(v.string()),
  url: v.optional(v.string()),
  reference: v.optional(v.string()),
});

export const itineraryEmailSnapshot = v.object({
  name: v.string(),
  origin: v.string(),
  destinations: v.array(v.string()),
  startDate: v.string(),
  endDate: v.string(),
  travelers: v.number(),
  budget: v.union(v.number(), v.null()),
  currency: v.string(),
  accessibility: v.optional(v.string()),
  items: v.array(itineraryEmailItem),
});

export const emailDeliveryStatus = v.union(
  v.literal("queued"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("failed"),
);

export const emailTables = {
  emailDeliveries: defineTable({
    tripId: v.id("trips"),
    ownerId: v.id("users"),
    requestId: v.string(),
    recipient: v.string(),
    snapshotVersion: v.string(),
    snapshot: itineraryEmailSnapshot,
    status: emailDeliveryStatus,
    attempts: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
    agentmailMessageId: v.optional(v.string()),
    agentmailThreadId: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_ownerId_and_requestId", ["ownerId", "requestId"])
    .index("by_tripId", ["tripId"])
    .index("by_agentmailMessageId", ["agentmailMessageId"]),
};
