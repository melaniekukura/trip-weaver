import { expect, test } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";
import { flightPlanItinerary } from "../convex/flightPlanFields";
import { transportationTotals } from "./budgetCalculations";

const trip = { origin: "DTW", destinations: ["LAX"], startDate: "2026-10-15", endDate: "2026-10-22", travelers: 2 } as Doc<"trips">;
const leg = { index: 0, itinerary: flightPlanItinerary(trip), request: { origin: "DTW", destination: "LAX", departureDate: trip.startDate },
  outbound: { flight: { amount: 100.25 } }, booked: false } as NonNullable<Doc<"trips">["flightPlan"]>["legs"][number];

test("counts all selected legs for all travelers without requiring booked status", () => {
  const totals = transportationTotals({ ...trip, flightPlan: { revision: 1, confirmed: false, legs: [leg] } });
  expect(totals.flightTotal).toBe(200.5);
});

test("round-trip totals use the combined return fare once, and incomplete returns remain untotalled", () => {
  const roundTrip = { ...leg, request: { ...leg.request, tripType: "round-trip" as const, returnDate: trip.endDate } };
  const plan = { revision: 1, confirmed: false, legs: [roundTrip] };
  expect(transportationTotals({ ...trip, flightPlan: plan }).flights[0].amount).toBeNull();
  expect(transportationTotals({ ...trip, flightPlan: { ...plan, legs: [{ ...roundTrip, returning: { ...leg.outbound, flight: { ...leg.outbound.flight, amount: 250.75 } } }] } }).flightTotal).toBe(501.5);
});

test("excludes outdated itineraries", () => {
  expect(transportationTotals({ ...trip, flightPlan: { revision: 1, confirmed: false, legs: [{ ...leg, itinerary: "old route" }] } }))
    .toMatchObject({ staleCount: 1, flightTotal: 0 });
});
