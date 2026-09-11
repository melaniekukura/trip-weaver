import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useId, useState } from "react";
import { ReturnFlightPicker } from "./ReturnFlightPicker";
import { FlightFilterControls } from "./FlightFilterControls";
import { emptyFlightFilters, matchesFlightFilters } from "./flightFilters";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { FlightResults } from "./FlightResults";
import { LocationPicker } from "./LocationPicker";
import { flightRequestFromTrip } from "./flightResearch";
import { validateFlightRequest } from "../convex/flightSearch";
import type { FlightRequest } from "../convex/flightSearch";

export function FlightSearchPanel({ trip }: { trip: Doc<"trips"> }) {
  const id = useId();
  const [origin, setOrigin] = useState(trip.origin);
  const [destination, setDestination] = useState(trip.destinations[0] ?? "");
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
    setPending(true); setError(""); setNotice("");
    try {
      const flight = refresh && submitted ? submitted : validateFlightRequest({
        ...flightRequestFromTrip(origin, destination, departureDate),
        ...(tripType === "round-trip" ? { tripType, returnDate } : {}),
      });
      const result = await start({ tripId: trip._id, flight, refresh });
      setSubmitted(flight); setOutbound(null);
      if (result.reused) setNotice("Using matching results saved within 15 minutes, or the search already in progress.");
    } catch (err) {
      const data = err instanceof ConvexError ? err.data : null;
      setError(data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message : err instanceof Error ? err.message : "Unable to start flight search. Please try again.");
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
        <LocationPicker label="From city or airport" value={origin} required onSelect={setOrigin} onClear={() => setOrigin("")} />
        <LocationPicker label="To city or airport" value={destination} required onSelect={setDestination} onClear={() => setDestination("")} />
        <label htmlFor={`${id}-date`}>Departure date
          <input id={`${id}-date`} type="date" required value={departureDate}
            min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDepartureDate(event.target.value)} />
        </label>
        {tripType === "round-trip" && <label htmlFor={`${id}-return`}>Return date
          <input id={`${id}-return`} type="date" required value={returnDate} min={departureDate}
            onChange={(event) => setReturnDate(event.target.value)} />
        </label>}
      </div>
      <p className="field-hint">City selections cover all passenger airports in that city. Searches usually take 30–70 seconds and use Firecrawl credits.</p>
      <button className="primary-button" disabled={busy} type="submit">{busy ? "Searching…" : "Search flights"}</button>
    </form>
    <FlightFilterControls value={filters} onChange={setFilters} />
    {error && <p className="search-error" role="alert">{error}</p>}
    {notice && <p className="field-hint" role="status">{notice}</p>}
    {submitted && <>
      <FlightResults research={research} flight={submitted} filters={filters}
        selectedSourceId={outbound?._id} onSelectOutbound={setOutbound} />
      {outbound && visibleSources.some(source => source._id === outbound._id) &&
        <ReturnFlightPicker key={outbound._id} tripId={trip._id} request={submitted} outbound={outbound} onClose={() => setOutbound(null)} />}
      {research?.run.status === "completed" && <button type="button" className="secondary-button" disabled={busy} onClick={() => void search(true)}>Refresh prices</button>}
    </>}
  </section>;
}
