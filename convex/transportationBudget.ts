import { ConvexError, v } from "convex/values";

export const rideModes = ["bus", "metro", "tram", "rail", "ferry", "taxi", "rideshare"] as const;
export const transportationBudgetFields = v.object({
  revision: v.number(), includeRides: v.boolean(),
  rides: v.array(v.object({ mode: v.union(...rideModes.map(mode => v.literal(mode))), count: v.number(), price: v.number() })),
});

export function validateRides(rides: { mode: typeof rideModes[number]; count: number; price: number }[]) {
  if (rides.length > rideModes.length || new Set(rides.map(ride => ride.mode)).size !== rides.length ||
    rides.some(ride => !Number.isInteger(ride.count) || ride.count < 0 || ride.count > 1000 ||
      !Number.isFinite(ride.price) || ride.price < 0 || ride.price > 100000 || Math.abs(ride.price * 100 - Math.round(ride.price * 100)) > 0.0001)) {
    throw new ConvexError({ message: "Enter unique transportation methods, up to 1,000 rides, and valid prices with at most two decimals." });
  }
  return rides;
}
