import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { getFirecrawlSessionId } from "./firecrawlSession";
import { transportLocationLabel } from "./transportationLegs";

type DocumentRun = Doc<"requiredDocumentRuns">;
const startSearch = makeFunctionReference<"mutation", {
  tripId: Id<"trips">; destination: string; refresh?: boolean; sessionId?: string;
}, { runId: Id<"requiredDocumentRuns">; reused: boolean }>("requiredDocumentJobs:start");
const latestSearch = makeFunctionReference<"query", {
  tripId: Id<"trips">; destination: string; runId?: Id<"requiredDocumentRuns">;
}, DocumentRun | null>("requiredDocumentJobs:latest");

const typeLabels: Record<DocumentRun["results"][number]["type"], string> = {
  passport: "Passport",
  visa: "Visa",
  "travel-authorization": "Travel authorization",
  health: "Health document",
  "arrival-form": "Arrival form",
  "entry-requirements": "Entry requirements",
};

function errorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "object" && error.data !== null &&
      "message" in error.data && typeof error.data.message === "string") return error.data.message;
  return "Unable to complete this request. Please try again.";
}

export function RequiredDocumentsTab({ tripId, origin, destinations, onSaveTrip }: {
  tripId: Id<"trips">;
  origin: string;
  destinations: string[];
  onSaveTrip: () => Promise<Id<"trips"> | null>;
}) {
  const start = useMutation(startSearch);
  const [destination, setDestination] = useState(destinations[0] ?? "");
  const [runId, setRunId] = useState<Id<"requiredDocumentRuns">>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const run = useQuery(latestSearch, destination ? { tripId, destination, runId } : "skip");
  const busy = pending || run?.status === "pending" || run?.status === "running";

  useEffect(() => {
    if (!destinations.includes(destination)) {
      setDestination(destinations[0] ?? ""); setRunId(undefined); setError(""); setNotice("");
    }
  }, [destination, destinations]);

  async function search(refresh = false) {
    if (busy || !destination) return;
    setPending(true); setError(""); setNotice("");
    try {
      if (!await onSaveTrip()) return;
      const result = await start({ tripId, destination, refresh, sessionId: getFirecrawlSessionId() });
      setRunId(result.runId);
      if (result.reused) setNotice("Using a matching recent search.");
    } catch (searchError) { setError(errorMessage(searchError)); }
    finally { setPending(false); }
  }

  return <section className="required-documents" aria-labelledby="required-documents-title">
    <div className="required-documents-heading">
      <div><h3 id="required-documents-title">Required Documents</h3>
        <p className="field-hint">Find entry documents for this route from current government and official sources.</p></div>
    </div>
    <div className="required-documents-search">
      <div className="required-documents-route">
        <span><small>Departing from</small>{transportLocationLabel(origin)}</span><span aria-hidden="true">→</span>
        <label>Destination<select value={destination} disabled={busy} onChange={event => {
          setDestination(event.target.value); setRunId(undefined); setError(""); setNotice("");
        }}>{destinations.map(value => <option key={value} value={value}>{transportLocationLabel(value)}</option>)}</select></label>
      </div>
      <div className="required-documents-actions">
        <button className="primary-button" type="button" disabled={busy || !destination}
          onClick={() => void search()}>{busy ? "Searching…" : "Search required documents"}</button>
        {run && !busy && <button className="text-button" type="button" onClick={() => void search(true)}>Refresh results</button>}
      </div>
    </div>
    <p className="required-documents-caution">Requirements vary by citizenship, passport, transit points, and reason for travel. Confirm every requirement with the linked authority before departure.</p>
    {notice && <p role="status">{notice}</p>}
    {error && <p className="search-error" role="alert">{error}</p>}
    {(run?.status === "pending" || run?.status === "running") && <p role="status">Checking official document sources…</p>}
    {run?.status === "failed" && <p className="search-error" role="alert">{run.error}</p>}
    {run?.status === "completed" && <>
      {run.warning && <p className="field-hint" role="status">{run.warning}</p>}
      {!run.results.length && <p>No document sources were found. Check the destination government or embassy website directly.</p>}
      {!!run.results.length && <ul className="required-document-results">{run.results.map(result => <li key={result.url}>
        <span className="required-document-type">{typeLabels[result.type]}</span>
        <h4><a href={result.url} target="_blank" rel="noopener noreferrer">{result.title} ↗</a></h4>
        {result.description && <p>{result.description}</p>}
        <small>{new URL(result.url).hostname.replace(/^www\./, "")}</small>
      </li>)}</ul>}
    </>}
  </section>;
}
