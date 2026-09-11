import { afterEach, expect, test, vi } from "vitest";
import { cityAirportCodes, resolveAirportScope } from "./cityAirports";

const directory = [
  ...["LHR", "LGW", "STN", "LTN", "LCY", "SEN"].map((code) => ({ city_code: "LON", code, iata_type: "airport", flightable: true })),
  { city_code: "LON", code: "QQS", iata_type: "railway", flightable: true },
  { city_code: "LON", code: "OLD", iata_type: "airport", flightable: false },
  { city_code: "NYC", code: "JFK", iata_type: "airport", flightable: true },
];
afterEach(() => vi.unstubAllGlobals());

test("city airport scope includes every active passenger airport and excludes rail or other cities", () => {
  expect(cityAirportCodes(directory, "LON")).toEqual(["LCY", "LGW", "LHR", "LTN", "SEN", "STN"]);
  expect(() => cityAirportCodes(directory, "XXX")).toThrow("AIRPORT_LOOKUP_FAILED");
  expect(() => cityAirportCodes({}, "LON")).toThrow("AIRPORT_LOOKUP_FAILED");
});

test("airport-only requests do not need the directory; two cities use one directory fetch", async () => {
  const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(directory)));
  vi.stubGlobal("fetch", mock);
  expect(await resolveAirportScope({ origin: "LHR", destination: "JFK", departureDate: "2026-10-15" }))
    .toEqual({ origin: ["LHR"], destination: ["JFK"] });
  expect(mock).not.toHaveBeenCalled();
  const scope = await resolveAirportScope({ origin: "LON", originType: "city", destination: "NYC", destinationType: "city", departureDate: "2026-10-15" });
  expect(scope.origin).toHaveLength(6);
  expect(scope.destination).toEqual(["JFK"]);
  expect(mock).toHaveBeenCalledTimes(1);
});

test("directory failure does not silently narrow the city to one airport", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
  await expect(resolveAirportScope({ origin: "LON", originType: "city", destination: "JFK", departureDate: "2026-10-15" }))
    .rejects.toThrow("AIRPORT_LOOKUP_FAILED");
});
