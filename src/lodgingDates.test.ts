import { expect, test } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";
import { flightPlanItinerary } from "../convex/flightPlanFields";
import { lodgingDateDefaults } from "./lodgingDates";

const route = { origin: "Detroit", destinations: ["Milan", "Rome"], startDate: "2026-09-25", endDate: "2026-10-04" };
const itinerary = flightPlanItinerary(route);
const source = (departure: string, arrival: string) => ({ flight: { departure, arrival } });
const plan = { revision: 1, confirmed: true, legs: [
  { index: 0, itinerary, request: { departureDate: "2026-09-25" }, outbound: source("Sep 25, 18:00", "Sep 26, 08:15") },
  { index: 1, itinerary, request: { departureDate: "2026-09-29" }, outbound: source("Sep 29, 16:00", "Sep 29, 17:10") },
] } as Doc<"trips">["flightPlan"];

test("lodging dates follow arrival and onward transportation dates", () => {
  expect(lodgingDateDefaults(route, plan, "Milan")).toEqual({ checkInDate: "2026-09-26", checkOutDate: "2026-09-29" });
  expect(lodgingDateDefaults(route, plan, "Rome")).toEqual({ checkInDate: "2026-09-29", checkOutDate: "2026-10-04" });
});

test("lodging dates fall back to the trip dates without matching transportation", () => {
  expect(lodgingDateDefaults(route, undefined, "Milan")).toEqual({ checkInDate: route.startDate, checkOutDate: route.endDate });
});
