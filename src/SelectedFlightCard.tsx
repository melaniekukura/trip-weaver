import type { Doc } from "../convex/_generated/dataModel";

export function SelectedFlightCard({ source, direction, travelers = 1, roundTrip = false, booked = false }: {
  source: Doc<"researchSources">; direction: "Outgoing" | "Return"; travelers?: number; roundTrip?: boolean; booked?: boolean;
}) {
  const flight = source.flight;
  return <div className="chosen-flight-card" aria-label={`${direction} flight selected`}>
    <div><h4>{direction} · {booked ? "✓ Booked" : "✓ Selected"}</h4>
      <strong>{flight.airline}</strong>
      <p>{flight.departure} → {flight.arrival}</p>
      <p>{flight.duration} · {flight.stops}</p>
    </div>
    {(!roundTrip || direction === "Return") && <div className="observed-fare">
      <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(flight.amount)}</strong>
      <span>{roundTrip ? "Both flights" : "One way"} · total for {travelers} {travelers === 1 ? "traveler" : "travelers"}</span>
    </div>}
  </div>;
}
