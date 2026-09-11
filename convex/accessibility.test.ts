import { expect, test } from "vitest";
import { accessibilityRequirements, checkAccessibility, checkFlightAccessibility } from "./accessibility";

test("normalizes saved cards and defaults to no requirements", () => {
  expect(accessibilityRequirements(" Step-free access\nstep-free access\n ")).toEqual(["step-free access"]);
  expect(checkFlightAccessibility(accessibilityRequirements()).conforms).toBe(true);
});

test("missing accessibility evidence never counts as a match, including custom needs", () => {
  for (const requirement of ["No strenuous activity", "Wheelchair-accessible spaces", "My custom need"]) {
    expect(checkFlightAccessibility([requirement])).toEqual({ conforms: false, checks: [{ requirement, status: "unverified" }] });
  }
});

test("accommodation requirements are scoped without dropping them from accommodation checks", () => {
  expect(checkFlightAccessibility(["Roll-in showers"]).conforms).toBe(true);
  expect(checkAccessibility(["Roll-in showers"], "accommodation").conforms).toBe(false);
  expect(checkFlightAccessibility(["Roll-in showers", "Airport assistance"]).conforms).toBe(false);
});

test("all applicable requirements need evidence and contrary evidence takes precedence", () => {
  const evidence = [{ requirement: "Step-free access", conforms: true, sourceUrl: "https://example.com/verified-route" }];
  expect(checkAccessibility(["Step-free access"], "activities", evidence).conforms).toBe(true);
  expect(checkAccessibility(["Step-free access", "Quiet environments"], "activities", evidence).conforms).toBe(false);
  expect(checkAccessibility(["Step-free access"], "activities", [...evidence, { ...evidence[0], conforms: false }]).conforms).toBe(false);
  expect(checkAccessibility(["Step-free access"], "activities", [{ ...evidence[0], sourceUrl: "" }]).conforms).toBe(false);
});
