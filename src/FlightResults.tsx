import { flightSearchUrl } from "../convex/flightSearch";
import type { FlightRequest } from "../convex/flightSearch";
import { lowestFlightSources } from "./flightResearch";
import type { FlightResearch } from "./flightResearch";

import type { Doc } from "../convex/_generated/dataModel";
import { matchesFlightFilters } from "./flightFilters";
import type { FlightFilters } from "./flightFilters";

export function FlightResults({ research, flight, filters, selectedSourceId, onSelectOutbound }: {
  research: FlightResearch | null | undefined;
  flight: FlightRequest;
  filters?: FlightFilters;
  selectedSourceId?: string;
  onSelectOutbound?: (source: Doc<"researchSources">) => void;
}) {
  const matching = research?.sources.filter(source => !filters || matchesFlightFilters(source.flight, filters)) ?? [];
  const sources = lowestFlightSources(matching);
  return <div aria-live="polite">
    <div className="transportation-results-heading">
      <h4>{flight.origin}{flight.originType === "city" ? " (all airports)" : ""} → {flight.destination}{flight.destinationType === "city" ? " (all airports)" : ""} · {flight.departureDate}{flight.returnDate ? ` – ${flight.returnDate}` : ""}</h4>
      <a className="text-button" href={flightSearchUrl(flight)} target="_blank" rel="noopener noreferrer">Open Google Flights ↗</a>
    </div>
    {research === undefined && <p role="status">Loading flight search…</p>}
    {research === null && <p>No saved results for this route yet. Start a search to find flights.</p>}
    {research?.run.status === "pending" && <p role="status">Your flight search is queued…</p>}
    {research?.run.status === "running" && <p role="status">Searching flight listings and checking prices. This can take about a minute.</p>}
    {research?.run.status === "failed" && <p className="search-error" role="alert">{research.run.error}</p>}
    {research?.run.status === "completed" && <>
      <p className="field-hint">{sources.length} lowest-priced {sources.length === 1 ? "listing" : "listings"} from {research.sources.length} returned.
        {flight.tripType === "round-trip" ? "Round trip" : "One way"} · 1 adult · Economy including basic fares · USD. Prices may change; confirm before booking.</p>
      {research.run.finishedAt && <p className="field-hint">Observed {new Date(research.run.finishedAt).toLocaleString()}. Times are local to each airport.</p>}
      {sources.length === 0 && <p>No retrieved flights match. Adjust the filters or try another search.</p>}
      {research.run.airportScope && <p className="field-hint">Included airports: {research.run.airportScope.origin.join(", ")} → {research.run.airportScope.destination.join(", ")}.</p>}
      <ol className="transportation-flight-list">
        {sources.map((source, index) => <li className="transportation-flight-card" key={source._id}>
          <div className="transportation-flight-details">
            <span className="flight-rank">{index === 0 ? "Lowest returned fare" : `Option ${index + 1}`}</span>
            <h4>{source.flight!.airline}</h4>
            {source.flight!.originAirport && source.flight!.destinationAirport &&
              <p><strong>{source.flight!.originAirport} → {source.flight!.destinationAirport}</strong></p>}
            <p>{source.flight!.departure} → {source.flight!.arrival}</p>
            <p>{source.flight!.duration} · {source.flight!.stops}</p>
          </div>
          <div className="transportation-flight-price">
            <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(source.flight!.amount)}</strong>
            <span>{flight.tripType === "round-trip" ? "Round trip, from · USD / adult" : "USD / adult"}</span>
            {flight.tripType === "round-trip" && onSelectOutbound && <button type="button" className="secondary-button"
              aria-pressed={selectedSourceId === source._id} onClick={() => onSelectOutbound(source)}>Choose outgoing</button>}
          </div>
        </li>)}
      </ol>
    </>}
  </div>;
}
