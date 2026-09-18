import type { Doc } from "../convex/_generated/dataModel";

export function SelectedFlightCard({ source, direction, roundTrip = false, booked = false }: {
  source: Doc<"researchSources">; direction: "Outgoing" | "Return"; roundTrip?: boolean; booked?: boolean;
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
      <span>{roundTrip ? "Both flights, observed total" : "One-way observed fare"}</span>
    </div>}
  </div>;
}
