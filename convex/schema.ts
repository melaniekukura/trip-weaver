import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { tripFields } from "./tripFields";
import { flightPlanFields } from "./flightPlanFields";
import { interestTables } from "./interestSchema";
import { flightTables } from "./flightSchema";
import { emailTables } from "./emailSchema";
import { assistantTables } from "./assistantSchema";

export default defineSchema({
  ...authTables,
  ...flightTables,
  ...interestTables,
  ...emailTables,
  ...assistantTables,
  trips: defineTable(tripFields.extend({
    flightPlan: v.optional(flightPlanFields),
    ownerId: v.id("users"),
    updatedAt: v.number(),
  })).index("by_ownerId", ["ownerId"]),
});
