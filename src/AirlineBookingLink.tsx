import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { FlightSearchError } from "./FlightSearchError";
import { sanitizeFlightDiagnostic } from "../convex/flightDiagnostics";
import type { FlightDiagnostic } from "../convex/flightDiagnostics";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export function AirlineBookingLink({ tripId, outboundId, returnId, needsReturn = false }: {
  tripId: Id<"trips">; outboundId: Id<"researchSources">; returnId?: Id<"researchSources">; needsReturn?: boolean;
}) {
  const resolve = useAction(api.bookingLinks.resolve);
  const [result, setResult] = useState<{ url: string; provider: string; amount: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<{ _id: string; diagnostic: FlightDiagnostic } | null>(null);
  const lock = useRef(false);
  async function load() {
    if (lock.current) return;
    lock.current = true; setPending(true); setError(""); setResult(null); setDetail(null);
    try { setResult(await resolve({ tripId, outboundId, returnId })); }
    catch (error) {
      const data = error instanceof ConvexError ? error.data : null;
      if (data && typeof data === "object" && "diagnostic" in data) setDetail({ _id: "reference" in data ? String(data.reference) : "unavailable", diagnostic: sanitizeFlightDiagnostic(data.diagnostic, "browser_result") });
      setError(data && typeof data === "object" && "message" in data ? String(data.message) : "Unable to retrieve the airline booking link. Please try again.");
    } finally { lock.current = false; setPending(false); }
  }
  if (needsReturn && !returnId) return <p className="field-hint">Select a return flight to get the airline booking link for both flights.</p>;
  return <div className="airline-booking-link">
    {result && <>
      <a className="primary-button" href={result.url} target="_blank" rel="noopener noreferrer">Book with {result.provider} ↗</a>
      <p className="field-hint">Airline’s observed total: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(result.amount)}.
        Confirm the itinerary and fare on the airline’s website. Links and prices can expire.</p>
    </>}
    <button type="button" className={result ? "text-button" : "primary-button"} disabled={pending} onClick={() => void load()}>
      {pending ? "Finding airline booking link…" : result ? "Refresh airline link" : "Get airline booking link"}</button>
    {!result && <p className="field-hint">Finds the airline’s booking link for your selected itinerary. Uses a browser search.</p>}
    {error && (detail ? <FlightSearchError run={{ ...detail, error }} /> : <p className="search-error" role="alert">{error}</p>)}
  </div>;
}
