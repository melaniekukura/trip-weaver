import { expect, test } from "vitest";
import { emptyFlightFilters, flightFilterError, matchesFlightFilters } from "./flightFilters";

const flight = { departure: "10:38 AM on Thu, Oct 15", arrival: "3:00 PM on Thu, Oct 15", stops: "1 stop", amount: 169 };

test("cleared filters preserve all results", () => {
  expect(matchesFlightFilters(flight, emptyFlightFilters)).toBe(true);
});

test("time, stops, and maximum price filters combine with inclusive boundaries", () => {
  const filters = { ...emptyFlightFilters, departureFrom: "10:38", departureTo: "11:00", arrivalTo: "15:00", stops: "one" as const, maxPrice: "169" };
  expect(matchesFlightFilters(flight, filters)).toBe(true);
  expect(matchesFlightFilters(flight, { ...filters, maxPrice: "168.99" })).toBe(false);
  expect(matchesFlightFilters(flight, { ...filters, arrivalTo: "14:59" })).toBe(false);
  expect(matchesFlightFilters(flight, { ...filters, departureFrom: "10:39" })).toBe(false);
});

test.each([
  ["Nonstop", "nonstop", true], ["1 stop", "nonstop", false], ["Nonstop", "one", false],
  ["1 stop", "one", true], ["2 stops", "one", false], ["2 stops", "multiple", true],
  ["3 stops", "multiple", true], ["1 stop", "multiple", false], ["Unknown", "multiple", false],
] as const)("classifies %s for %s", (stops, filter, expected) => {
  expect(matchesFlightFilters({ ...flight, stops }, { ...emptyFlightFilters, stops: filter })).toBe(expected);
});

test("noon and midnight are parsed in airport-local time without date conversion", () => {
  expect(matchesFlightFilters({ ...flight, arrival: "12:00 AM on Fri, Oct 16" }, { ...emptyFlightFilters, arrivalTo: "00:00" })).toBe(true);
  expect(matchesFlightFilters({ ...flight, arrival: "12:00 PM on Thu, Oct 15" }, { ...emptyFlightFilters, arrivalTo: "00:00" })).toBe(false);
  expect(matchesFlightFilters({ ...flight, departure: "12:00 PM on Thu, Oct 15" }, { ...emptyFlightFilters, departureFrom: "12:00", departureTo: "12:00" })).toBe(true);
});

test("overnight windows include either side of midnight", () => {
  const filters = { ...emptyFlightFilters, arrivalFrom: "22:00", arrivalTo: "06:00" };
  expect(matchesFlightFilters({ ...flight, arrival: "11:00 PM on Thu, Oct 15" }, filters)).toBe(true);
  expect(matchesFlightFilters({ ...flight, arrival: "5:00 AM on Fri, Oct 16" }, filters)).toBe(true);
  expect(matchesFlightFilters(flight, filters)).toBe(false);
});

test("invalid price is reported and ignored, while zero is a valid ceiling", () => {
  for (const maxPrice of ["-1", "NaN", "Infinity"]) {
    const filters = { ...emptyFlightFilters, maxPrice };
    expect(flightFilterError(filters)).toBeTruthy();
    expect(matchesFlightFilters(flight, filters)).toBe(true);
  }
  expect(flightFilterError({ ...emptyFlightFilters, maxPrice: "0" })).toBeNull();
  expect(matchesFlightFilters(flight, { ...emptyFlightFilters, maxPrice: "0" })).toBe(false);
});

test("unreadable times cannot satisfy an active time filter", () => {
  expect(matchesFlightFilters({ ...flight, departure: "Unknown" }, { ...emptyFlightFilters, departureFrom: "09:00" })).toBe(false);
});
