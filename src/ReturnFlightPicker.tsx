import { FlightAccessibilityNotice } from "./FlightAccessibilityNotice";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { FlightRequest } from "../convex/flightSearch";
import { FlightFilterControls } from "./FlightFilterControls";
import { emptyFlightFilters, matchesFlightFilters } from "./flightFilters";

export function ReturnFlightPicker({ tripId, request, outbound, onClose }: {
  tripId: Id<"trips">; request: FlightRequest; outbound: Doc<"researchSources">; onClose: () => void;
}) {
  const args = { tripId, flight: request, outboundSourceId: outbound._id };
  const result = useQuery(api.flightJobs.latest, args);
  const start = useMutation(api.flightJobs.start);
  const [filters, setFilters] = useState({ ...emptyFlightFilters });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"researchSources"> | null>(null);
  const busy = pending || result?.run.status === "pending" || result?.run.status === "running";
  const options = result?.sources.filter(source => matchesFlightFilters(source.flight, filters)) ?? [];
  const selected = options.find(source => source._id === selectedId);
  async function search(refresh = false) {
    setPending(true); setError(""); setSelectedId(null);
    try { await start({ ...args, refresh }); }
    catch (error) {
      const data = error instanceof ConvexError ? error.data : null;
      setError(data && typeof data === "object" && "message" in data ? String(data.message) : "Unable to search for return flights.");
    } finally { setPending(false); }
  }
  const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  return <section className="return-flight-picker" aria-label="Return flights">
    <h4>Selected outgoing flight · {request.origin} → {request.destination}</h4>
    <p><strong>{outbound.flight.airline}</strong> · {outbound.flight.departure} → {outbound.flight.arrival}</p>
    <p>{outbound.flight.duration} · {outbound.flight.stops}</p>
    <button className="text-button" onClick={onClose}>Change outgoing flight</button>
    <h4 className="flight-search-heading">Return flight · {request.destination} → {request.origin} · {request.returnDate}</h4>
    <FlightFilterControls value={filters} onChange={setFilters} title="Return flight filters" leg="return" priceLabel="Maximum round-trip total (USD)" />
    <p className="field-hint">Return options depend on your selected outgoing flight. A fresh return search uses Firecrawl browser credits. Each price below covers both flights.</p>
    <button className="primary-button" disabled={busy || result === undefined} onClick={() => void search(result?.run.status === "completed")}>
      {busy ? "Finding return flights…" : result?.run.status === "completed" ? "Refresh return flights" : "Find matching return flights"}
    </button>
    {error && <p className="search-error" role="alert">{error}</p>}
    {(result?.run.status === "pending" || result?.run.status === "running") && <p role="status">Selecting your outgoing flight and retrieving matching return options…</p>}
    {result?.run.status === "failed" && <p className="search-error" role="alert">{result.run.error}</p>}
    {result?.run.status === "completed" && <>
      <FlightAccessibilityNotice assessment={result.accessibility} />
      <p className="field-hint">Observed {new Date(result.run.finishedAt!).toLocaleString()}. Local airport times; verify the final fare and availability before booking.</p>
      <p role="status">Showing {options.length} of {result.sources.length} retrieved return flights.</p>
      {!options.length && <p>No retrieved return flights match. Adjust the return filters or try another outgoing flight.</p>}
      <ul className="flight-search-results">{options.map(source => <li className="observed-flight" key={source._id}>
        <div><strong>{source.flight.airline}</strong><p>{source.flight.departure} → {source.flight.arrival}</p><span>{source.flight.duration} · {source.flight.stops}</span></div>
        <div className="observed-fare"><strong>{money(source.flight.amount)}</strong><span>Both flights, observed total</span>
          <button className="secondary-button" aria-pressed={selectedId === source._id} onClick={() => setSelectedId(source._id)}>Select return</button></div>
      </li>)}</ul>
      {selected && <div className="round-trip-summary" role="status">
        <h4>Your round trip</h4>
        <p><strong>Outgoing:</strong> {outbound.flight.airline} · {outbound.flight.departure} → {outbound.flight.arrival}</p>
        <p><strong>Return:</strong> {selected.flight.airline} · {selected.flight.departure} → {selected.flight.arrival}</p>
        <p><strong>Observed total: {money(selected.flight.amount)}</strong></p>
        <a className="text-button" href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Review return options in Google Flights ↗</a>
        <p className="field-hint">The link keeps your outgoing selection. Choose this return flight there to confirm booking details.</p>
      </div>}
    </>}
  </section>;
}
