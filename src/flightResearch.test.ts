import { afterEach, expect, test, vi } from "vitest";
import { flightRequestFromTrip, lowestFlightSources } from "./flightResearch";
import type { FlightResearch } from "./flightResearch";

afterEach(() => vi.useRealTimers());

test("converts saved airport labels to the backend contract and preserves city-wide requests", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  expect(flightRequestFromTrip("Detroit — Metropolitan (DTW)", "London — Heathrow (LHR)", "2026-10-10"))
    .toEqual({ origin: "DTW", destination: "LHR", departureDate: "2026-10-10" });
  expect(flightRequestFromTrip("London, United Kingdom (LON; all airports)", "DTW", "2026-10-10"))
    .toEqual({ origin: "LON", originType: "city", destination: "DTW", departureDate: "2026-10-10" });
  expect(() => flightRequestFromTrip("London (all airports)", "DTW", "2026-10-10")).toThrow("live suggestions");
  expect(() => flightRequestFromTrip("DTW", "DTW", "2026-10-10")).toThrow("different");
  expect(() => flightRequestFromTrip("DTW", "LHR", "2026-02-30")).toThrow("330 days");
  expect(() => flightRequestFromTrip("DTW", "LHR", "2028-10-10")).toThrow("330 days");
});

test("ranks the three cheapest valid returned sources without changing backend order", () => {
  const sources = [600, 350, NaN, 450, 390, -1].map((amount, i) => ({ _id: `source-${i}`, flight: { amount } })) as FlightResearch["sources"];
  expect(lowestFlightSources(sources).map((source) => source.flight!.amount)).toEqual([350, 390, 450]);
  expect(sources[0].flight!.amount).toBe(600);
  expect(lowestFlightSources([])).toEqual([]);
});
