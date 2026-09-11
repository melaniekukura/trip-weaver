import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { tripFields } from "./tripFields";
import { flightTables } from "./flightSchema";

export default defineSchema({
  ...authTables,
  ...flightTables,
  trips: defineTable(tripFields.extend({
    ownerId: v.id("users"),
    updatedAt: v.number(),
  })).index("by_ownerId", ["ownerId"]),
});
