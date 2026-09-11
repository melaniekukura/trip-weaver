import { expect, test } from "vitest";
import { tripIdFromPath, tripPlannerPath } from "./tripRoutes";

test("trip links round-trip identifiers without colliding with the Trips index", () => {
  expect(tripIdFromPath(tripPlannerPath("trip123"))).toBe("trip123");
  expect(tripIdFromPath("/trips")).toBeNull();
  expect(tripIdFromPath("/trips/")).toBeNull();
  expect(tripIdFromPath("/trips/one/another")).toBeNull();
  expect(tripIdFromPath("/trips/%ZZ")).toBeNull();
});
