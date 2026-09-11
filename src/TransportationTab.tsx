import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { FlightRequest } from "../convex/flightSearch";
import { FlightResults } from "./FlightResults";
import { flightRequestFromTrip } from "./flightResearch";

type TransportationTabProps = {
  origin: string;
  destination: string;
  departureDate: string;
  onEditDetails: (tab: 0 | 1) => void;
  onSaveTrip: () => Promise<Id<"trips"> | null>;
};

export function TransportationTab({ origin, destination, departureDate, onEditDetails, onSaveTrip }: TransportationTabProps) {
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitted, setSubmitted] = useState<{ tripId: Id<"trips">; flight: FlightRequest; route: string } | null>(null);
  const lock = useRef(false);
  const start = useMutation(api.flightJobs.start);
  const route = JSON.stringify([origin, destination, departureDate]);
  const current = submitted?.route === route ? submitted : null;
  const research = useQuery(api.flightJobs.latest, enabled && current ? { tripId: current.tripId, flight: current.flight } : "skip");
  const result = research;
  const busy = starting || result?.run.status === "pending" || result?.run.status === "running";

  async function search(refresh = false) {
    if (lock.current) return;
    lock.current = true;
    setStarting(true); setError(""); setNotice("");
    try {
      const flight = flightRequestFromTrip(origin, destination, departureDate);
      const tripId = await onSaveTrip();
      if (!tripId) return;
      const response = await start({ tripId, flight, refresh });
      setSubmitted({ tripId, flight, route });
      if (response.reused) setNotice("Using a recent matching search. Refresh to request new prices.");
    } catch (err) {
      const data = err instanceof ConvexError ? err.data : null;
      setError(data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message : err instanceof Error ? err.message : "Unable to start flight search. Please try again.");
    } finally { lock.current = false; setStarting(false); }
  }

  return <>
    <h3>Find your way there</h3>
    <p className="field-hint">Find flights to your first destination and compare the three lowest-priced returned listings.</p>
    <label className="flight-finder-toggle">
      <span><strong>Find my flight</strong><span className="field-hint">Saves your trip details and starts a flight search.</span></span>
      <input type="checkbox" role="switch" checked={enabled} disabled={starting}
        onChange={(event) => { setEnabled(event.target.checked); if (event.target.checked) void search(); }}
        aria-label="Find my flight" aria-controls="transportation-results" />
    </label>
    <p className="field-hint">City selections include all passenger airports in that city; individual airport selections stay specific.
      Fares are one way, for one adult, in USD. Preference filtering is not available yet.</p>
    {enabled && <div id="transportation-results" className="transportation-flights">
      {starting && <p role="status">Saving your trip and starting flight search…</p>}
      {error && <p className="search-error" role="alert">{error}</p>}
      {notice && <p role="status" className="field-hint">{notice}</p>}
      {!starting && !current && <div className="flight-setup">
        <p>Choose cities or airports in Destinations and a start date in Overview, then search.</p>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={() => onEditDetails(1)}>Choose locations</button>
          <button className="secondary-button" type="button" onClick={() => onEditDetails(0)}>Trip dates</button>
        </div>
      </div>}
      {current && !starting && <FlightResults research={result} flight={current.flight} />}
      <button className="secondary-button" type="button" disabled={busy} onClick={() => void search(result?.run.status === "completed")}>
        {busy ? "Searching…" : result?.run.status === "completed" ? "Refresh prices" : "Search flights"}
      </button>
      <p className="field-hint">Searches use Firecrawl credits. Turning this off hides results; a started search continues saving to your trip.</p>
    </div>}
  </>;
}
