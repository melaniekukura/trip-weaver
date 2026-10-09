import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";
import { TransportationBudget } from "./TransportationBudget";
import { localSearchKey } from "../convex/localTransportationFields";
const mutation = vi.fn();
vi.mock("convex/react", () => ({ useMutation: () => mutation }));
const trip = { _id: "trip", origin: "DTW", destinations: ["Paris", "London"], travelers: 1,
  startDate: "2026-10-01", endDate: "2026-10-05" } as Doc<"trips">;
test("one switch per destination, no tables or research on initial render", () => {
  const html = renderToStaticMarkup(createElement(TransportationBudget, { trip }));
  expect(html.match(/role="switch"/g)).toHaveLength(2);
  expect(html).not.toContain("<table");
  expect(mutation).not.toHaveBeenCalled();
});
test("only enabled destinations show fare tables, source details and ride controls", () => {
  const html = renderToStaticMarkup(createElement(TransportationBudget, { trip: { ...trip, localTransportation: [{
    destination: "Paris", enabled: true, generation: 1, searchKey: localSearchKey(trip, "Paris"), rides: [
      { mode: "bus", count: 2, status: "priced", amount: 2.5, currency: "EUR", sourceUrl: "https://transit.example/fares" },
      { mode: "taxi", count: 0, status: "unknown" },
    ],
  }] } }));
  expect(html.match(/<table/g)).toHaveLength(1);
  expect(html).toContain("€5.00");
  expect(html).toContain("View source");
  expect(html).toContain("Price not confirmed");
  expect(html).toContain("Add one Public bus ride in Paris");
  expect(html).not.toContain("Add one Public bus ride in London");
});

test("added transportation expenses appear as a quiet total breakdown", () => {
  const html = renderToStaticMarkup(createElement(TransportationBudget, { trip: { ...trip, currency: "USD", expenses: [
    { id: "rail", name: "Airport train", category: "Transportation", amount: 18, currency: "USD", date: "2026-10-01", revision: 1 },
    { id: "legacy", name: "Metro pass", category: "Local transportation", amount: 7, currency: "USD", date: "2026-10-02", revision: 1 },
    { id: "meal", name: "Lunch", category: "Restaurants", amount: 12, currency: "USD", date: "2026-10-01", revision: 1 },
  ] } }));
  expect(html).toContain("Added transportation expenses");
  expect(html).toContain("Airport train");
  expect(html).toContain("$18.00");
  expect(html).toContain("Metro pass");
  expect(html).not.toContain("Lunch");
});
