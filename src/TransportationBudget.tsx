import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { budgetMoney, transportationTotals } from "./budgetCalculations";

export function TransportationBudget({ trip }: { trip: Doc<"trips"> }) {
  const totals = transportationTotals(trip);
  const update = useMutation(api.trips.updateTransportationBudget);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const includeRides = trip.transportationBudget?.includeRides ?? false;
  async function save(rides = totals.rides, include = includeRides) {
    if (lock.current) return;
    lock.current = true; setPending(true); setError("");
    try {
      await update({ tripId: trip._id, budget: { revision: trip.transportationBudget?.revision ?? 0,
        includeRides: include, rides: rides.map(({ mode, count, price }) => ({ mode, count, price })) } });
    } catch (cause) {
      const data = cause instanceof ConvexError ? cause.data : null;
      setError(data && typeof data === "object" && "message" in data ? String(data.message) : "Unable to save transportation estimates. Please try again.");
    } finally { lock.current = false; setPending(false); }
  }
  const maxPrice = Math.max(1, ...totals.rides.map(ride => ride.price));

  return <div className="transportation-budget">
    <section aria-labelledby="selected-transport-title">
      <h4 id="selected-transport-title">Transportation from Plan My Trip</h4>
      {totals.staleCount > 0 && <p role="status">{totals.staleCount} outdated selections excluded. Update them in Plan My Trip.</p>}
      {!totals.flights.length && <p>No transportation selected yet.</p>}
      <ul className="budget-flight-costs">{totals.flights.map(({ leg, amount }) => <li key={leg.index}>
        <div><strong>{leg.request.origin} → {leg.request.destination}{leg.request.tripType === "round-trip" ? ` → ${leg.request.origin}` : ""}</strong>
          <span>{leg.outbound.flight.airline} · {leg.booked ? "Marked as booked" : "Selected"}</span></div>
        <strong>{amount === null ? "Choose a return flight to total this leg" : budgetMoney(amount)}</strong>
      </li>)}</ul>
      <p className="budget-subtotal">Selected transportation <strong>{budgetMoney(totals.flightTotal)}</strong></p>
    </section>
    <section aria-labelledby="ride-estimates-title">
      <div className="budget-rides-heading">
        <h4 id="ride-estimates-title">Local transportation estimates</h4>
        <label className="budget-include-rides"><input type="checkbox" role="switch" checked={includeRides} disabled={pending}
          onChange={event => void save(totals.rides, event.target.checked)} />Include rides in total</label>
      </div>
      <div className="budget-rides-table-wrap"><table className="budget-rides-table">
        <thead><tr><th scope="col">Method</th><th scope="col">Est. price / ride (USD)</th><th scope="col">Subtotal</th><th scope="col">Rides</th></tr></thead>
        <tbody>{totals.rides.map(ride => <tr key={ride.mode}>
          <th scope="row">{ride.label}<small className="ride-unit">{["taxi", "rideshare"].includes(ride.mode) ? "Per vehicle" : "Per passenger"}</small></th>
          <td><input key={`${ride.mode}-${ride.price}-${pending}`} type="number" min="0" max="100000" step="0.01"
            aria-label={`${ride.label} price per ride in USD`} defaultValue={ride.price} disabled={pending}
            onBlur={event => {
              const price = event.currentTarget.valueAsNumber;
              if (!event.currentTarget.validity.valid || !Number.isFinite(price)) {
                setError("Enter a price between 0 and 100,000 with at most two decimal places.");
                event.currentTarget.value = String(ride.price); return;
              }
              if (price !== ride.price) void save(totals.rides.map(item => item.mode === ride.mode ? { ...item, price } : item));
            }} />
            <div className="budget-price-track" aria-hidden="true"><span style={{ width: `${ride.price / maxPrice * 100}%` }} /></div>
          </td>
          <td>{budgetMoney(Math.round(ride.price * 100) * ride.count / 100)}</td>
          <td><div className="budget-ride-counter">
            <button type="button" className="secondary-button" aria-label={`Remove one ${ride.label} ride`} disabled={pending || ride.count === 0}
              onClick={() => void save(totals.rides.map(item => item.mode === ride.mode ? { ...item, count: item.count - 1 } : item))}>−</button>
            <output aria-label={`${ride.label} ride count`}>{ride.count}</output>
            <button type="button" className="secondary-button" aria-label={`Add one ${ride.label} ride`} disabled={pending || ride.count >= 1000}
              onClick={() => void save(totals.rides.map(item => item.mode === ride.mode ? { ...item, count: item.count + 1 } : item))}>+</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>
      <p className="budget-subtotal">Estimated rides {includeRides ? "(included)" : "(not included)"}<strong>{budgetMoney(totals.rideTotal)}</strong></p>
    </section>
    {error && <p className="search-error" role="alert">{error}</p>}
    <p className="budget-total" aria-live="polite">Transportation total <strong>{budgetMoney(totals.total)}</strong></p>
  </div>;
}
