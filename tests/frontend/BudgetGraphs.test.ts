import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";
import { BudgetGraphs } from "./BudgetGraphs";
import { BudgetCostSummary } from "./BudgetCostSummary";

const trip = { _id: "trip", name: "Paris", origin: "DTW", destinations: ["Paris"], travelers: 2,
  startDate: "2026-10-01", endDate: "2026-10-03",
  localTransportation: [{ destination: "Paris", searchKey: JSON.stringify(["Paris", "2026-10-01", "2026-10-03"]), generation: 1, enabled: true, rides: [{ mode: "taxi", count: 2, status: "priced", amount: 25, currency: "USD" }] }],
} as Doc<"trips">;

test("cost summary and both accessible charts use the same saved transportation total", () => {
  const summary = renderToStaticMarkup(createElement(BudgetCostSummary, { trip, fees: [] }));
  const graphs = renderToStaticMarkup(createElement(BudgetGraphs, { trip, fees: [] }));
  expect(summary).toContain("Total Cost:");
  expect(summary).toContain("$50.00");
  expect(graphs).toContain("Cost by category");
  expect(graphs).toContain("Spending per day");
  expect(graphs).toContain("conic-gradient");
  expect(graphs).toContain('aria-label="Oct 1: $16.67"');
  expect(graphs).toContain('aria-label="Oct 3: $16.66"');
  expect(graphs).toContain("Restaurants");
});

test("empty graphs show no invented sample spending", () => {
  const html = renderToStaticMarkup(createElement(BudgetGraphs, { trip: { ...trip, localTransportation: undefined }, fees: [] }));
  expect(html).toContain("No priced costs yet");
  expect(html).not.toContain("conic-gradient");
});
