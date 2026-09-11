import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useId, useState } from "react";
import { ReturnFlightPicker } from "./ReturnFlightPicker";
import { FlightFilterControls } from "./FlightFilterControls";
import { emptyFlightFilters, matchesFlightFilters } from "./flightFilters";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { flightSearchUrl } from "../convex/flightSearch";
import type { FlightRequest } from "../convex/flightSearch";

export function FlightSearchPanel({ trip }: { trip: Doc<"trips"> }) {
  const id = useId();
  const [origin, setOrigin] = useState(/^[A-Za-z]{3}$/.test(trip.origin) ? trip.origin.toUpperCase() : "");
  const [destination, setDestination] = useState(/^[A-Za-z]{3}$/.test(trip.destinations[0]) ? trip.destinations[0].toUpperCase() : "");
  const [departureDate, setDepartureDate] = useState(trip.startDate);
  const [tripType, setTripType] = useState<"one-way" | "round-trip">("one-way");
  const [returnDate, setReturnDate] = useState(trip.endDate);
  const [submitted, setSubmitted] = useState<FlightRequest | null>(null);
  const research = useQuery(api.flightJobs.latest, submitted ? {
    tripId: trip._id, flight: submitted,
  } : "skip");
  const start = useMutation(api.flightJobs.start);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [outbound, setOutbound] = useState<Doc<"researchSources"> | null>(null);
  const [filters, setFilters] = useState({ ...emptyFlightFilters });
  const visibleSources = research?.sources.filter((source) => matchesFlightFilters(source.flight, filters)) ?? [];
  const busy = pending || research?.run.status === "pending" || research?.run.status === "running";

  async function search(refresh = false) {
    const flight: FlightRequest = refresh && submitted ? submitted : {
      origin: origin.trim().toUpperCase(), destination: destination.trim().toUpperCase(), departureDate, tripType,
      ...(tripType === "round-trip" ? { returnDate } : {}),
    };
    setPending(true); setError(""); setNotice("");
    try {
      const result = await start({ tripId: trip._id, flight, refresh });
      setSubmitted(flight); setOutbound(null);
      if (result.reused) setNotice("Using matching results saved within 15 minutes, or the search already in progress.");
    } catch (err) {
      const data = err instanceof ConvexError ? err.data : null;
      setError(data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message : "Unable to start flight search. Please try again.");
    } finally { setPending(false); }
  }

  return <section className="flight-search-panel" aria-label={`Flights for ${trip.name}`}>
    <h4>Find flights <span className="data-source">Prototype</span></h4>
    <p className="field-hint">1 adult · Economy including basic fares · USD</p>
    <form onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <div className="flight-search-fields">
        <label htmlFor={`${id}-type`}>Trip type
          <select id={`${id}-type`} value={tripType} onChange={(event) => setTripType(event.target.value as "one-way" | "round-trip")}>
            <option value="one-way">One way</option><option value="round-trip">Round trip</option>
          </select>
        </label>
        <label htmlFor={`${id}-origin`}>From airport
          <input id={`${id}-origin`} placeholder="DTW" pattern="[A-Za-z]{3}" maxLength={3} required value={origin}
            onChange={(event) => setOrigin(event.target.value.toUpperCase())} />
        </label>
        <label htmlFor={`${id}-destination`}>To airport
          <input id={`${id}-destination`} placeholder="LAX" pattern="[A-Za-z]{3}" maxLength={3} required value={destination}
            onChange={(event) => setDestination(event.target.value.toUpperCase())} />
        </label>
        <label htmlFor={`${id}-date`}>Departure date
          <input id={`${id}-date`} type="date" required value={departureDate}
            min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDepartureDate(event.target.value)} />
        </label>
        {tripType === "round-trip" && <label htmlFor={`${id}-return`}>Return date
          <input id={`${id}-return`} type="date" required value={returnDate} min={departureDate}
            onChange={(event) => setReturnDate(event.target.value)} />
        </label>}
      </div>
      <p className="field-hint">Use three-letter airport codes. Searches usually take 30–70 seconds and use Firecrawl credits.</p>
      <button className="primary-button" disabled={busy} type="submit">{busy ? "Searching…" : "Search flights"}</button>
    </form>
    <FlightFilterControls value={filters} onChange={setFilters} />
    {error && <p className="search-error" role="alert">{error}</p>}
    {notice && <p className="field-hint" role="status">{notice}</p>}
    {submitted && <div aria-live="polite">
      <h4 className="flight-search-heading">{submitted.origin} → {submitted.destination} · {submitted.departureDate}{submitted.returnDate ? ` – ${submitted.returnDate} · Round trip` : " · One way"}</h4>
      <a className="text-button" href={flightSearchUrl(submitted)} target="_blank" rel="noopener noreferrer">Open this search in Google Flights ↗</a>
      {research === undefined && <p role="status">Loading search…</p>}
      {research?.run.status === "pending" && <p role="status">Queued. Results will be saved to this trip.</p>}
      {research?.run.status === "running" && <p role="status">Reading flight listings and checking the route, date, and prices…</p>}
      {research?.run.status === "failed" && <p className="search-error" role="alert">{research.run.error}</p>}
      {research?.run.status === "completed" && <>
        <p className="field-hint">Observed {new Date(research.run.finishedAt!).toLocaleString()}. Times are local to each airport. Prices may change; check Google Flights before booking. Baggage fees may apply.</p>
        {submitted.tripType === "round-trip" && <p className="field-hint">Outbound options with observed round-trip prices. Time and stop filters apply to the outbound flight; select an outgoing flight below to find matching returns and filter each leg separately.</p>}
        <p role="status">Showing {visibleSources.length} of {research.sources.length} retrieved flights.</p>
        {visibleSources.length === 0 && <p>No retrieved flights match these filters. Clear or adjust them, or check Google Flights for more options.</p>}
        <ul className="flight-search-results">{visibleSources.map((source) => source.flight && <li key={source._id} className="observed-flight">
          <div><strong>{source.flight.airline}</strong><p>{source.flight.departure} → {source.flight.arrival}</p>
            <span>{source.flight.duration} · {source.flight.stops}</span></div>
          <div className="observed-fare"><strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(source.flight.amount)}</strong>
            <span>{submitted.tripType === "round-trip" ? "Round trip, from" : "Observed one-way fare"}</span>
            {submitted.tripType === "round-trip" && <button className="secondary-button" aria-pressed={outbound?._id === source._id} onClick={() => setOutbound(source)}>Choose outgoing</button>}</div>
        </li>)}</ul>
        {outbound && visibleSources.some(source => source._id === outbound._id) && <ReturnFlightPicker key={outbound._id} tripId={trip._id} request={submitted} outbound={outbound} onClose={() => setOutbound(null)} />}
        <p className="field-hint">Up to five listings in source order; this is not a complete or cheapest-fare ranking. Matching searches reuse results for 15 minutes.</p>
        <button className="secondary-button" disabled={busy} onClick={() => void search(true)}>Refresh prices</button>
      </>}
    </div>}
  </section>;
}
