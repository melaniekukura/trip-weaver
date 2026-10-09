import { expect, test } from "vitest";
import { homeJourneyStatus, sameTravelLocation } from "./homeJourney";
import { flightPlanItinerary } from "./flightPlanFields";

const route = { origin: "Detroit — Metropolitan (DTW)", destinations: ["Milan (MIL; all airports)", "Rome (ROM; all airports)"], startDate: "2026-10-01", endDate: "2026-10-09" };
test("multi-city route needs home travel until it ends at the origin", () => {
  expect(homeJourneyStatus(route)).toBe("missing");
  expect(homeJourneyStatus({ ...route, destinations: [...route.destinations, "DTW"] })).toBe("covered");
  expect(sameTravelLocation("DTW", "Detroit — Metropolitan (DTW)")).toBe(true);
  expect(sameTravelLocation("Milan (MIL; all airports)", "Rome (ROM; all airports)")).toBe(false);
});
test("not-needed choice is scoped to the route and dates", () => {
  const waived = { ...route, homeReturnNotNeededFor: flightPlanItinerary(route) };
  expect(homeJourneyStatus(waived)).toBe("not-needed");
  expect(homeJourneyStatus({ ...waived, destinations: [...route.destinations].reverse() })).toBe("missing");
  expect(homeJourneyStatus({ ...waived, endDate: "2026-10-10" })).toBe("missing");
  expect(homeJourneyStatus({ ...waived, origin: "JFK" })).toBe("missing");
});
test("only a current single-destination return selection covers the journey home", () => {
  const single = { ...route, destinations: [route.destinations[0]] };
  const leg = { index: 0, itinerary: flightPlanItinerary(single), request: { tripType: "round-trip" }, returning: {} };
  expect(homeJourneyStatus(single, [leg])).toBe("covered");
  expect(homeJourneyStatus(single, [{ ...leg, returning: undefined }])).toBe("missing");
  expect(homeJourneyStatus(route, [{ ...leg, itinerary: flightPlanItinerary(route) }])).toBe("missing");
});
