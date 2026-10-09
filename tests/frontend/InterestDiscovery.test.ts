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
  for (const label of ["Find things to do", "Saved ideas", "Art", "Food", "Uses your trip dates", "Confirm details on the source site"]) expect(html).toContain(label);
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
  expect(html).toContain("Confirm details on the source site before booking");
});


test("saved ideas stay compact and itinerary entries remain collapsed with editable notes", () => {
  const item = { kind: "activities", title: "Saved museum", description: "Long museum description", url: "https://example.org/museum", destination: "Milan, Italy (MIL; all airports)", retrievedAt: "2026-09-17T00:00:00Z" };
  query.mockImplementation(reference => {
    const name = getFunctionName(reference);
    if (name === "trips:get") return { destinations: ["Milan"], interests: ["Art"] };
    if (name === "interestJobs:favorites") return [{ _id: "saved", item }, { _id: "planned", item: { ...item, title: "Dinner" }, itinerary: { date: "2026-09-27", time: "19:00", notes: "Booking reference TEST" } }];
    return null;
  });
  const html = renderToStaticMarkup(createElement(InterestDiscovery, { tripId: "trip" as Id<"trips">, destinations: ["Milan"], interests: ["Art"], onSaveTrip: vi.fn() }));
  const shortlist = html.split('<section class="ideas-itinerary"')[0];
  expect(html).toContain('<details class="itinerary-activity">');
  expect(html).toContain("2026-09-27"); expect(html).toContain("19:00"); expect(html).toContain("Booking reference TEST");
  expect(html).toContain("Edit itinerary details"); expect(html).toContain("Add to itinerary");
  expect(shortlist).toContain("Saved museum"); expect(shortlist).not.toContain("Long museum description");
});

test("matching activities come first, unknown access is distinct, and barriers are highlighted below", () => {
  const item = { kind: "activities", description: "Visitor information", destination: "Paris", retrievedAt: "2026-09-18" };
  const evidence = (conforms: boolean) => [{ requirement: "Step-free access", conforms, evidence: conforms ? "A step-free entrance is available." : "Access is via stairs only.", sourceUrl: "https://example.org/access" }];
  query.mockImplementation(reference => {
    const name = getFunctionName(reference);
    if (name === "trips:get") return { destinations: ["Paris"], interests: ["Art"], accessibility: "Step-free access" };
    if (name === "interestJobs:favorites") return [];
    return { _id: "run", status: "completed", startDate: "2026-10-01", endDate: "2026-10-09", interests: ["Art"], warnings: [], results: [
      { ...item, title: "Tower with stairs", url: "https://example.org/tower", accessibilityEvidence: evidence(false) },
      { ...item, title: "Museum without access details", url: "https://example.org/museum" },
      { ...item, title: "Accessible gallery", url: "https://example.org/gallery", accessibilityEvidence: evidence(true) },
    ] };
  });
  const props = { tripId: "trip" as Id<"trips">, destinations: ["Paris"], interests: ["Art"], onSaveTrip: vi.fn() };
  const html = renderToStaticMarkup(createElement(InterestDiscovery, props));
  expect(html.indexOf("Accessible gallery")).toBeLessThan(html.indexOf("Museum without access details"));
  expect(html.indexOf("Museum without access details")).toBeLessThan(html.indexOf("Tower with stairs"));
  expect(html).toContain("Does not meet: Step-free access");
  expect(html).toContain("Not confirmed: Step-free access");
  expect(html).toContain('class="idea-accessibility-not-met"');
  expect(html).toContain("Access is via stairs only.");
  expect(html.match(/>Save idea</g)).toHaveLength(3);
  const cleared = renderToStaticMarkup(createElement(InterestDiscovery, { ...props, accessibility: "" }));
  expect(cleared).not.toContain("Does not meet:");
  expect(cleared).not.toContain("Does not meet all accessibility requirements");
});

test("search results exclude saved and planned activities and return when unsaved", () => {
  const items = ["Saved museum", "Planned tour", "New gallery"].map((title, index) => ({
    kind: "activities", title, description: "Visitor information", url: `https://example.org/${index}`,
    destination: "Milan", retrievedAt: "2026-09-18",
  }));
  let favorites = [{ _id: "saved", item: items[0] }, { _id: "planned", item: items[1], itinerary: { date: "2026-10-01" } }];
  query.mockImplementation(reference => {
    const name = getFunctionName(reference);
    if (name === "trips:get") return { destinations: ["Milan"], interests: ["Art"] };
    if (name === "interestJobs:favorites") return favorites;
    return { _id: "run", status: "completed", startDate: "2026-10-01", endDate: "2026-10-09", interests: ["Art"], warnings: [], results: items };
  });
  const render = () => renderToStaticMarkup(createElement(InterestDiscovery, {
    tripId: "trip" as Id<"trips">, destinations: ["Milan"], interests: ["Art"], onSaveTrip: vi.fn(),
  }));
  const search = () => render().split('<section class="interest-saved-section"')[0];
  expect(search()).not.toContain("Saved museum");
  expect(search()).not.toContain("Planned tour");
  expect(search()).toContain("New gallery");
  expect(render()).toContain("Saved museum");
  expect(render()).toContain("Planned tour");
  favorites = [...favorites, { _id: "gallery", item: items[2] }];
  expect(search()).toContain("All results are already saved or in your itinerary.");
  expect(search()).not.toContain("Save idea");
  favorites = [];
  for (const item of items) expect(search()).toContain(item.title);
});
