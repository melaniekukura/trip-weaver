import { expect, test } from "vitest";
import { tripPreferences } from "./tripPreferences";

test("editing basics preserves preferences that are absent from the shortened modal", () => {
  const saved = { budget: 2500, currency: "EUR", interests: ["Museums"], accessibility: "Step-free access" };
  expect(tripPreferences(new FormData(), saved, false)).toEqual(saved);
  expect(tripPreferences(new FormData(), undefined, false)).toEqual({
    budget: null, currency: "USD", interests: [], accessibility: "",
  });
});

test("the planning page can update and clear preferences", () => {
  const data = new FormData();
  data.set("budget", "1500"); data.set("currency", "CAD"); data.set("interests", "Hiking, Food");
  data.set("accessibility", " Rest breaks ");
  expect(tripPreferences(data, undefined, true)).toEqual({
    budget: 1500, currency: "CAD", interests: ["Hiking", "Food"], accessibility: "Rest breaks",
  });
  data.set("budget", ""); data.set("interests", ""); data.set("accessibility", "");
  expect(tripPreferences(data, undefined, true)).toEqual({ budget: null, currency: "CAD", interests: [], accessibility: "" });
});
