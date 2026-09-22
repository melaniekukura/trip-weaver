import { localDestination } from "./localTransportationFields";
import { extraFeeTables, feeSettings } from "./extraFeeSchema";
import { transportationBudgetFields } from "./transportationBudget";
import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { tripFields } from "./tripFields";
import { flightPlanFields } from "./flightPlanFields";
import { interestTables } from "./interestSchema";
import { flightTables } from "./flightSchema";
import { emailTables } from "./emailSchema";
import { assistantTables } from "./assistantSchema";
import { lodgingTables } from "./lodgingSchema";
import { expenseFields } from "./expenseFields";

export default defineSchema({
  ...authTables,
  profiles: defineTable({ defaultAccessibility: v.optional(v.string()), userId: v.id("users"), defaultAirport: v.union(v.string(), v.null()),
    maxConnections: v.union(v.number(), v.null()), revision: v.number() }).index("by_userId", ["userId"]),
  ...flightTables,
  ...interestTables,
  ...emailTables,
  ...extraFeeTables,
  ...assistantTables,
  ...lodgingTables,
  firecrawlBudgets: defineTable({
    scope: v.literal("trip-weaver"),
    reservedCredits: v.number(),
    usedCredits: v.optional(v.number()),
    trackingVersion: v.optional(v.literal(1)),
    updatedAt: v.number(),
  }).index("by_scope", ["scope"]),
  firecrawlBudgetSessions: defineTable({
    sessionId: v.string(),
    reservedCredits: v.number(),
    usedCredits: v.optional(v.number()),
    trackingVersion: v.optional(v.literal(1)),
    updatedAt: v.number(),
  }).index("by_sessionId", ["sessionId"]),
  trips: defineTable(tripFields.extend({
    expenses: v.optional(v.array(expenseFields)),
    flightPlan: v.optional(flightPlanFields),
    extraFeeSettings: v.optional(feeSettings),
    transportationBudget: v.optional(transportationBudgetFields),
    localTransportation: v.optional(v.array(localDestination)),
    ownerId: v.id("users"),
    updatedAt: v.number(),
  })).index("by_ownerId", ["ownerId"]),
});
