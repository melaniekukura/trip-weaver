import { expect, test } from "vitest";
import { invalidRequiredTripFields } from "./tripFormValidation";

const complete = { name: "Autumn trip", origin: "DTW", destinations: ["LAX"], startDate: "2026-10-01",
  endDate: "2026-10-05", travelers: "2" };

test("identifies each missing required trip field", () => {
  expect(invalidRequiredTripFields({ ...complete, name: " ", origin: "", destinations: [], startDate: "",
    endDate: "", travelers: "" })).toEqual({
    name: true, startDate: true, endDate: true, travelers: true, origin: true, destination: true,
  });
});

test("clears required field errors when values become valid", () => {
  expect(invalidRequiredTripFields(complete)).toEqual({
    name: false, startDate: false, endDate: false, travelers: false, origin: false, destination: false,
  });
});

test("keeps invalid date ranges and traveler counts marked", () => {
  expect(invalidRequiredTripFields({ ...complete, endDate: "2026-09-30", travelers: "0" })).toMatchObject({
    endDate: true, travelers: true,
  });
});
