import { expect, test } from "vitest";
import { tripCreationReady } from "./tripCreation";
const valid = { name: "Autumn trip", origin: "DTW", destinations: ["LAX"], startDate: "2026-10-01", endDate: "2026-10-05", travelers: 1 };
test("trip creation requires valid details across all tabs", () => {
  expect(tripCreationReady(valid)).toBe(true);
  for (const change of [{ name: " " }, { origin: "" }, { destinations: [] }, { destinations: [""] },
    { startDate: "" }, { endDate: "" }, { endDate: "2026-09-30" }, { startDate: "2026-02-30" },
    { travelers: 0 }, { travelers: 1.5 }, { travelers: 101 }]) expect(tripCreationReady({ ...valid, ...change })).toBe(false);
  expect(tripCreationReady({ ...valid, endDate: valid.startDate, travelers: 100 })).toBe(true);
});
