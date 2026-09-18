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

export default defineSchema({
  ...authTables,
  ...flightTables,
  ...interestTables,
  ...emailTables,
  ...extraFeeTables,
  ...assistantTables,
  trips: defineTable(tripFields.extend({
    flightPlan: v.optional(flightPlanFields),
    extraFeeSettings: v.optional(feeSettings),
    transportationBudget: v.optional(transportationBudgetFields),
    localTransportation: v.optional(v.array(localDestination)),
    ownerId: v.id("users"),
    updatedAt: v.number(),
  })).index("by_ownerId", ["ownerId"]),
});
