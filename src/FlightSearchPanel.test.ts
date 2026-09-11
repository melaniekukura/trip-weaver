import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { FlightSearchPanel } from "./FlightSearchPanel";
import type { Doc, Id } from "../convex/_generated/dataModel";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => vi.fn() }));

test("trip type and flight filters are visible before any results load", () => {
  const trip: Doc<"trips"> = {
    _id: "trip" as Id<"trips">, _creationTime: 0, ownerId: "user" as Id<"users">, updatedAt: 0, name: "California",
    origin: "DTW", destinations: ["LAX"], startDate: "2026-10-15", endDate: "2026-10-22",
    budget: null, currency: "USD", travelers: 1, interests: [],
  };
  const html = renderToStaticMarkup(createElement(FlightSearchPanel, { trip }));
  for (const label of ["Trip type", "One way", "Round trip", "Flight filters", "Depart by", "Arrive by", "Nonstop", "Maximum price (USD)"]) {
    expect(html).toContain(label);
  }
  expect(html.match(/type="time"/g)).toHaveLength(4);
});
