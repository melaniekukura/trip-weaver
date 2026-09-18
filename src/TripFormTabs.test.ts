import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { expect, test, vi } from "vitest";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { TripForm } from "./TripForm";

const trip = {
  _id: "trip" as Id<"trips">, _creationTime: 1, ownerId: "owner" as Id<"users">, updatedAt: 1, name: "California",
  origin: "DTW", destinations: ["LAX"], startDate: "2026-10-15", endDate: "2026-10-22",
  travelers: 1, budget: null, currency: "USD", interests: [],
} as Doc<"trips">;

vi.mock("convex/react", async () => {
  const server = await import("convex/server");
  return {
    useConvex: () => ({ query: vi.fn() }),
    useMutation: () => vi.fn(),
    useAction: () => vi.fn(),
    usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
    useQuery: (reference: Parameters<typeof server.getFunctionName>[0], args: unknown) => {
      if (args === "skip") return undefined;
      if (server.getFunctionName(reference) === "trips:get") return trip;
      if (server.getFunctionName(reference) === "interestJobs:favorites") return [];
      return undefined;
    },
  };
});

test("Itinerary is the final planning tab and the assistant stays outside the form", () => {
  const html = renderToStaticMarkup(createElement(TripForm, { trip, mode: "page", onClose: vi.fn() }));
  const tabs = [...html.matchAll(/role="tab" id="trip-tab-(\d+)" aria-controls="trip-panel-(\d+)"[^>]*>([^<]+)<\/button>/g)];
  expect(tabs.map(match => match[3])).toEqual(["Overview", "Transportation", "Interests", "Accessibility", "Itinerary"]);
  for (const [, tabIndex, panelIndex] of tabs) {
    expect(panelIndex).toBe(tabIndex);
    expect(html).toContain(`role="tabpanel" id="trip-panel-${tabIndex}" aria-labelledby="trip-tab-${tabIndex}"`);
  }
  const overview = html.match(/id="trip-panel-0"[\s\S]*?<\/section>/)?.[0] ?? "";
  expect(overview).toContain("Leaving from");
  expect(overview).toContain("Destinations in travel order");
  expect(overview).toContain("Add a destination");
  expect(html.match(/class="destinations-editor"/g)).toHaveLength(1);
  expect(html.match(/<form/g)).toHaveLength(1);
  expect(html).toContain('<aside class="trip-assistant-rail" aria-label="Trip planning assistant">');
  expect(html.indexOf("</form>")).toBeLessThan(html.indexOf("trip-assistant-rail"));
});
