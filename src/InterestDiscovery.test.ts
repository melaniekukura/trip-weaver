import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { InterestDiscovery } from "./InterestDiscovery";
import type { Id } from "../convex/_generated/dataModel";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: query, useMutation: () => vi.fn() }));

test("interest discovery offers activities and events without submitting the planner form", () => {
  query.mockReturnValue(undefined);
  const html = renderToStaticMarkup(createElement(InterestDiscovery, { destinations: ["Milan"], interests: ["Art", "Food"], onSaveTrip: vi.fn() }));
  for (const label of ["Find things to do", "Saved ideas", "Art", "Food", "six hours", "verify event dates"]) expect(html).toContain(label);
  expect(html).not.toContain('<form');
  expect(html).not.toContain('type="submit"');
});

test("event results are labeled as leads with source links and partial-search feedback", () => {
  const item = { kind: "events", title: "Art exhibition", description: "Visitor information", url: "https://example.org/event", destination: "Milan", retrievedAt: "2026-09-16T00:00:00Z" };
  query.mockImplementation(reference => {
    const name = getFunctionName(reference);
    if (name === "trips:get") return { destinations: ["Milan"], interests: ["Art", "Food"] };
    if (name === "interestJobs:favorites") return [];
    return { _id: "run", status: "completed", startDate: "2026-10-01", endDate: "2026-10-09", interests: ["Art"], results: [item], warnings: ["Activity search could not complete."] };
  });
  const html = renderToStaticMarkup(createElement(InterestDiscovery, { tripId: "trip" as Id<"trips">, destinations: ["Milan"], interests: ["Art", "Food"], onSaveTrip: vi.fn() }));
  expect(html).toContain("Event lead"); expect(html).toContain('href="https://example.org/event"');
  expect(html).toContain("Activity search could not complete."); expect(html).toContain("Save idea");
  expect(html).toContain("Saving an idea does not make a reservation");
});
