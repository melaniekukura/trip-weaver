import { afterEach, expect, test, vi } from "vitest";
import { airportCode, locationSearchTerm, locationValue, moveDestination, parseLocations, searchLocations } from "./locations";

const response = [
  { type: "city", code: "LON", name: "London", country_name: "United Kingdom" },
  { type: "airport", code: "LHR", name: "Heathrow", city_name: "London", country_name: "United Kingdom", city_code: "LON" },
  { type: "city", code: "YXU", name: "London", country_name: "Canada", main_airport_name: "London International" },
];
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

test("live locations preserve city scope, airport codes, and same-name cities in different countries", () => {
  const results = parseLocations(response);
  expect(results.map((item) => item.id)).toEqual(["city-LON", "LHR", "city-YXU", "YXU"]);
  expect(locationValue(results[0])).toBe("London, United Kingdom (LON; all airports)");
  expect(locationValue(results[2])).toBe("London, Canada (YXU; all airports)");
  expect(airportCode(locationValue(results[0]))).toBeNull();
  expect(airportCode(locationValue(results[1]))).toBe("LHR");
  expect(airportCode("dtw")).toBe("DTW");
  expect(airportCode("London (all airports)")).toBeNull();
  expect(locationSearchTerm(locationValue(results[0]))).toBe("London");
  expect(locationSearchTerm(locationValue(results[1]))).toBe("LHR");
});

test("filters malformed provider records and keeps saved airport values within the existing limit", () => {
  expect(parseLocations([null, {}, { ...response[0], code: "INVALID" }])).toEqual([]);
  expect(() => parseLocations({ error: "unavailable" })).toThrow();
  const option = parseLocations([{ ...response[1], name: "Very long airport ".repeat(20) }])[0];
  expect(locationValue(option).length).toBe(120);
  expect(airportCode(locationValue(option))).toBe("LHR");
});

test("search sends an encoded live request, caches results, and skips short input", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response)));
  vi.stubGlobal("fetch", fetchMock);
  expect(await searchLocations("x")).toEqual([]);
  const result = await searchLocations("unique query & city");
  expect(result).toHaveLength(4);
  const url = fetchMock.mock.calls[0][0] as URL;
  expect(url.searchParams.get("term")).toBe("unique query & city");
  expect(url.searchParams.getAll("types[]")).toEqual(["city", "airport"]);
  expect(await searchLocations("unique query & city")).toEqual(result);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("provider failure is surfaced and an abort signal is passed through", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  await expect(searchLocations("failing lookup", controller.signal)).rejects.toThrow("unavailable");
  expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
});

test("reordering preserves repeated stops and does not mutate the input", () => {
  const stops = Object.freeze([{ id: "a", value: "London" }, { id: "b", value: "Paris" }, { id: "c", value: "London" }]);
  expect(moveDestination(stops, 2, 0).map((stop) => stop.id)).toEqual(["c", "a", "b"]);
  expect(moveDestination(stops, 0, 2).map((stop) => stop.id)).toEqual(["b", "c", "a"]);
  expect(stops.map((stop) => stop.id)).toEqual(["a", "b", "c"]);
  expect(moveDestination(stops, -1, 0)).toEqual(stops);
});
