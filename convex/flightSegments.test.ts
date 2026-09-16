import { expect, test } from "vitest";
import fixture from "./fixtures/google-booking-segments.txt?raw";
import { parseGoogleFlightSegments } from "./flightSegments";

test("reads the actual Delta/Air Europa itinerary including next-day segment dates", () => {
  expect(parseGoogleFlightSegments(fixture, "2026-09-25")).toEqual([
    { flightNumber: "DL 1316", origin: "DTW", destination: "JFK", departure: "2026-09-25T18:05", arrival: "2026-09-25T20:09" },
    { flightNumber: "UX 92", origin: "JFK", destination: "MAD", departure: "2026-09-25T22:05", arrival: "2026-09-26T11:20" },
    { flightNumber: "UX 1063", origin: "MAD", destination: "MXP", departure: "2026-09-26T12:50", arrival: "2026-09-26T14:55" },
  ]);
});

test("incomplete or disconnected segments are not treated as an itinerary", () => {
  expect(parseGoogleFlightSegments("Unknown flight", "2026-09-25")).toEqual([]);
  expect(parseGoogleFlightSegments(fixture.replace("(DTW)", "(LAX)").replace("(JFK)", "(LHR)"), "2026-09-25")).toEqual([]);
});
