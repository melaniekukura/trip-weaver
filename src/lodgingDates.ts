import type { Doc } from "../convex/_generated/dataModel";
import { cityStays } from "./CityStaySummary";

type Route = Pick<Doc<"trips">, "origin" | "destinations" | "startDate" | "endDate">;

export function lodgingDateDefaults(route: Route, plan: Doc<"trips">["flightPlan"] | undefined, destination: string) {
  const stay = cityStays(route, plan?.legs).find(candidate => candidate.destination === destination);
  const checkInDate = stay?.checkInDate ?? route.startDate;
  const proposedCheckOut = stay?.checkOutDate ?? route.endDate;
  return { checkInDate, checkOutDate: proposedCheckOut > checkInDate ? proposedCheckOut : route.endDate };
}
