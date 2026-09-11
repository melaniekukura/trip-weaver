import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useId, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { FlightResults } from "./FlightResults";
import { LocationPicker } from "./LocationPicker";
import { flightRequestFromTrip } from "./flightResearch";
import type { FlightRequest } from "../convex/flightSearch";

export function FlightSearchPanel({ trip }: { trip: Doc<"trips"> }) {
  const id = useId();
  const [origin, setOrigin] = useState(trip.origin);
  const [destination, setDestination] = useState(trip.destinations[0] ?? "");
  const [departureDate, setDepartureDate] = useState(trip.startDate);
  const [submitted, setSubmitted] = useState<FlightRequest | null>(null);
  const research = useQuery(api.flightJobs.latest, submitted ? {
    tripId: trip._id, flight: submitted,
  } : "skip");
  const start = useMutation(api.flightJobs.start);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = pending || research?.run.status === "pending" || research?.run.status === "running";

  async function search(refresh = false) {
    setPending(true); setError(""); setNotice("");
    try {
      const flight = refresh && submitted ? submitted : flightRequestFromTrip(origin, destination, departureDate);
      const result = await start({ tripId: trip._id, flight, refresh });
      setSubmitted(flight);
      if (result.reused) setNotice("Using matching results saved within 15 minutes, or the search already in progress.");
    } catch (err) {
      const data = err instanceof ConvexError ? err.data : null;
      setError(data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message : err instanceof Error ? err.message : "Unable to start flight search. Please try again.");
    } finally { setPending(false); }
  }

  return <section className="flight-search-panel" aria-label={`Flights for ${trip.name}`}>
    <h4>Find flights <span className="data-source">Prototype</span></h4>
    <p className="field-hint">One way · 1 adult · Economy including basic fares · USD</p>
    <form onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <div className="flight-search-fields">
        <LocationPicker label="From city or airport" value={origin} required onSelect={setOrigin} onClear={() => setOrigin("")} />
        <LocationPicker label="To city or airport" value={destination} required onSelect={setDestination} onClear={() => setDestination("")} />
        <label htmlFor={`${id}-date`}>Departure date
          <input id={`${id}-date`} type="date" required value={departureDate}
            min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDepartureDate(event.target.value)} />
        </label>
      </div>
      <p className="field-hint">City selections cover all passenger airports in that city. Searches usually take 30–70 seconds and use Firecrawl credits.</p>
      <button className="primary-button" disabled={busy} type="submit">{busy ? "Searching…" : "Search flights"}</button>
    </form>
    {error && <p className="search-error" role="alert">{error}</p>}
    {notice && <p className="field-hint" role="status">{notice}</p>}
    {submitted && <>
      <FlightResults research={research} flight={submitted} />
      {research?.run.status === "completed" && <button className="secondary-button" disabled={busy} onClick={() => void search(true)}>Refresh prices</button>}
    </>}
  </section>;
}
