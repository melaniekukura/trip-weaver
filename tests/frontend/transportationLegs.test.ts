import { expect, test } from "vitest";
import { transportationLegs, transportLocationLabel } from "./transportationLegs";

test("builds consecutive legs and preserves destination identity through reordering", () => {
  const stops = [{ id: "milan", value: "MIL" }, { id: "rome", value: "ROM" }];
  expect(transportationLegs("DTW", stops)).toEqual([
    { id: "milan", origin: "DTW", destination: "MIL" },
    { id: "rome", origin: "MIL", destination: "ROM" },
  ]);
  expect(transportationLegs("DTW", [...stops].reverse())).toEqual([
    { id: "rome", origin: "DTW", destination: "ROM" },
    { id: "milan", origin: "ROM", destination: "MIL" },
  ]);
  expect(transportationLegs("DTW", [])).toEqual([]);
});

test("uses city names for route headings and retains bare airport codes", () => {
  expect(transportLocationLabel("Detroit — Metropolitan (DTW)")).toBe("Detroit");
  expect(transportLocationLabel("Milan, Italy (MIL; all airports)")).toBe("Milan");
  expect(transportLocationLabel("DTW")).toBe("DTW");
  expect(transportLocationLabel("")).toBe("Choose location");
});
