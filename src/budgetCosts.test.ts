import { expect, test } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";
import type { FeeResult } from "../convex/extraFeeResearch";
import { budgetCosts, dailyCosts } from "./budgetCosts";
import { flightPlanItinerary } from "../convex/flightPlanFields";
const trip = { origin: "DTW", destinations: ["LAX"], travelers: 2, startDate: "2026-10-01", endDate: "2026-10-03" } as Doc<"trips">;
const fee = { target: { id: "fee", category: "activities", title: "Museum", quantity: 2, date: "2026-10-02", unit: "per person", query: "", context: "" }, status: "priced", amount: 10, currency: "EUR" } as FeeResult;
test("overview, cards and charts share totals while keeping currencies separate", () => {
  const input = { ...trip, transportationBudget: { revision: 1, includeRides: true, rides: [{ mode: "taxi" as const, count: 2, price: 25 }] } };
  const costs = budgetCosts(input, [fee, { ...fee, status: "unknown" }]);
  expect(costs.totals).toEqual({ USD: 50, EUR: 20 });
  expect(costs.unknown).toBe(1);
  expect(budgetCosts({ ...input, transportationBudget: { ...input.transportationBudget, includeRides: false } }, [fee]).totals).toEqual({ EUR: 20 });
});
test("daily allocations preserve every cent for bulk costs and split round trips once", () => {
  const source = { flight: { amount: 100.01, airline: "Airline" } } as Doc<"researchSources">;
  const costs = budgetCosts({ ...trip, flightPlan: { revision: 1, confirmed: false, legs: [{ index: 0, itinerary: flightPlanItinerary(trip),
    request: { origin: "DTW", destination: "LAX", departureDate: trip.startDate, returnDate: trip.endDate, tripType: "round-trip" },
    outbound: source, returning: source, booked: true }] } });
  expect(costs.totals.USD).toBe(200.02);
  const entries = [...costs.entries, { id: "bulk", title: "Ride estimate", currency: "USD", category: "transportation" as const, cents: 100 }];
  const daily = dailyCosts(trip.startDate, trip.endDate, entries)!;
  expect(daily.days.map(day => day.cents)).toEqual([10035, 33, 10034]);
  expect(daily.days.reduce((sum, day) => sum + day.cents, 0)).toBe(20102);
  expect(dailyCosts("invalid", trip.endDate, entries)).toBeNull();
});
test("out-of-trip activity dates remain in totals but are not silently reassigned to a trip day", () => {
  const costs = budgetCosts(trip, [{ ...fee, target: { ...fee.target, date: "2026-11-01" } }]);
  expect(dailyCosts(trip.startDate, trip.endDate, costs.entries)?.unscheduledCents).toBe(2000);
});
