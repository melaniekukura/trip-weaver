import { localSearchKey } from "../convex/localTransportationFields";
import { expect, test } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";
import type { FeeResult } from "../convex/extraFeeResearch";
import { budgetCosts, dailyCosts } from "./budgetCosts";
import { flightPlanItinerary } from "../convex/flightPlanFields";
const trip = { origin: "DTW", destinations: ["LAX"], travelers: 2, startDate: "2026-10-01", endDate: "2026-10-03" } as Doc<"trips">;
const fee = { target: { id: "fee", category: "activities", title: "Museum", quantity: 2, date: "2026-10-02", unit: "per person", query: "", context: "" }, status: "priced", amount: 10, currency: "EUR" } as FeeResult;
test("overview, cards and charts share totals while keeping currencies separate", () => {
  const input = { ...trip, localTransportation: [{ destination: "LAX", searchKey: localSearchKey(trip, "LAX"), generation: 1, enabled: true, rides: [{ mode: "taxi" as const, count: 2, status: "priced" as const, amount: 25, currency: "USD" }] }] };
  const costs = budgetCosts(input, [fee, { ...fee, status: "unknown" }]);
  expect(costs.totals).toEqual({ USD: 50, EUR: 20 });
  expect(costs.unknown).toBe(1);
  expect(budgetCosts({ ...input, localTransportation: input.localTransportation.map(row => ({ ...row, enabled: false })) }, [fee]).totals).toEqual({ EUR: 20 });
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

test("ignores removed destinations, stale dates, disabled destinations and legacy generic estimates", () => {
  const row = { destination: "LAX", searchKey: localSearchKey(trip, "LAX"), generation: 1, enabled: true,
    rides: [{ mode: "bus" as const, count: 3, status: "priced" as const, amount: 2.35, currency: "EUR" }] };
  const input = { ...trip, localTransportation: [row] };
  expect(budgetCosts(input).totals).toEqual({ EUR: 7.05 });
  expect(budgetCosts({ ...input, destinations: ["Paris"] }).totals).toEqual({});
  expect(budgetCosts({ ...input, endDate: "2026-10-06" }).totals).toEqual({});
  expect(budgetCosts({ ...trip, transportationBudget: { revision: 1, includeRides: true, rides: [{ mode: "bus", count: 3, price: 3 }] } }).totals).toEqual({});
  expect(budgetCosts({ ...input, localTransportation: [{ ...row, rides: [{ mode: "bus", count: 2, status: "unknown" }] }] })).toMatchObject({ totals: {}, unknown: 1 });
});

test("manual expenses contribute once to totals, custom categories and their selected day", () => {
  const base = { id: "one", name: "Gift", category: "Shopping", amount: 12.34, currency: "USD", date: "2026-10-02", revision: 1 };
  const costs = budgetCosts({ ...trip, expenses: [base, { ...base, id: "two", category: "shopping", amount: 5 },
    { ...base, id: "three", category: "Miscellaneous", amount: 2 }, { ...base, id: "four", category: "Restaurants", amount: 20 }] });
  expect(costs.totals.USD).toBe(39.34);
  expect(costs.breakdown.filter(item => item.id.startsWith("custom:"))).toEqual([
    expect.objectContaining({ id: "custom:shopping", label: "Shopping", totals: { USD: 17.34 } }),
  ]);
  expect(costs.breakdown.find(item => item.id === "miscellaneous")?.totals.USD).toBe(2);
  expect(costs.breakdown.find(item => item.id === "restaurants")?.totals.USD).toBe(20);
  expect(dailyCosts(trip.startDate, trip.endDate, costs.entries)?.days.map(day => day.cents)).toEqual([0, 3934, 0]);
});

test("manual transportation expenses contribute to the transportation subtotal", () => {
  const expense = { id: "train", name: "Train ticket", category: "Transportation", amount: 45, currency: "USD", date: "2026-10-02", revision: 1 };
  const costs = budgetCosts({ ...trip, expenses: [expense, { ...expense, id: "legacy", category: "Local transportation", amount: 5 }] });
  expect(costs.totals).toEqual({ USD: 50 });
  expect(costs.transportationTotals).toEqual({ USD: 50 });
  expect(costs.breakdown.find(item => item.id === "transportation")?.totals).toEqual({ USD: 50 });
});
