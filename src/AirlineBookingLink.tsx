import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { FlightSearchError } from "./FlightSearchError";
import { sanitizeFlightDiagnostic } from "../convex/flightDiagnostics";
import type { FlightDiagnostic } from "../convex/flightDiagnostics";
import { api } from "../convex/_generated/api";
import { getFirecrawlSessionId } from "./firecrawlSession";
import { airlineSearchLinks } from "./airlineSearchLinks";
import type { FlightSegment } from "../convex/flightSegments";
import type { Doc, Id } from "../convex/_generated/dataModel";

export function AirlineBookingLink({ tripId, outboundId, returnId, needsReturn = false, outbound, returning }: {
  tripId: Id<"trips">; outboundId: Id<"researchSources">; returnId?: Id<"researchSources">; needsReturn?: boolean;
  outbound: Doc<"researchSources">; returning?: Doc<"researchSources">;
}) {
  const resolve = useAction(api.bookingLinks.resolve);
  const [result, setResult] = useState<{ url: string; outgoingSegments: FlightSegment[]; returnSegments: FlightSegment[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<{ _id: string; diagnostic: FlightDiagnostic } | null>(null);
  const lock = useRef(false);
  async function load() {
    if (lock.current) return;
    lock.current = true; setPending(true); setError(""); setDetail(null);
    try { setResult(await resolve({ tripId, outboundId, returnId, sessionId: getFirecrawlSessionId() })); }
    catch (error) {
      const data = error instanceof ConvexError ? error.data : null;
      if (data && typeof data === "object" && "diagnostic" in data) setDetail({ _id: "reference" in data ? String(data.reference) : "unavailable", diagnostic: sanitizeFlightDiagnostic(data.diagnostic, "browser_result") });
      setError(data && typeof data === "object" && "message" in data ? String(data.message) : "Unable to retrieve booking options. Use the airline search links below or try again.");
    } finally { lock.current = false; setPending(false); }
  }
  if (needsReturn && !returnId) return <p className="field-hint">Select a return flight to see booking options for both flights.</p>;
  const links = airlineSearchLinks([outbound.flight.airline, ...(returning ? [returning.flight.airline] : [])]);
  return <div className="airline-booking-link">
    {result && <>
      <a className="primary-button" href={result.url} target="_blank" rel="noopener noreferrer">Open booking options on Google Flights ↗</a>
      <p className="field-hint">Choose a seller for your selected itinerary. Verify flights and the final fare before paying; availability and prices can change.</p>
    </>}
    <button type="button" className={result ? "text-button" : "primary-button"} disabled={pending} onClick={() => void load()}>
      {pending ? "Finding booking options…" : result ? "Refresh booking options" : "Find booking options on Google Flights"}</button>
    {!result && <p className="field-hint">Finds the booking page for your selected flights, including available airline and travel-agency sellers.</p>}
    {error && (detail ? <FlightSearchError run={{ ...detail, error }} /> : <p className="search-error" role="alert">{error}</p>)}
    <details className="transport-filter-details">
      <summary>Search directly with the airline instead</summary>
      <p className="field-hint">These links open airline search pages. Enter your route and dates, then compare the flights below; your selection is not prefilled.</p>
      {links.length ? <ul>{links.map(link => <li key={link.key}><a href={link.url} target="_blank" rel="noopener noreferrer">Search {link.name} ↗</a></li>)}</ul>
        : <p className="field-hint">An official search link is not available for this airline yet. Use its official website with the details below.</p>}
      {[{ label: "Outgoing", source: outbound, segments: result?.outgoingSegments },
        ...(returning ? [{ label: "Return", source: returning, segments: result?.returnSegments }] : [])].map(({ label, source, segments }) => <div key={label}>
        <p><strong>{label}: {source.flight.airline}</strong><br />
          {source.flight.originAirport ?? "Origin"} → {source.flight.destinationAirport ?? "Destination"}<br />
          {source.flight.departure} → {source.flight.arrival}<br />{source.flight.duration} · {source.flight.stops}</p>
        {segments?.length ? <ul>{segments.map((segment, index) => <li key={index}>{segment.flightNumber} · {segment.origin} → {segment.destination} · {segment.departure.replace("T", " ")} → {segment.arrival.replace("T", " ")}</li>)}</ul>
          : <p className="field-hint">Flight numbers are not available here. Check the itinerary details on Google Flights.</p>}
      </div>)}
      <p className="field-hint">Times are local to each airport. The airline may offer a different fare or may not sell this itinerary.</p>
    </details>
  </div>;
}
