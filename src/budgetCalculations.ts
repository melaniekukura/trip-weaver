import type { Doc } from "../convex/_generated/dataModel";
import { flightPlanItinerary } from "../convex/flightPlanFields";

export const rideEstimates = [
  { mode: "bus", label: "Public bus", price: 3 },
  { mode: "metro", label: "Metro / subway", price: 4 },
  { mode: "tram", label: "Tram / streetcar", price: 4 },
  { mode: "rail", label: "Local train", price: 8 },
  { mode: "ferry", label: "Public ferry", price: 6 },
  { mode: "taxi", label: "Taxi", price: 25 },
  { mode: "rideshare", label: "Ride-hailing", price: 22 },
] as const;

export function transportationTotals(trip: Doc<"trips">) {
  const itinerary = flightPlanItinerary(trip);
  const legs = trip.flightPlan?.legs ?? [];
  const current = legs.filter(leg => leg.itinerary === itinerary);
  const flights = current.map(leg => {
    const roundTrip = leg.request.tripType === "round-trip";
    const source = roundTrip ? leg.returning : leg.outbound;
    return { leg, amount: source ? Math.round(source.flight.amount * 100) * trip.travelers / 100 : null };
  });
  const flightTotal = flights.reduce((total, flight) => total + (flight.amount ?? 0), 0);
  const rides = rideEstimates.map(estimate => ({ ...estimate,
    ...(trip.transportationBudget?.rides.find(ride => ride.mode === estimate.mode) ?? { count: 0 }),
  }));
  const rideTotal = rides.reduce((sum, ride) => sum + Math.round(ride.price * 100) * ride.count, 0) / 100;
  return { flights, flightTotal, rides, rideTotal, staleCount: legs.length - current.length,
    total: Math.round((flightTotal + (trip.transportationBudget?.includeRides ? rideTotal : 0)) * 100) / 100 };
}

export const budgetMoney = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
