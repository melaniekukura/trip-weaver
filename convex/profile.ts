import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

async function currentUser(ctx: QueryCtx) {
  const id = await getAuthUserId(ctx);
  const user = id && await ctx.db.get("users", id);
  if (!user) throw new ConvexError({ message: "Sign in to view your profile." });
  return user;
}
export const get = query({
  args: {}, returns: v.object({ name: v.string(), email: v.string(), defaultAccessibility: v.string(), defaultAirport: v.union(v.string(), v.null()), maxConnections: v.union(v.number(), v.null()), revision: v.number() }),
  handler: async ctx => {
    const user = await currentUser(ctx);
    const settings = await ctx.db.query("profiles").withIndex("by_userId", q => q.eq("userId", user._id)).unique();
    return { name: user.name ?? "", email: user.email ?? "", defaultAirport: settings?.defaultAirport ?? null,
      defaultAccessibility: settings?.defaultAccessibility ?? "", maxConnections: settings?.maxConnections ?? null, revision: settings?.revision ?? 0 };
  },
});
export const save = mutation({
  args: { defaultAccessibility: v.optional(v.string()), name: v.string(), defaultAirport: v.union(v.string(), v.null()), maxConnections: v.union(v.number(), v.null()), revision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const name = args.name.trim(), defaultAirport = args.defaultAirport?.trim() || null;
    if (name.length > 120 || /[\x00-\x1f]/.test(name)) throw new ConvexError({ message: "Use a name of up to 120 characters." });
    if (defaultAirport && (defaultAirport.length > 120 || !/\([A-Z]{3}\)$/.test(defaultAirport) || /all airports/i.test(defaultAirport))) {
      throw new ConvexError({ message: "Choose an airport from the suggestions." });
    }
    if (args.maxConnections !== null && (!Number.isInteger(args.maxConnections) || args.maxConnections < 0 || args.maxConnections > 3)) {
      throw new ConvexError({ message: "Choose a maximum of 0–3 connections or no limit." });
    }
    const existing = await ctx.db.query("profiles").withIndex("by_userId", q => q.eq("userId", user._id)).unique();
    if (args.revision !== (existing?.revision ?? 0)) throw new ConvexError({ message: "Your profile changed in another window. Reload it before saving." });
    if (args.defaultAccessibility !== undefined && args.defaultAccessibility.length > 2000) {
      throw new ConvexError({ message: "Accessibility requirements must contain at most 2,000 characters." });
    }
    const defaultAccessibility = args.defaultAccessibility === undefined ? existing?.defaultAccessibility ?? "" :
      [...new Map(args.defaultAccessibility.split("\n").map(value => value.trim()).filter(Boolean).map(value => [value.toLowerCase(), value])).values()].join("\n");
    const values = { defaultAccessibility, userId: user._id, defaultAirport, maxConnections: args.maxConnections, revision: args.revision + 1 };
    if (existing) await ctx.db.patch("profiles", existing._id, values);
    else await ctx.db.insert("profiles", values);
    await ctx.db.patch("users", user._id, { name });
    return null;
  },
});
