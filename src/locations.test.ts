import { expect, test } from "vitest";
import { locations, locationValue, moveDestination, searchLocations } from "./locations";

test("city search includes an all-airports choice and that city's individual airports", () => {
  const results = searchLocations("London");
  expect(locationValue(results[0])).toBe("London (all airports)");
  expect(results.filter((option) => option.code).map((option) => option.code)).toContain("LHR");
  expect(results.every((option) => option.city === "London")).toBe(true);
});

test("airport search matches codes and names case-insensitively and ignores accents", () => {
  expect(searchLocations("jfk")[0].code).toBe("JFK");
  expect(searchLocations("heathrow")[0].code).toBe("LHR");
  expect(searchLocations("sa carneiro")[0].code).toBe("OPO");
  expect(searchLocations("unlisted city")).toEqual([]);
});

test("city and airport selections remain distinct and fit existing saved trip fields", () => {
  const values = locations.map(locationValue);
  expect(new Set(values).size).toBe(values.length);
  expect(values.every((value) => value.length <= 120)).toBe(true);
  expect(locationValue(searchLocations("HND")[0])).toBe("Tokyo — Haneda (HND)");
});

test("reordering preserves repeated destinations, identifiers, and the original list", () => {
  const stops = Object.freeze([
    { id: "a", value: "London" }, { id: "b", value: "Paris" }, { id: "c", value: "London" },
  ]);
  expect(moveDestination(stops, 2, 0).map((stop) => stop.id)).toEqual(["c", "a", "b"]);
  expect(moveDestination(stops, 0, 2).map((stop) => stop.id)).toEqual(["b", "c", "a"]);
  expect(stops.map((stop) => stop.id)).toEqual(["a", "b", "c"]);
  expect(moveDestination(stops, -1, 0)).toEqual(stops);
  expect(moveDestination(stops, 0, 3)).toEqual(stops);
});
