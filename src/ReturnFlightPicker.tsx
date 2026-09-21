import { useProfileFlightFilters } from "./profileDefaults";
import { FlightAccessibilityNotice } from "./FlightAccessibilityNotice";
import { rankReturnFlights } from "../convex/airlineNames";
import { SelectedFlightCard } from "./SelectedFlightCard";
import { AirlineBookingLink } from "./AirlineBookingLink";
import { FlightSearchError } from "./FlightSearchError";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { getFirecrawlSessionId } from "./firecrawlSession";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { FlightRequest } from "../convex/flightSearch";
import { FlightFilterControls } from "./FlightFilterControls";
import { matchesFlightFilters } from "./flightFilters";

export function ReturnFlightPicker({ tripId, request, outbound, onClose, selectedReturn, onSelectReturn, disabled = false }: {
  selectedReturn?: Doc<"researchSources">; onSelectReturn?: (source: Doc<"researchSources"> | null) => Promise<unknown>; disabled?: boolean;
  tripId: Id<"trips">; request: FlightRequest; outbound: Doc<"researchSources">; onClose: () => void;
}) {
  const args = { tripId, flight: request, outboundSourceId: outbound._id };
  const [reusedRunId, setReusedRunId] = useState<Id<"researchRuns"> | null>(null);
  const result = useQuery(api.flightJobs.latest, { ...args, ...(reusedRunId ? { runId: reusedRunId } : {}) });
  const start = useMutation(api.flightJobs.start);
  const [filters, setFilters] = useProfileFlightFilters();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [localSelection, setLocalSelection] = useState<Doc<"researchSources"> | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const busy = disabled || pending || result?.run.status === "pending" || result?.run.status === "running";
  const options = rankReturnFlights(result?.sources.filter(source => matchesFlightFilters(source.flight, filters)) ?? [], outbound.flight.airline);
  const selected = onSelectReturn ? selectedReturn : localSelection;
  async function search(refresh = false) {
    setPending(true); setError(""); setNotice("");
    try { const response = await start({ ...args, refresh, sessionId: getFirecrawlSessionId() }); setReusedRunId(response.runId);
      setNotice(response.reused ? "Reusing a recent matching search without starting a new browser search." : ""); setShowOptions(true); }
    catch (error) {
      const data = error instanceof ConvexError ? error.data : null;
      setError(data && typeof data === "object" && "message" in data ? String(data.message) : "Unable to search for return flights.");
    } finally { setPending(false); }
  }
  const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  return <section className="return-flight-picker" aria-label="Return flights">
    {!onSelectReturn && <>
      <SelectedFlightCard source={outbound} direction="Outgoing" roundTrip />
      <button type="button" className="text-button" onClick={onClose}>Change outgoing flight</button>
    </>}
    <h4 className="flight-search-heading">Return flight · {request.destination} → {request.origin} · {request.returnDate}</h4>
    <details className="transport-filter-details">
      <summary>Return flight filters</summary>
      <FlightFilterControls value={filters} onChange={setFilters} title="Return flight filters" leg="return" priceLabel="Maximum round-trip total (USD)" />
    </details>
    <p className="field-hint">Prices cover both flights. Returns sharing an outgoing airline appear first, then other airlines; each group is sorted by price.</p>
    <button type="button" className="primary-button" disabled={busy || result === undefined} onClick={() => void search(false)}>
      {busy ? "Finding return flights…" : result?.run.status === "completed" ? "Use recent return flights" : "Find matching return flights"}
    </button>
    {result?.run.status === "completed" && <button type="button" className="text-button" disabled={busy} onClick={() => void search(true)}>Refresh return flights</button>}
    {notice && <p className="field-hint" role="status">{notice}</p>}
    {error && <p className="search-error" role="alert">{error}</p>}
    {(result?.run.status === "pending" || result?.run.status === "running") && <p role="status">Selecting your outgoing flight and retrieving matching return options…</p>}
    {!error && !pending && result?.run.status === "failed" && <FlightSearchError run={result.run} />}
    {selected && <SelectedFlightCard source={selected} direction="Return" roundTrip />}
    {selected && <button type="button" className="text-button" onClick={() => setShowOptions(!showOptions)}>{showOptions ? "Hide other return options" : "See other return options"}</button>}
    {result?.run.status === "completed" && <>
      <FlightAccessibilityNotice assessment={result.accessibility} />
      <p className="field-hint">Observed {new Date(result.run.finishedAt!).toLocaleString()}. Local airport times; verify the final fare and availability before booking.</p>
      {(!selected || showOptions) && <p role="status">Showing {options.length} of {result.sources.length} retrieved return flights.</p>}
      {(!selected || showOptions) && !options.length && <p>No retrieved return flights match. Adjust the return filters or try another outgoing flight.</p>}
      {(!selected || showOptions) && <ul className="flight-search-results">{options.map(source => <li className={`observed-flight${selected?._id === source._id ? " is-selected" : ""}`} key={source._id}>
        <div><strong>{source.flight.airline}</strong><p>{source.flight.departure} → {source.flight.arrival}</p><span>{source.flight.duration} · {source.flight.stops}</span></div>
        <div className="observed-fare"><strong>{money(source.flight.amount)}</strong><span>Both flights, observed total</span>
          <button type="button" className="secondary-button" aria-pressed={selected?._id === source._id} disabled={disabled} onClick={() => { setLocalSelection(source); setShowOptions(false); if (onSelectReturn) void onSelectReturn(source); }}>{selected?._id === source._id ? "Selected" : "Select return"}</button></div>
      </li>)}</ul>}
      {selected && !onSelectReturn && <div className="round-trip-summary" role="status">
        <h4>Your round trip</h4>
        <p><strong>Outgoing:</strong> {outbound.flight.airline} · {outbound.flight.departure} → {outbound.flight.arrival}</p>
        <p><strong>Return:</strong> {selected.flight.airline} · {selected.flight.departure} → {selected.flight.arrival}</p>
        <p><strong>Observed total: {money(selected.flight.amount)}</strong></p>
        {!onSelectReturn && <AirlineBookingLink key={selected._id} tripId={tripId} outbound={outbound} returning={selected} outboundId={outbound._id} returnId={selected._id} needsReturn />}
      </div>}
    </>}
  </section>;
}
