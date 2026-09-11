import { useState } from "react";
import { demoFlights, lowestPricedFlights } from "./demoFlights";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});
const flights = lowestPricedFlights(demoFlights);

type TransportationTabProps = {
  origin: string;
  destination: string;
  departureDate: string;
  onEditDetails: (tab: 0 | 1) => void;
};

export function TransportationTab({ origin, destination, departureDate, onEditDetails }: TransportationTabProps) {
  const [enabled, setEnabled] = useState(false);
  const hasRoute = Boolean(origin.trim() && destination.trim());

  return (
    <>
      <h3>Find your way there</h3>
      <p className="field-hint">Compare the three lowest-priced flights for the first stop of your trip.</p>
      <label className="flight-finder-toggle">
        <span>
          <strong>Find my flight</strong>
          <span className="field-hint">Show flight options for your outbound journey.</span>
        </span>
        <input type="checkbox" role="switch" checked={enabled} onChange={(event) => setEnabled(event.target.checked)}
          aria-label="Find my flight" aria-controls="transportation-results" aria-describedby="flight-demo-note" />
      </label>
      <p className="flight-demo-note" id="flight-demo-note">
        Demo preview · Sample flights and prices only. Live flight search is not connected yet.
        This preview is not saved with your trip.
      </p>
      <div id="transportation-results" aria-live="polite" aria-atomic="true">
        {enabled && (!hasRoute || !departureDate) && (
          <div className="flight-setup">
            <p>Add your starting point, first destination, and start date to preview flight options.</p>
            <div className="button-row">
              {!hasRoute && <button className="secondary-button" type="button" onClick={() => onEditDetails(1)}>Add destinations</button>}
              {!departureDate && <button className="secondary-button" type="button" onClick={() => onEditDetails(0)}>Add dates</button>}
            </div>
          </div>
        )}
        {enabled && hasRoute && departureDate && (
          <section className="transportation-flights" aria-labelledby="flight-preview-heading">
            <div className="transportation-results-heading">
              <div>
                <h4 id="flight-preview-heading">{origin.trim()} → {destination}</h4>
                <p>Outbound · <time dateTime={departureDate}>{departureDate}</time></p>
              </div>
              <span className="flight-sort-label">Lowest price first</span>
            </div>
            <p className="field-hint">Showing 3 of {demoFlights.length} sample options. Prices are one-way, per person, in USD.</p>
            <ol className="transportation-flight-list">
              {flights.map((flight, index) => (
                <li className="transportation-flight-card" key={flight.id}>
                  <div className="transportation-flight-details">
                    <span className="flight-rank">{index === 0 ? "Lowest sample fare" : `Option ${index + 1}`}</span>
                    <h4>{flight.airline}</h4>
                    <p>{flight.departureTime} departure · {Math.floor(flight.durationMinutes / 60)}h {flight.durationMinutes % 60}m
                      {` · ${flight.stops === 0 ? "Nonstop" : `${flight.stops} stop${flight.stops === 1 ? "" : "s"}`}`}</p>
                  </div>
                  <div className="transportation-flight-price">
                    <strong>{priceFormatter.format(flight.priceUsd)}</strong>
                    <span>USD / person</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </>
  );
}
