import type { Doc } from "../convex/_generated/dataModel";
import { flightPlanItinerary } from "../convex/flightPlanFields";
import { sameTravelLocation } from "../convex/homeJourney";
import { transportLocationLabel } from "./transportationLegs";

type Route = Pick<Doc<"trips">, "origin" | "destinations" | "startDate" | "endDate">;
type Leg = NonNullable<Doc<"trips">["flightPlan"]>["legs"][number];

export function cityStays(route: Route, legs: Leg[] = []) {
  const current = legs.filter(leg => leg.itinerary === flightPlanItinerary(route));
  return route.destinations.flatMap((destination, index) => {
    if (index === route.destinations.length - 1 && sameTravelLocation(destination, route.origin)) return [];
    const incoming = current.find(leg => leg.index === index);
    const next = current.find(leg => leg.index === index + 1);
    const returning = route.destinations.length === 1 && incoming?.request.tripType === "round-trip";
    return [{ destination, arrival: incoming?.outbound.flight.arrival,
      departure: returning ? incoming.returning?.flight.departure : next?.outbound.flight.departure,
      plannedDeparture: returning && !incoming.returning ? incoming.request.returnDate : undefined }];
  });
}

export function CityStaySummary({ route, plan, onOpenTransportation }: {
  route: Route; plan?: Doc<"trips">["flightPlan"]; onOpenTransportation: () => void;
}) {
  const stays = cityStays(route, plan?.legs);
  const stale = plan?.legs.some(leg => leg.itinerary !== flightPlanItinerary(route));
  return <section className="city-stay-summary" aria-label="City dates from transportation" title="Selected flight times, local to each airport">
    <div className="button-row"><h3>Your city dates</h3>
      <button type="button" className="text-button" onClick={onOpenTransportation}>View transportation</button></div>
    {stale && <p role="status">Your route or trip dates changed. Update Transportation to see the latest city dates.</p>}
    {!stays.length ? <p>Add destinations to see your city schedule.</p> : <ul className="city-stays">
      {stays.map((stay, index) => <li key={`${index}:${stay.destination}`}>
        <strong>{transportLocationLabel(stay.destination)}</strong>
        <span><span className="field-hint">Arrive</span> {stay.arrival || "Arrival not selected"}</span>
        <span><span className="field-hint">Leave</span> {stay.departure || (stay.plannedDeparture ? `${stay.plannedDeparture} (planned; return flight not selected)` : "Departure not selected")}</span>
      </li>)}
    </ul>}
  </section>;
}
