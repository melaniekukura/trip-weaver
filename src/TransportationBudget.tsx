import { useBudgetCosts } from "./useBudgetCosts";
import { BudgetConversionStatus } from "./BudgetConversionStatus";
import { currentLocalDestinations, rideLabels } from "../convex/localTransportationFields";
import type { LocalDestination } from "../convex/localTransportationFields";
import { formatCost } from "./budgetCosts";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { budgetMoney, transportationTotals } from "./budgetCalculations";

export function TransportationBudget({ trip }: { trip: Doc<"trips"> }) {
  const totals = transportationTotals(trip);
  const { costs, currency, error, retry } = useBudgetCosts(trip);
  const totalLabel = costs ? formatCost(costs.transportationTotals[currency] ?? 0, currency) : error ? "--" : "Calculating…";

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
    {currentLocalDestinations(trip).map(({ destination, saved }) =>
      <DestinationRides key={destination} trip={trip} destination={destination} saved={saved} />)}
    <BudgetConversionStatus error={error} retry={retry} />
    <p className="budget-total" aria-live="polite">Transportation total <strong>{totalLabel || "--"}</strong></p>
  </div>;
}

function DestinationRides({ trip, destination, saved }: { trip: Doc<"trips">; destination: string; saved?: LocalDestination }) {
  const setEnabled = useMutation(api.localTransportation.setEnabled);
  const changeCount = useMutation(api.localTransportation.changeCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const enabled = saved?.enabled ?? false;
  async function perform(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setPending(true); setError("");
    try { await action(); } catch (cause) {
      const data = cause instanceof ConvexError ? cause.data : null;
      setError(data && typeof data === "object" && "message" in data ? String(data.message) : "Unable to update transportation. Please try again.");
    } finally { lock.current = false; setPending(false); }
  }
  const researching = saved?.rides.some(ride => ride.status === "pending");
  const subtotals: Record<string, number> = {};
  for (const ride of saved?.rides ?? []) if (ride.status === "priced" && ride.currency && ride.amount !== undefined && ride.count) {
    subtotals[ride.currency] = (subtotals[ride.currency] ?? 0) + Math.round(ride.amount * 100) * ride.count;
  }
  const maximums: Record<string, number> = {};
  for (const ride of saved?.rides ?? []) if (ride.currency && ride.amount !== undefined) {
    maximums[ride.currency] = Math.max(maximums[ride.currency] ?? 1, ride.amount);
  }
  return <section className="budget-destination-rides" aria-label={`${destination} transportation`}>
    <div className="budget-rides-heading">
      <h4>{destination}</h4>
      <label className="budget-include-rides"><input type="checkbox" role="switch" checked={enabled} disabled={pending}
        aria-label={`Include local transportation in ${destination}`}
        onChange={event => { const include = event.target.checked;
          void perform(() => setEnabled({ tripId: trip._id, destination, enabled: include }));
        }} />Include local transportation</label>
    </div>
    {enabled && <>
      <div className="budget-rides-heading">
        {researching ? <p role="status">Finding local fares…</p> : <span />}
        <button className="secondary-button" type="button" disabled={pending || researching}
          onClick={() => void perform(() => setEnabled({ tripId: trip._id, destination, enabled: true, refresh: true }))}>Refresh prices</button>
      </div>
      <div className="budget-rides-table-wrap"><table className="budget-rides-table">
        <caption className="interest-sr-only">Local transportation in {destination}</caption>
        <thead><tr><th scope="col">Method</th><th scope="col">Price / ride</th><th scope="col">Subtotal</th><th scope="col">Rides</th></tr></thead>
        <tbody>{saved?.rides.map(ride => <tr key={ride.mode}>
          <th scope="row">{rideLabels[ride.mode]}<small className="ride-unit">{["taxi", "rideshare"].includes(ride.mode) ? "Per vehicle" : "Per passenger"}</small></th>
          <td>{ride.status === "priced" && ride.amount !== undefined && ride.currency ? <>
            <strong>{formatCost(ride.amount, ride.currency)} {ride.currency}</strong>
            <div className="budget-price-track" aria-hidden="true"><span style={{ width: `${ride.amount / maximums[ride.currency] * 100}%` }} /></div>
            <details><summary>Source &amp; fare details</summary>
              {ride.note && <p>{ride.note}</p>}
              {ride.sourceUrl && <a href={ride.sourceUrl} target="_blank" rel="noreferrer">View source</a>}
              {ride.evidence && <blockquote>{ride.evidence}</blockquote>}
              {ride.checkedAt && <p>Checked {new Date(ride.checkedAt).toLocaleDateString()}</p>}
            </details>
          </> : <span>{ride.status === "pending" ? "Searching…" : "Price not confirmed"}</span>}</td>
          <td>{ride.status === "priced" && ride.amount !== undefined && ride.currency
            ? formatCost(Math.round(ride.amount * 100) * ride.count / 100, ride.currency) : "--"}</td>
          <td><div className="budget-ride-counter">
            <button type="button" className="secondary-button" aria-label={`Remove one ${rideLabels[ride.mode]} ride in ${destination}`}
              disabled={pending || ride.count === 0} onClick={() => void perform(() => changeCount({ tripId: trip._id, destination, mode: ride.mode, delta: -1 }))}>−</button>
            <output aria-label={`${rideLabels[ride.mode]} ride count in ${destination}`}>{ride.count}</output>
            <button type="button" className="secondary-button" aria-label={`Add one ${rideLabels[ride.mode]} ride in ${destination}`}
              disabled={pending || ride.count >= 1000} onClick={() => void perform(() => changeCount({ tripId: trip._id, destination, mode: ride.mode, delta: 1 }))}>+</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>
      <p className="budget-subtotal">Local transportation <strong>{Object.entries(subtotals).map(([currency, cents]) => `${formatCost(cents / 100, currency)} ${currency}`).join(" + ") || "--"}</strong></p>
      {saved?.rides.some(ride => ride.count > 0 && ride.status !== "priced") && <p role="status">Some selected rides have unconfirmed prices.</p>}
    </>}
    {error && <p className="search-error" role="alert">{error}</p>}
  </section>;
}
