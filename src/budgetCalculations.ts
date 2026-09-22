import type { Doc } from "../convex/_generated/dataModel";
import { flightPlanItinerary } from "../convex/flightPlanFields";

export function transportationTotals(trip: Doc<"trips">) {
  const itinerary = flightPlanItinerary(trip);
  const legs = trip.flightPlan?.legs ?? [];
  const current = legs.filter(leg => leg.itinerary === itinerary);
  const flights = current.map(leg => {
    const roundTrip = leg.request.tripType === "round-trip";
    const source = roundTrip ? leg.returning : leg.outbound;
    const multiplier = leg.request.travelers === undefined ? trip.travelers : 1;
    return { leg, amount: source ? Math.round(source.flight.amount * 100) * multiplier / 100 : null };
  });
  const flightTotal = flights.reduce((total, flight) => total + (flight.amount ?? 0), 0);
  return { flights, flightTotal, staleCount: legs.length - current.length };
}

export const budgetMoney = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
