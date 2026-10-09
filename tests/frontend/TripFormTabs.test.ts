import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { expect, test, vi } from "vitest";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { TripForm } from "./TripForm";

const trip = {
  _id: "trip" as Id<"trips">, _creationTime: 1, ownerId: "owner" as Id<"users">, updatedAt: 1, name: "California",
  origin: "DTW", destinations: ["Los Angeles, CA (LAX; all airports)"], startDate: "2026-10-15", endDate: "2026-10-22",
  travelers: 1, budget: null, currency: "USD", interests: [],
} as Doc<"trips">;

vi.mock("convex/react", async () => {
  const server = await import("convex/server");
  return {
    useConvex: () => ({ query: vi.fn() }),
    useConvexAuth: () => ({ isAuthenticated: true }),
    useMutation: () => vi.fn(),
    useAction: () => vi.fn(),
    usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
    useQuery: (reference: Parameters<typeof server.getFunctionName>[0], args: unknown) => {
      if (args === "skip") return undefined;
      if (server.getFunctionName(reference) === "trips:get") return trip;
      if (server.getFunctionName(reference) === "interestJobs:favorites") return [];
      if (server.getFunctionName(reference) === "lodgings:list") return [];
      return undefined;
    },
  };
});

test("required documents follows the itinerary tab", () => {
  const html = renderToStaticMarkup(createElement(TripForm, { trip, mode: "page", onClose: vi.fn() }));
  const tabs = [...html.matchAll(/role="tab" id="trip-tab-(\d+)" aria-controls="trip-panel-(\d+)"[^>]*>([^<]+)<\/button>/g)];
  expect(tabs.map(match => match[3])).toEqual(["Overview", "Transportation", "Lodging", "Interests", "Accessibility", "Itinerary", "Required Documents"]);
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
  expect(html).toContain("Where you’re staying");
  expect(html).toContain("Find a place to stay");
  expect(html).toContain("City or destination");
  expect(html).toContain('aria-haspopup="listbox"');
  expect(html).toMatch(/class="lodging-location-trigger"[^>]*><span>Los Angeles<\/span>/);
  expect(html).toContain("Vacation rental / Airbnb");
  expect(html).toContain("Search lodging");
  expect(html).toContain('aria-controls="trip-assistant-drawer" aria-expanded="false"');
  expect(html).toContain('id="trip-assistant-drawer" class="trip-assistant-drawer" aria-label="Trip planning assistant" aria-hidden="true" inert=""');
  expect(html.indexOf("</form>")).toBeLessThan(html.indexOf('id="trip-assistant-drawer"'));
});

test("new trips start with a clickable, incomplete save button", () => {
  const html = renderToStaticMarkup(createElement(TripForm, { onClose: vi.fn() }));
  expect(html).toMatch(/class="primary-button trip-save-button is-incomplete" type="submit" aria-disabled="true"/);
  expect(html).not.toMatch(/trip-save-button[^>]*disabled=""/);
  expect(html).toContain('data-required-field="name"');
  expect(html).toContain('data-required-field="destination"');
});

test("new trips preserve initial airport values from the home search", () => {
  const html = renderToStaticMarkup(createElement(TripForm, {
    initialValues: { origin: "Detroit — Detroit Metro (DTW)", destinations: ["Los Angeles — Los Angeles International (LAX)"], startDate: "2026-10-15" },
    onClose: vi.fn(),
  }));
  expect(html).toContain('value="Detroit — Detroit Metro (DTW)"');
  expect(html).toContain("Los Angeles — Los Angeles International (LAX)");
  expect(html).toContain('value="2026-10-15"');
});

test("guest planning exposes baseline tabs and gates protected features", () => {
  const html = renderToStaticMarkup(createElement(TripForm, {
    mode: "guest",
    initialValues: { draftId: "draft-1", name: "California", origin: "DTW", destinations: ["LAX"],
      startDate: "2026-10-15", endDate: "2026-10-22", travelers: 1, interests: ["Museums"],
      accessibility: "Step-free access", homeReturnNotNeededFor: "" },
    onClose: vi.fn(), onSignInRequired: vi.fn(), onDraftChange: vi.fn(),
  }));
  for (const tab of ["Overview", "Transportation", "Lodging", "Interests", "Accessibility", "Itinerary", "Required Documents"]) {
    expect(html).toContain(`>${tab}</button>`);
  }
  expect(html).not.toContain("Your trip planner");
  expect(html.match(/Sign in for more features/g)).toHaveLength(5);
  expect(html).toContain("Sign in to search live flight options.");
  expect(html).toContain("Sign in to save");
});
