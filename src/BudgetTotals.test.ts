import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { expect, test, vi } from "vitest";
import { BudgetCostSummary, TripCardCost } from "./BudgetCostSummary";
import { BudgetGraphs } from "./BudgetGraphs";
import { TransportationBudget } from "./TransportationBudget";
import { ExtraFees } from "./ExtraFees";
import { Trips } from "./Trips";
import type { Doc } from "../convex/_generated/dataModel";
import type { FeeResult } from "../convex/extraFeeResearch";
import { flightPlanItinerary } from "../convex/flightPlanFields";
import { localSearchKey } from "../convex/localTransportationFields";
import { budgetCosts, convertBudgetCosts, dailyCosts } from "./budgetCosts";
const { rates, query, paginated } = vi.hoisted(() => ({
  rates: { base: "USD", rates: { EUR: 0.5, GBP: 0.25 }, date: "2026-09-18" }, query: vi.fn(), paginated: vi.fn(),
}));
vi.mock("./exchangeRates", () => ({ cachedExchangeRates: () => rates, loadExchangeRates: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: query, usePaginatedQuery: paginated, useMutation: () => vi.fn() }));
const basic = { _id: "trip", name: "Europe", currency: "USD", budget: 9999, origin: "DTW", destinations: ["Paris", "London"],
  travelers: 2, interests: [], startDate: "2026-10-01", endDate: "2026-10-03" } as unknown as Doc<"trips">;
const source = { flight: { amount: 100, airline: "Airline" } } as Doc<"researchSources">;
const trip: Doc<"trips"> = { ...basic,
  flightPlan: { revision: 1, confirmed: false, legs: [{ index: 0, itinerary: flightPlanItinerary(basic), booked: false,
    request: { origin: "DTW", destination: "Paris", departureDate: basic.startDate }, outbound: source }] },
  localTransportation: [
    { destination: "Paris", searchKey: localSearchKey(basic, "Paris"), enabled: true, generation: 1,
      rides: [{ mode: "bus", count: 4, status: "priced", amount: 2.5, currency: "EUR" }] },
    { destination: "London", searchKey: localSearchKey(basic, "London"), enabled: true, generation: 1,
      rides: [{ mode: "taxi", count: 2, status: "priced", amount: 5, currency: "GBP" }] },
  ],
};
const fees: FeeResult[] = ([['activities', 10, 'EUR'], ['baggage', 30, 'USD'], ['restaurants', 15, 'USD'], ['car', 10, 'USD']] as const)
  .map(([category, amount, currency]) => ({ target: { id: category, category, title: category, quantity: 2, unit: "per person", query: "", context: "" }, status: "priced", amount, currency }));
const lodgings = [{ _id: "stay" as Doc<"lodgings">["_id"], name: "Paris Hotel", destination: "Paris", checkInDate: "2026-10-01",
  checkOutDate: "2026-10-03", booked: true, totalCost: 300, currency: "EUR", tripId: trip._id, updatedAt: 1 }] as Doc<"lodgings">[];
test("one converted total includes every tab and reconciles with category and daily breakdowns", () => {
  const costs = convertBudgetCosts(budgetCosts(trip, fees, lodgings), "USD", rates)!;
  expect(costs.totals).toEqual({ USD: 1010 });
  expect(costs.transportationTotals).toEqual({ USD: 260 });
  expect(costs.extraFeeTotals).toEqual({ USD: 150 });
  expect(costs.breakdown.find(category => category.id === "lodging")?.totals).toEqual({ USD: 600 });
  expect(costs.breakdown.reduce((sum, category) => sum + (category.totals.USD ?? 0), 0)).toBe(1010);
  expect(dailyCosts(trip.startDate, trip.endDate, costs.entries)?.days.map(day => day.cents)).toEqual([87002, 7000, 6998]);
  const changed = { ...trip, localTransportation: trip.localTransportation!.map(row => row.destination === "Paris"
    ? { ...row, rides: row.rides.map(ride => ({ ...ride, count: 5 })) } : row) };
  expect(convertBudgetCosts(budgetCosts(changed, fees), "USD", rates)?.totals).toEqual({ USD: 415 });
  const disabled = { ...trip, localTransportation: trip.localTransportation!.map(row => row.destination === "London" ? { ...row, enabled: false } : row) };
  expect(convertBudgetCosts(budgetCosts(disabled, fees), "USD", rates)?.totals).toEqual({ USD: 370 });
});
test("Overview, trip cards, both graphs and tab subtotals display the same costs", () => {
  query.mockImplementation(reference => getFunctionName(reference) === "lodgings:list" ? lodgings : { run: null, results: fees });
  paginated.mockReturnValue({ results: [trip], status: "Exhausted", loadMore: vi.fn() });
  for (const element of [createElement(BudgetCostSummary, { trip, fees, lodgings, breakdown: true }), createElement(TripCardCost, { trip }),
    createElement(Trips, {}), createElement(Trips, { view: "budget" })]) {
    const html = renderToStaticMarkup(element);
    expect(html).toContain("$1,010.00"); expect(html).not.toContain("9,999"); expect(html).not.toContain(" + ");
  }
  const graphs = renderToStaticMarkup(createElement(BudgetGraphs, { trip, fees, lodgings }));
  expect(graphs).toContain("$1,010.00");
  expect(graphs).toContain("Local transportation $60.00");
  expect(graphs).toContain("Lodging $600.00");
  expect(graphs).toContain('aria-label="Oct 1: $870.02"');
  expect(graphs).not.toContain("All currencies");
  expect(renderToStaticMarkup(createElement(TransportationBudget, { trip }))).toContain("$260.00");
  expect(renderToStaticMarkup(createElement(ExtraFees, { trip, data: { run: null, results: fees } }))).toContain("$150.00");
});
test("missing or invalid exchange rates never silently drop foreign costs", () => {
  const native = budgetCosts(trip, fees);
  expect(convertBudgetCosts(native, "USD")).toBeNull();
  expect(convertBudgetCosts(native, "USD", { base: "EUR", rates: rates.rates })).toBeNull();
  expect(convertBudgetCosts(native, "USD", { base: "USD", rates: { EUR: 0, GBP: 0.25 } })).toBeNull();
  const usdOnly = budgetCosts({ ...trip, localTransportation: undefined });
  expect(convertBudgetCosts(usdOnly, "USD")?.totals).toEqual({ USD: 200 });
});

test("New Trip appears in My Trips but not Budget", () => {
  query.mockReturnValue({ run: null, results: [] });
  paginated.mockReturnValue({ results: [], status: "Exhausted", loadMore: vi.fn() });
  expect(renderToStaticMarkup(createElement(Trips, { view: "budget" }))).not.toContain("new-trip-button");
  expect(renderToStaticMarkup(createElement(Trips, { view: "trips" }))).toContain("new-trip-button");
});
