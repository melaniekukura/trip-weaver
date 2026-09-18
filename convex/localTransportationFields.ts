import { v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { rideModes } from "./transportationBudget";

export const localRideMode = v.union(...rideModes.map(mode => v.literal(mode)));
export const localFare = v.object({
  mode: localRideMode, count: v.number(),
  status: v.union(v.literal("pending"), v.literal("priced"), v.literal("unknown")),
  amount: v.optional(v.number()), currency: v.optional(v.string()), sourceUrl: v.optional(v.string()),
  evidence: v.optional(v.string()), note: v.optional(v.string()), checkedAt: v.optional(v.number()),
});
export const localDestination = v.object({
  destination: v.string(), enabled: v.boolean(), searchKey: v.string(), generation: v.number(),
  completedAt: v.optional(v.number()), rides: v.array(localFare), workIds: v.optional(v.array(v.string())),
});
export type LocalDestination = Infer<typeof localDestination>;
export type LocalFare = Infer<typeof localFare>;
export const rideLabels = { bus: "Public bus", metro: "Metro / subway", tram: "Tram / streetcar", rail: "Local train",
  ferry: "Public ferry", taxi: "Taxi", rideshare: "Ride-hailing" };
export const localSearchKey = (trip: Pick<Doc<"trips">, "startDate" | "endDate">, destination: string) =>
  JSON.stringify([destination, trip.startDate, trip.endDate]);
export function currentLocalDestinations(trip: Doc<"trips">) {
  return [...new Set(trip.destinations)].map(destination => {
    const saved = trip.localTransportation?.find(item => item.destination === destination);
    return { destination, saved: saved?.searchKey === localSearchKey(trip, destination) ? saved : undefined };
  });
}
export function localFareContext(destination: string, dates: string, mode: LocalFare["mode"]) {
  return `Find the current ${rideLabels[mode]} fare for local travel within the city served by ${destination}, for ${dates}. Match this exact destination; do not use a similarly named city. Airport names/codes identify the city, not a request for airport transfers. ` +
    (mode === "taxi" || mode === "rideshare"
      ? "Find only an officially published complete fixed fare per vehicle for a clearly named local ride. State the route in note. Never present a starting fare, per-kilometer rate, range, surge estimate or invented typical trip as a per-ride total. If no complete fixed fare is published, return unknown."
      : "Find a standard adult single ride in the central city / basic local zone, per passenger. State operator, zone and ticket conditions in note. Exclude passes, bundles, concessions, airport premiums and intercity travel. If this mode does not operate here, or no exact single-ride fare is available, return unknown.");
}
