import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { flightPlanItinerary } from "../convex/flightPlanFields";
import { itineraryDays, itineraryTimeLabel, TripItinerary } from "./TripItinerary";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: query, useMutation: () => vi.fn() }));

const route = { origin: "DTW", destinations: ["LAX"], startDate: "2026-10-15", endDate: "2026-10-22" };
const itinerary = flightPlanItinerary(route);
const source = (departure: string, arrival: string, originAirport: string, destinationAirport: string) => ({
  flight: { airline: "Delta", departure, arrival, duration: "5 hr", stops: "Nonstop", amount: 400, currency: "USD", originAirport, destinationAirport },
});

test("itinerary groups current booked flights and planned activities by date and time", () => {
  const legs = [{ index: 0, itinerary, booked: true, reference: "ABC123", request: {
    origin: "DTW", destination: "LAX", departureDate: "2026-10-15", returnDate: "2026-10-22", tripType: "round-trip" as const,
  }, outbound: source("8:00 AM on Thu, Oct 15", "10:00 AM on Thu, Oct 15", "DTW", "LAX"),
  returning: source("4:00 PM on Thu, Oct 22", "11:00 PM on Thu, Oct 22", "LAX", "DTW") }] as NonNullable<Doc<"trips">["flightPlan"]>["legs"];
  const favorites = [{ _id: "favorite" as Id<"interestFavorites">, item: { kind: "activities" as const, title: "Getty Center", description: "Art", url: "https://example.com", destination: "Los Angeles, CA", retrievedAt: "2026-01-01" },
    itinerary: { date: "2026-10-15", time: "13:00", notes: "Timed entry" } }] as Doc<"interestFavorites">[];
  const days = itineraryDays(route, legs, favorites);
  expect(days.map(day => day.date)).toEqual(["2026-10-15", "2026-10-22"]);
  expect(days[0].items.map(item => item.title)).toEqual(["DTW to LAX", "Getty Center"]);
  expect(days[1].items[0].title).toBe("LAX to DTW");
});

test("itinerary excludes stale and unbooked flights and keeps undated activities visible", () => {
  const legs = [{ index: 0, itinerary: "old route", booked: true, request: { origin: "DTW", destination: "LAX", departureDate: "2026-10-15" }, outbound: source("8:00 AM", "10:00 AM", "DTW", "LAX") },
    { index: 0, itinerary, booked: false, request: { origin: "DTW", destination: "LAX", departureDate: "2026-10-15" }, outbound: source("9:00 AM", "11:00 AM", "DTW", "LAX") }] as NonNullable<Doc<"trips">["flightPlan"]>["legs"];
  const favorites = [{ _id: "favorite" as Id<"interestFavorites">, item: { kind: "events" as const, title: "Concert", description: "Music", url: "https://example.com", destination: "Los Angeles", retrievedAt: "2026-01-01" }, itinerary: { notes: "Choose a night" } }] as Doc<"interestFavorites">[];
  expect(itineraryDays(route, legs, favorites)).toEqual([{ date: undefined, items: [expect.objectContaining({ title: "Concert" })] }]);
});

test("itinerary page renders the combined schedule and edit paths", () => {
  query.mockReturnValue([{ _id: "favorite", item: { kind: "activities", title: "Getty Center", description: "Art", url: "https://example.com", destination: "Los Angeles", retrievedAt: "2026-01-01" }, itinerary: { date: "2026-10-15", time: "13:00" } }]);
  const plan = { revision: 1, confirmed: true, legs: [{ index: 0, itinerary, booked: true, reference: "ABC123", request: { origin: "DTW", destination: "LAX", departureDate: "2026-10-15" }, outbound: source("8:00 AM on Thu, Oct 15", "10:00 AM on Thu, Oct 15", "DTW", "LAX") }] } as Doc<"trips">["flightPlan"];
  const html = renderToStaticMarkup(createElement(TripItinerary, { tripId: "trip" as Id<"trips">, route, plan, onOpenTransportation: vi.fn(), onOpenInterests: vi.fn() }));
  for (const text of ["Your itinerary", "Thursday", "October 15, 2026", "Booked transportation", "DTW to LAX", "ABC123", "Getty Center", "Edit transportation", "Edit activities"]) expect(html).toContain(text);
  expect(html.match(/Edit itinerary details/g)).toHaveLength(1);
  expect(html).not.toContain("<form");
});

test("undated activities can be edited directly and show their notes once", () => {
  query.mockReturnValue([{ _id: "favorite", item: { kind: "activities", title: "Getty Center", destination: "Los Angeles" }, itinerary: { notes: "Choose an afternoon" } }]);
  const html = renderToStaticMarkup(createElement(TripItinerary, { tripId: "trip" as Id<"trips">, route, onOpenTransportation: vi.fn(), onOpenInterests: vi.fn() }));
  expect(html).toContain("Still to schedule");
  expect(html).toContain("Edit itinerary details");
  expect(html.match(/Choose an afternoon/g)).toHaveLength(1);
});

test("itinerary page handles dates being cleared while editing", () => {
  query.mockReturnValue([]);
  const html = renderToStaticMarkup(createElement(TripItinerary, { route: { ...route, startDate: "", endDate: "" }, onOpenTransportation: vi.fn(), onOpenInterests: vi.fn() }));
  expect(html).toContain("Date not set");
  expect(html).toContain("Your schedule is ready to take shape");
});

test("itinerary displays stored 24-hour and flight times consistently", () => {
  expect(itineraryTimeLabel("16:00")).toBe("4:00 PM");
  expect(itineraryTimeLabel("20:00")).toBe("8:00 PM");
  expect(itineraryTimeLabel("8:00 PM")).toBe("8:00 PM");
  expect(itineraryTimeLabel()).toBe("Time not set");
});
