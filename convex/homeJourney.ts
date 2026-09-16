import { flightPlanItinerary } from "./flightPlanFields";

type Route = { origin: string; destinations: string[]; startDate: string; endDate: string; homeReturnNotNeededFor?: string };
type Leg = { index: number; itinerary: string; request: { tripType?: string }; returning?: unknown };

export function sameTravelLocation(left: string, right: string) {
  const code = (value: string) => value.trim().match(/(?:^|\()([A-Z]{3})(?:; all airports\)|\))?$/i)?.[1].toUpperCase();
  return !!left.trim() && !!right.trim() && ((code(left) && code(left) === code(right)) || left.trim().toLowerCase() === right.trim().toLowerCase());
}

export function homeJourneyStatus(trip: Route, legs: Leg[] = []): "covered" | "not-needed" | "missing" {
  if (!trip.origin.trim() || !trip.destinations.length) return "covered";
  if (sameTravelLocation(trip.origin, trip.destinations.at(-1)!)) return "covered";
  const itinerary = flightPlanItinerary(trip);
  if (trip.destinations.length === 1 && legs.some(leg => leg.index === 0 && leg.itinerary === itinerary &&
    leg.request.tripType === "round-trip" && !!leg.returning)) return "covered";
  return trip.homeReturnNotNeededFor === itinerary ? "not-needed" : "missing";
}
