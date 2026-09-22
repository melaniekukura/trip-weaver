import { v } from "convex/values";
import { flightRequest } from "./flightSearch";
import { sourceFields } from "./flightSchema";

export const savedFlightSource = sourceFields.extend({ _id: v.id("researchSources"), _creationTime: v.number(), tripId: v.id("trips"), runId: v.id("researchRuns") });
export const flightPlanFields = v.object({
  revision: v.number(), confirmed: v.boolean(),
  legs: v.array(v.object({ index: v.number(), itinerary: v.string(), request: flightRequest,
    outbound: savedFlightSource, returning: v.optional(savedFlightSource), booked: v.boolean(), reference: v.optional(v.string()) })),
});

export function flightPlanItinerary(trip: { origin: string; destinations: string[]; startDate: string; endDate: string; travelers?: number }) {
  const route = [trip.origin, trip.destinations, trip.startDate, trip.endDate];
  return JSON.stringify(trip.travelers !== undefined && trip.travelers !== 1 ? [...route, trip.travelers] : route);
}
