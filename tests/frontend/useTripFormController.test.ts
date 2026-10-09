import { expect, test, vi } from "vitest";
import { firstInvalidTripField } from "./useTripFormController";

test("trip saves validate only required trip fields", () => {
  const required = { name: "origin" } as HTMLInputElement;
  const querySelectorAll = vi.fn(() => [required]);
  const form = { querySelectorAll } as unknown as ParentNode;
  expect(firstInvalidTripField(form)).toBe(required);
  expect(querySelectorAll).toHaveBeenCalledWith("[data-required-field]:invalid");
});
