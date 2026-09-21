import { expect, test } from "vitest";
import { cityStays } from "./CityStaySummary";
import { flightPlanItinerary } from "../convex/flightPlanFields";

type Leg = NonNullable<Parameters<typeof cityStays>[1]>[number];
const route = { origin: "Detroit", destinations: ["Milan", "Rome", "Detroit"], startDate: "2026-09-25", endDate: "2026-10-04" };
function leg(index: number, departure: string, arrival: string, itinerary = flightPlanItinerary(route)): Leg {
  return { index, itinerary, request: { tripType: "one-way" }, outbound: { flight: { departure, arrival } } } as Leg;
}
test("city stays use arrival and the next leg's departure, preserving overnight local dates", () => {
  const stays = cityStays(route, [leg(0, "Sep 25, 18:00", "Sep 26, 08:15"), leg(1, "Sep 28, 16:00", "Sep 28, 17:10"), leg(2, "Oct 4, 20:00", "Oct 5, 18:50")]);
  expect(stays).toEqual([
    { destination: "Milan", arrival: "Sep 26, 08:15", departure: "Sep 28, 16:00", plannedDeparture: undefined,
      checkInDate: undefined, checkOutDate: undefined },
    { destination: "Rome", arrival: "Sep 28, 17:10", departure: "Oct 4, 20:00", plannedDeparture: undefined,
      checkInDate: undefined, checkOutDate: undefined },
  ]);
});
test("round trips use the selected return departure or explicitly planned return date", () => {
  const single = { ...route, destinations: ["Milan"] };
  const outbound = leg(0, "Sep 25, 18:00", "Sep 26, 08:15", flightPlanItinerary(single));
  outbound.request.tripType = "round-trip"; outbound.request.returnDate = "2026-10-04";
  expect(cityStays(single, [outbound])[0]).toMatchObject({ departure: undefined, plannedDeparture: "2026-10-04" });
  outbound.returning = { flight: { departure: "Oct 4, 07:05" } } as Leg["outbound"];
  expect(cityStays(single, [outbound])[0]).toMatchObject({ departure: "Oct 4, 07:05", plannedDeparture: undefined });
});
test("missing flights and changed routes never produce inferred city dates", () => {
  const stays = cityStays(route, [leg(0, "Sep 25", "Sep 26", "old itinerary")]);
  expect(stays).toHaveLength(2);
  expect(stays.every(stay => !stay.arrival && !stay.departure)).toBe(true);
});
