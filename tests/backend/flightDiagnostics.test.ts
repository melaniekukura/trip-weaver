import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { diagnoseFlightFailure } from "./flightDiagnostics";

test("diagnostics discard raw errors, secrets, unknown fields, and invalid metrics", () => {
  const result = diagnoseFlightFailure(new ConvexError({ code: "secret", diagnostic: {
    stage: "private-url", reason: "provider-secret", stderr: "secret", httpStatus: 429,
    labelCount: Infinity, parsedCount: "secret", matchCount: 2,
  } }), "browser_execute");
  expect(result).toEqual({ stage: "browser_execute", reason: "unavailable", code: "SEARCH_FAILED", httpStatus: 429, matchCount: 2 });
  expect(diagnoseFlightFailure(new Error("secret stack"), "return_parse"))
    .toEqual({ stage: "return_parse", reason: "unavailable", code: "SEARCH_FAILED" });
});

test("airline comparisons retain bounded flight labels and discard unrelated provider data", () => {
  const result = diagnoseFlightFailure(new ConvexError({ code: "FLIGHTS_UNAVAILABLE", diagnostic: {
    stage: "outbound_match", reason: "outbound_missing", selectedAirline: "LufthansaUnited",
    airlineCandidates: [{ airline: "Lufthansa and United Airlines", otherDetailsMatch: true, url: "private" },
      { airline: "https://example.com/private", otherDetailsMatch: true }, { airline: "x".repeat(201), otherDetailsMatch: false }],
  } }), "browser_execute");
  expect(result.selectedAirline).toBe("LufthansaUnited");
  expect(result.airlineCandidates).toEqual([{ airline: "Lufthansa and United Airlines", otherDetailsMatch: true }]);
});
