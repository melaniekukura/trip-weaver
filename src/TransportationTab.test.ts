import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { TransportationTab } from "./TransportationTab";
import { ReturnFlightPicker } from "./ReturnFlightPicker";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: query, useMutation: () => vi.fn(), useAction: () => vi.fn() }));

test("transportation offers trip type and filters before starting a search", () => {
  query.mockReturnValue(undefined);
  const html = renderToStaticMarkup(createElement(TransportationTab, {
    origin: "DTW", destinations: [{ id: "la", value: "LAX" }], departureDate: "2026-10-15", returnDate: "2026-10-22",
    onEditDetails: vi.fn(), onSaveTrip: vi.fn(),
  }));
  for (const label of ["Trip type", "One way", "Round trip", "Flight filters", "Depart by", "Arrive by", "Nonstop", "Maximum price (USD)", "2026-10-15"]) {
    expect(html).toContain(label);
  }
  expect(html.match(/type="time"/g)).toHaveLength(4);
  expect(query).toHaveBeenLastCalledWith(expect.anything(), "skip");
  expect(html).not.toContain("Preference filtering is not available yet");
  expect(html).not.toContain("<form");
  expect(html).toContain("Search Flight");
  expect(html).toContain('aria-expanded="true"');
  expect(html).not.toContain("coming soon");
});

test("transportation displays the trip's traveler count", () => {
  query.mockReturnValue(undefined);
  const html = renderToStaticMarkup(createElement(TransportationTab, {
    travelers: 3, origin: "DTW", destinations: [{ id: "la", value: "LAX" }],
    departureDate: "2026-10-15", returnDate: "2026-10-22", onEditDetails: vi.fn(), onSaveTrip: vi.fn(),
  }));
  expect(html).toContain("3 adults · Economy");
});

test("saved trips offer a transportation-only manual expense list", () => {
  const saved = { _id: "trip", currency: "USD", expenses: [
    { id: "rail", name: "Airport train", category: "Transportation", amount: 18, currency: "USD", date: "2026-10-15", revision: 1 },
    { id: "meal", name: "Lunch", category: "Restaurants", amount: 20, currency: "USD", date: "2026-10-15", revision: 1 },
  ] };
  query.mockImplementation((_reference, args) => args === "skip" ? undefined : saved);
  const html = renderToStaticMarkup(createElement(TransportationTab, {
    tripId: "trip" as Id<"trips">, origin: "DTW", destinations: [{ id: "la", value: "LAX" }],
    departureDate: "2026-10-15", returnDate: "2026-10-22", onEditDetails: vi.fn(), onSaveTrip: vi.fn(),
  }));
  for (const text of ["Other transportation expenses", "Add transportation expense", "Airport train", "$18.00", "Transportation expense subtotal"]) {
    expect(html).toContain(text);
  }
  expect(html).not.toContain("Lunch");
  expect(html).not.toContain("Choose or create a category");
});

test("each consecutive stop gets a separate leg and empty routes offer setup", () => {
  query.mockReturnValue(undefined);
  const props = { origin: "Detroit — Metropolitan (DTW)", departureDate: "2026-10-15", returnDate: "2026-10-22",
    onEditDetails: vi.fn(), onSaveTrip: vi.fn() };
  const html = renderToStaticMarkup(createElement(TransportationTab, { ...props, destinations: [
    { id: "milan", value: "Milan, Italy (MIL; all airports)" }, { id: "rome", value: "Rome — Fiumicino (FCO)" },
  ] }));
  expect(html).toContain("Detroit → Milan");
  expect(html).toContain("Milan → Rome");
  expect(html.match(/class="transport-leg"/g)).toHaveLength(2);
  expect(html.match(/aria-expanded="false"/g)).toHaveLength(1);
  const empty = renderToStaticMarkup(createElement(TransportationTab, { ...props, destinations: [] }));
  expect(empty).toContain("Choose locations");
  expect(empty).not.toContain("Search Flight");
});

test("return-flight controls never submit the enclosing trip editor", () => {
  const source = {
    _id: "outbound" as Id<"researchSources">,
    flight: { airline: "Delta", departure: "8:00 AM", arrival: "10:00 AM", duration: "5 hr", stops: "Nonstop", amount: 400 },
  } as Doc<"researchSources">;
  query.mockReturnValue({ run: { status: "completed", finishedAt: 0 }, sources: [source] });
  const html = renderToStaticMarkup(createElement(ReturnFlightPicker, {
    tripId: "trip" as Id<"trips">,
    request: { origin: "DTW", destination: "LAX", departureDate: "2026-10-15", returnDate: "2026-10-22", tripType: "round-trip" },
    outbound: source, onClose: vi.fn(),
  }));
  expect(html).toContain("Select return");
  expect(html).toContain("Return flight filters");
  expect(html).toContain('<details class="transport-filter-details">');
  expect(html).not.toMatch(/<details[^>]*\bopen/);
  const buttons = html.match(/<button\b[^>]*>/g) ?? [];
  expect(buttons.length).toBeGreaterThanOrEqual(4);
  for (const button of buttons) expect(button).toContain('type="button"');
});

test("saved bookings restore as locked cards and enable the confirmation banner", async () => {
  const { flightPlanItinerary } = await import("../convex/flightPlanFields");
  const source = { _id: "flight", tripId: "trip", sourceUrl: "https://www.google.com/travel/flights",
    flight: { airline: "Delta", departure: "8:00 AM", arrival: "10:00 AM", duration: "5 hr", stops: "Nonstop", amount: 129 } };
  const itinerary = flightPlanItinerary({ origin: "DTW", destinations: ["LAX"], startDate: "2026-10-15", endDate: "2026-10-22" });
  const trip = { homeReturnNotNeededFor: itinerary, origin: "DTW", destinations: ["LAX"], startDate: "2026-10-15", endDate: "2026-10-22", flightPlan: { revision: 3, confirmed: true, legs: [{ index: 0, itinerary, booked: true, reference: "TW-TEST",
    outbound: source, request: { origin: "DTW", destination: "LAX", departureDate: "2026-10-15" } }] } };
  query.mockImplementation((_reference, args) => args === "skip" ? undefined : args?.flight ? { run: { status: "completed" }, sources: [source] } : trip);
  const props = { homeReturnNotNeededFor: itinerary, tripId: "trip" as Id<"trips">, origin: "DTW", destinations: [{ id: "la", value: "LAX" }], departureDate: "2026-10-15", returnDate: "2026-10-22",
    onSaveTrip: vi.fn(), onEditDetails: vi.fn() };
  const booked = renderToStaticMarkup(createElement(TransportationTab, props));
  for (const text of ["✓ Booked", "TW-TEST", "All legs booked", "Flight plan confirmed ✓", ">Edit</button>"]) expect(booked).toContain(text);
  expect(booked).not.toContain("Mark as booked");
  expect(booked).not.toContain("See other options");
  const stale = renderToStaticMarkup(createElement(TransportationTab, { ...props, destinations: [{ id: "la", value: "JFK" }] }));
  expect(stale).toContain("Details changed · search again");
  expect(stale).toContain("0 / 1 legs booked");
  expect(stale).not.toContain("Flight plan confirmed ✓");
  trip.destinations.push("JFK");
  const remoteChange = renderToStaticMarkup(createElement(TransportationTab, props));
  expect(remoteChange).toContain("Previously booked · itinerary changed");
  expect(remoteChange).toContain("differ from the saved itinerary");
  expect(remoteChange).toContain(">Edit</button>");
  expect(remoteChange).not.toContain("All legs booked");
  expect(remoteChange).not.toContain("Flight plan confirmed ✓");
});

test("saved round trips show compact selections and booking controls inside the leg", async () => {
  const { flightPlanItinerary } = await import("../convex/flightPlanFields");
  const outbound = { _id: "outgoing", tripId: "trip", flight: { airline: "Delta", departure: "8:00 AM", arrival: "10:00 AM", duration: "2 hr", stops: "Nonstop", amount: 400 } };
  const returning = { ...outbound, _id: "returning", flight: { ...outbound.flight, departure: "4:00 PM", arrival: "6:00 PM", amount: 550 } };
  const itinerary = flightPlanItinerary({ origin: "DTW", destinations: ["LAX"], startDate: "2026-10-15", endDate: "2026-10-22" });
  const trip = { homeReturnNotNeededFor: itinerary, origin: "DTW", destinations: ["LAX"], startDate: "2026-10-15", endDate: "2026-10-22", flightPlan: { revision: 2, confirmed: false, legs: [{ index: 0, itinerary, booked: false, outbound, returning,
    request: { origin: "DTW", destination: "LAX", departureDate: "2026-10-15", returnDate: "2026-10-22", tripType: "round-trip" } }] } };
  query.mockImplementation((_reference, args) => args === "skip" || args?.flight ? undefined : trip);
  const html = renderToStaticMarkup(createElement(TransportationTab, {
    tripId: "trip" as Id<"trips">, origin: "DTW", destinations: [{ id: "la", value: "LAX" }], departureDate: "2026-10-15", returnDate: "2026-10-22",
    onSaveTrip: vi.fn(), onEditDetails: vi.fn(),
  }));
  expect(html.match(/class="chosen-flight-card"/g)).toHaveLength(2);
  expect(html).toContain("Outgoing · ✓ Selected");
  expect(html).toContain("Return · ✓ Selected");
  expect(html.match(/Find booking options on Google Flights/g)).toHaveLength(1);
  const footer = html.slice(html.indexOf('class="transport-booking-footer"'), html.indexOf('class="flight-plan-banner'));
  expect(html).not.toContain("Your selected flights");
  expect(html).not.toContain("Selected flight plan");
  expect(footer).toContain("Total · $550");
  expect(footer).toContain("Find booking options on Google Flights");
  expect(footer).toContain("Mark as booked");
  expect(html).toContain("Ready to book · $550");
  expect(html).toContain("0 / 2 legs booked");
  expect(html).toContain('aria-label="Trip type"');
  expect(html).not.toMatch(/<select[^>]*-type/);
  expect(html).toMatch(/type="date" min="2026-10-15"[^>]*value="2026-10-22"/);
  expect(html.indexOf('aria-label="Return flight selected"')).toBeLessThan(html.indexOf('class="transport-booking-footer"'));
});

test("multi-city home leg defaults to the end date and uses one-way searches", () => {
  query.mockReturnValue(undefined);
  const html = renderToStaticMarkup(createElement(TransportationTab, {
    origin: "DTW", destinations: [{ id: "milan", value: "MIL" }, { id: "rome", value: "ROM" }, { id: "home", value: "DTW" }],
    departureDate: "2026-10-15", returnDate: "2026-10-22", onSaveTrip: vi.fn(), onEditDetails: vi.fn(),
  }));
  expect(html).toContain("ROM → DTW");
  expect(html).toContain("0 / 3 legs booked");
  expect(html).not.toContain('aria-label="Trip type"');
  expect(html).toMatch(/type="date"[^>]*value="2026-10-22"/);
});

test("removing a separate home stop restores the round-trip control on the remaining leg", () => {
  query.mockReturnValue(undefined);
  const props = { origin: "DTW", departureDate: "2026-10-15", returnDate: "2026-10-22", onSaveTrip: vi.fn(), onEditDetails: vi.fn(), onRemoveLeg: vi.fn() };
  const destinations = [{ id: "milan", value: "MIL" }, { id: "home", value: "DTW" }];
  const twoWays = renderToStaticMarkup(createElement(TransportationTab, { ...props, destinations }));
  expect(twoWays.match(/>Remove leg<\/button>/g)).toHaveLength(2);
  expect(twoWays).not.toContain('aria-label="Trip type"');
  const single = renderToStaticMarkup(createElement(TransportationTab, { ...props, destinations: destinations.slice(0, 1) }));
  expect(single).toContain('aria-label="Trip type"');
  expect(single).toContain("Round trip");
  expect(single).not.toContain(">Remove leg</button>");
  expect(single).toContain("0 / 1 legs booked");
});
