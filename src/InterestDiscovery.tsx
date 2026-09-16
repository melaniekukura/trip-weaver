import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";

function errorMessage(error: unknown) {
  const data = error instanceof ConvexError ? error.data : null;
  return data && typeof data === "object" && "message" in data ? String(data.message) : "Unable to complete this request. Please try again.";
}

export function InterestDiscovery({ tripId, destinations, interests, onSaveTrip }: {
  tripId?: Id<"trips">; destinations: string[]; interests: string[]; onSaveTrip: () => Promise<Id<"trips"> | null>;
}) {
  const uniqueDestinations = [...new Set(destinations.filter(Boolean))];
  const [choice, setChoice] = useState("");
  const destination = uniqueDestinations.includes(choice) ? choice : uniqueDestinations[0] ?? "";
  const [interestChoice, setInterestChoice] = useState("");
  const interest = interests.includes(interestChoice) ? interestChoice : interests[0] ?? "";
  const [runId, setRunId] = useState<Id<"interestRuns">>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const savedTrip = useQuery(api.trips.get, tripId ? { tripId } : "skip");
  const canQuery = tripId && destination && savedTrip?.destinations.includes(destination) && interest && savedTrip.interests.includes(interest);
  const run = useQuery(api.interestJobs.latest, canQuery ? { tripId, destination, kind: "both", interest, runId } : "skip");
  const favorites = useQuery(api.interestJobs.favorites, tripId ? { tripId } : "skip");
  const start = useMutation(api.interestJobs.start);
  const save = useMutation(api.interestJobs.save);
  const remove = useMutation(api.interestJobs.removeFavorite);
  const busy = pending || run?.status === "pending" || run?.status === "running";
  async function search(refresh = false) {
    if (lock.current) return;
    lock.current = true; setPending(true); setError(""); setNotice("");
    try {
      const id = await onSaveTrip();
      if (!id) return;
      const result = await start({ tripId: id, destination, kind: "both", interest, refresh });
      setRunId(result.runId);
      setNotice(result.reused ? "Using a matching recent search." : "");
    } catch (error) { setError(errorMessage(error)); }
    finally { lock.current = false; setPending(false); }
  }
  async function changeFavorite(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setPending(true); setError("");
    try { await action(); } catch (error) { setError(errorMessage(error)); }
    finally { lock.current = false; setPending(false); }
  }
  const renderIdea = (item: Doc<"interestRuns">["results"][number]) => <>
    <span className="field-hint">{item.kind === "events" ? (item.detailed ? "Event details" : "Event lead") : "Activity idea"} · {item.destination}</span>
    <h4><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title} ↗</a></h4>
    {item.interest && <p className="field-hint">Interest: {item.interest}</p>}
    {item.description && <p>{item.description}</p>}
    {item.venue && <p><strong>Location:</strong> {item.venue}</p>}
    {item.dates && <p><strong>Source-listed dates:</strong> {item.dates}</p>}
    {item.kind === "events" && !item.dates && <p className="field-hint">Dates not stated clearly; check with the organizer.</p>}
    {item.price && <p><strong>Source-listed price:</strong> {item.price}</p>}
    {item.detailed && <p className="field-hint">Details read from the linked page. Confirm current dates, prices, and availability before booking.</p>}
    <p className="field-hint">{new URL(item.url).hostname} · Found {new Date(item.retrievedAt).toLocaleDateString()}</p>
  </>;
  return <section className="interest-discovery" aria-label="Discover activities and events">
    <h3>Discover activities and events</h3>
    <p>Find specific places, experiences, and events using your destinations, travel dates, and interests above. Search saves your current trip details first.</p>
    <div className="form-row">
      <label>Explore destination<select value={destination} disabled={pending || !uniqueDestinations.length}
        onChange={event => { setChoice(event.target.value); setRunId(undefined); setError(""); setNotice(""); }}>
        {!uniqueDestinations.length && <option value="">Add a destination first</option>}
        {uniqueDestinations.map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label>Find<select value={interest} disabled={pending || !interests.length} onChange={event => { setInterestChoice(event.target.value); setRunId(undefined); setError(""); setNotice(""); }}>
        {!interests.length && <option value="">Add an interest above</option>}
        {interests.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
    </div>
    <div className="button-row">
      <button type="button" className="primary-button" disabled={busy || !destination || !interest} onClick={() => void search()}>{busy ? "Searching…" : "Find things to do"}</button>
      {run && !busy && <button type="button" className="text-button" onClick={() => void search(true)}>Refresh results</button>}
    </div>
    <p className="field-hint">Search uses your selected interest, with results spread across sources. Matching searches are reused for six hours. Event searches use your full trip dates; verify event dates, opening hours, prices, and availability on the source site.</p>
    {notice && <p role="status">{notice}</p>}
    {error && <p className="search-error" role="alert">{error}</p>}
    {(run?.status === "pending" || run?.status === "running") && <p role="status">Finding specific activities and events in {destination} and reading their detail pages…</p>}
    {run?.status === "failed" && <p className="search-error" role="alert">{run.error}</p>}
    {run?.status === "completed" && <>
      <p className="field-hint">Searched for {run.startDate} – {run.endDate} · {run.interests.join(", ") || "General recommendations"}. Search again after changing your dates or interests.</p>
      {run.warnings.map(warning => <p role="status" key={warning}>{warning}</p>)}
      {!run.results.length && <p>No results found. Try broader interests or another destination.</p>}
      <ul className="interest-results">{run.results.map((item, index) => {
        const saved = favorites?.some(favorite => favorite.item.url === item.url);
        return <li key={`${item.kind}:${item.url}`} className={`interest-result${saved ? " is-saved" : ""}`}>
          {renderIdea(item)}
          <button type="button" className="secondary-button" disabled={pending || saved || !favorites} onClick={() => void changeFavorite(() => save({ runId: run._id, index }))}>{saved ? "Saved ✓" : "Save idea"}</button>
        </li>;
      })}</ul>
    </>}
    <h3>Saved ideas {favorites?.length ? `(${favorites.length})` : ""}</h3>
    <p className="field-hint">Keep a shortlist for your trip. Saving an idea does not make a reservation.</p>
    {!favorites?.length && <p>No saved ideas yet.</p>}
    <ul className="interest-results">{favorites?.map(favorite => <li key={favorite._id} className="interest-result is-saved">
      {renderIdea(favorite.item)}
      <button type="button" className="text-button" disabled={pending} onClick={() => void changeFavorite(() => remove({ favoriteId: favorite._id }))}>Remove saved idea</button>
    </li>)}</ul>
  </section>;
}
