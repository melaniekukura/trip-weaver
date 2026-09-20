import { expect, test } from "vitest";
import { insertDestinationBeforeHome } from "./DestinationsEditor";

const stop = (id: string, value: string) => ({ id, value });

test("new destinations stay before the final journey home", () => {
  const existing = [stop("milan", "Milan (MIL; all airports)"), stop("home", "Detroit — Metropolitan (DTW)")];
  const added = insertDestinationBeforeHome("DTW", existing, stop("rome", "Rome (ROM; all airports)"));

  expect(added.index).toBe(1);
  expect(added.stops.map(item => item.id)).toEqual(["milan", "rome", "home"]);
  expect(existing.map(item => item.id)).toEqual(["milan", "home"]);
});

test("new destinations append normally when there is no final journey home", () => {
  const added = insertDestinationBeforeHome("DTW", [stop("milan", "MIL")], stop("rome", "ROM"));

  expect(added.index).toBe(1);
  expect(added.stops.map(item => item.id)).toEqual(["milan", "rome"]);
});
