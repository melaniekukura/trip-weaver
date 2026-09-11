import { expect, test } from "vitest";
import fixture from "./fixtures/google-flights.txt?raw";
import { flightSearchUrl, parseFlightPage, validateFlightRequest } from "./flightSearch";

const request = { origin: "DTW", destination: "LAX", departureDate: "2026-10-15" };
test("extracts observed listing prices rather than repeated prices or cheapest-tab summaries", () => {
  const flights = parseFlightPage(fixture, request);
  expect(flights).toHaveLength(3);
  expect(flights.map(({ airline, amount, stops }) => ({ airline, amount, stops }))).toEqual([
    { airline: "Frontier", amount: 169, stops: "1 stop" },
    { airline: "Southwest", amount: 300, stops: "1 stop" },
    { airline: "Delta", amount: 389, stops: "Nonstop" },
  ]);
  expect(flights[0].departure).toBe("10:38 AM on Thu, Oct 15");
});

test.each([
  fixture.replaceAll("2026-10-15", "2026-10-16"),
  fixture.replaceAll("DTW", "JFK"),
  fixture.replaceAll("CurrencyUSD", "CurrencyCAD"),
  fixture.replaceAll("1 adult", "2 adults"),
  fixture.replace("# Flight search\nOne way", "# Flight search\nRound trip"),
  fixture.replaceAll("Economy (include Basic)", "Business"),
  fixture.replaceAll("$169", "Unavailable").replaceAll("$300", "Unavailable").replaceAll("$389", "Unavailable"),
  "Loading results",
  "Please verify that you are human",
])("rejects mismatched or unavailable flight results", (page) => {
  expect(() => parseFlightPage(page, request)).toThrow("FLIGHTS_UNAVAILABLE");
});

test.each([
  { ...request, origin: "Detroit" }, { ...request, origin: "LAX" },
  { ...request, departureDate: "2026-02-30" }, { ...request, departureDate: "invalid" },
])("rejects invalid flight input", (input) => {
  expect(() => validateFlightRequest(input)).toThrow("INVALID_FLIGHT_SEARCH");
});

test("normalizes airport codes and constructs a fixed Google Flights URL", () => {
  const url = new URL(flightSearchUrl({ ...request, origin: " dtw " }));
  expect(url.origin).toBe("https://www.google.com");
  expect(url.searchParams.get("curr")).toBe("USD");
  expect(url.searchParams.get("q")).toBe("Flights from DTW to LAX on October 15, 2026 one way 1 adult economy");
});
