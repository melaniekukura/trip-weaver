import { expect, test } from "vitest";
import { demoFlights, lowestPricedFlights } from "./demoFlights";

test("selects the three lowest fares without reordering the supplied flight list", () => {
  const flights = Object.freeze([...demoFlights]);
  expect(lowestPricedFlights(flights).map((flight) => flight.priceUsd)).toEqual([385, 420, 475]);
  expect(flights[0].priceUsd).toBe(620);
});

test("handles fewer than three available flights and an empty result", () => {
  expect(lowestPricedFlights([])).toEqual([]);
  expect(lowestPricedFlights([demoFlights[0]])).toEqual([demoFlights[0]]);
});

test("excludes missing or invalid numeric fares from the cheapest results", () => {
  const invalid = [NaN, Infinity, -20].map((priceUsd) => ({ ...demoFlights[0], priceUsd }));
  expect(lowestPricedFlights([...invalid, ...demoFlights]).map((flight) => flight.priceUsd)).toEqual([385, 420, 475]);
});
