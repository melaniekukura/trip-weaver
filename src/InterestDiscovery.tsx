import { LocationPicker } from "./LocationPicker";
import { IdeaItinerary } from "./IdeaItinerary";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useId, useRef, useState } from "react";
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
  const [otherCity, setOtherCity] = useState("");
  const exploringOtherCity = choice === "__other" || !uniqueDestinations.length;
  const destination = exploringOtherCity ? otherCity : uniqueDestinations.includes(choice) ? choice : uniqueDestinations[0] ?? "";
  const [interestChoice, setInterestChoice] = useState("");
  const interest = interests.includes(interestChoice) ? interestChoice : interests[0] ?? "";
  const [runId, setRunId] = useState<Id<"interestRuns">>();
  const [resultsVisible, setResultsVisible] = useState(true);
  const resultsId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const savedTrip = useQuery(api.trips.get, tripId ? { tripId } : "skip");
  const canQuery = tripId && destination && savedTrip && interest && savedTrip.interests.includes(interest);
  const run = useQuery(api.interestJobs.latest, canQuery ? { tripId, destination, kind: "both", interest, runId } : "skip");
  const favorites = useQuery(api.interestJobs.favorites, tripId ? { tripId } : "skip");
  const savedIdeas = favorites?.filter(favorite => !favorite.itinerary) ?? [];
  const itineraryIdeas = favorites?.filter(favorite => favorite.itinerary).sort((a, b) =>
    `${a.itinerary?.date || "9999-12-31"}T${a.itinerary?.time || "23:59"}`.localeCompare(`${b.itinerary?.date || "9999-12-31"}T${b.itinerary?.time || "23:59"}`)) ?? [];
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
      setResultsVisible(true);
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
  const cityLabel = (value: string) => value.split(" — ")[0].replace(/\s*\([^)]*\)$/, "");
  const renderDetails = (item: Doc<"interestRuns">["results"][number]) => <>
    {item.description && <p>{item.description}</p>}
    {item.venue && <p>Location: {item.venue}</p>}
    {item.dates && <p>Source-listed dates: {item.dates}</p>}
    {item.kind === "events" && !item.dates && <p className="field-hint">Event lead · Check dates with the organizer.</p>}
    {item.price && <p>Source-listed price: {item.price}</p>}
  </>;
  const renderIdea = (item: Doc<"interestRuns">["results"][number], compact = false, fullDetails = false) => <>
    {compact && <span className="field-hint">{cityLabel(item.destination)}</span>}
    <h4><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title} ↗</a></h4>
    {!compact && <>
      {fullDetails ? renderDetails(item) : <>
        {item.description && <p className="idea-blurb">{item.description}</p>}
        <details className="idea-source-details"><summary>Details</summary>{renderDetails(item)}</details>
      </>}
      <p className="idea-source field-hint">{new URL(item.url).hostname.replace(/^www\./, "")}</p>
    </>}
  </>;
  return <section className="interest-discovery" aria-label="Discover activities and events">
    <section className="interest-explore-section" aria-label="Find things to do">
    <h3>Find things to do</h3>
    <div className="interest-search-row">
      {exploringOtherCity ? <div className="interest-city-field">
        <LocationPicker citiesOnly label="City to explore" value={otherCity} disabled={pending}
          onSelect={value => { setOtherCity(value); setRunId(undefined); setError(""); setNotice(""); }}
          onClear={() => { setOtherCity(""); setRunId(undefined); setNotice(""); }} />
      </div> : <label><span className="interest-sr-only">Explore destination</span><select value={destination} disabled={pending}
        onChange={event => { setChoice(event.target.value); setRunId(undefined); setError(""); setNotice(""); }}>
        {uniqueDestinations.map(value => <option key={value} value={value}>{cityLabel(value)}</option>)}
        <option value="__other">Search another city…</option>
      </select></label>}
      <label><span className="interest-sr-only">Find interest</span><select value={interest} disabled={pending || !interests.length} onChange={event => { setInterestChoice(event.target.value); setRunId(undefined); setError(""); setNotice(""); }}>
        {!interests.length && <option value="">Add an interest above</option>}
        {interests.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <button type="button" className="primary-button" disabled={busy || !destination || !interest} onClick={() => void search()}>{busy ? "Searching…" : "Find things to do"}</button>
    </div>
    <div className="interest-search-meta">
      <p className="field-hint">Uses your trip dates. Confirm details on the source site before booking.</p>
      <div className="button-row">
        {exploringOtherCity && !!uniqueDestinations.length && <button type="button" className="text-button" disabled={pending} onClick={() => { setChoice(uniqueDestinations[0]); setRunId(undefined); setNotice(""); }}>Use a trip city</button>}
        {run && !busy && <button type="button" className="text-button" title="Matching searches are reused for six hours. Refresh requests new results." onClick={() => void search(true)}>Refresh results</button>}
      </div>
    </div>
    {notice && <p role="status">{notice}</p>}
    {error && <p className="search-error" role="alert">{error}</p>}
    {(run?.status === "pending" || run?.status === "running") && <p role="status">Finding specific activities and events in {destination} and reading their detail pages…</p>}
    {run?.status === "failed" && <p className="search-error" role="alert">{run.error}</p>}
    {run?.status === "completed" && <>
      <button type="button" className="secondary-button interest-results-toggle" aria-expanded={resultsVisible} aria-controls={resultsId}
        onClick={() => setResultsVisible(visible => !visible)}><span aria-hidden="true">{resultsVisible ? "▴" : "▾"}</span>{resultsVisible ? "Hide results" : `Show results (${run.results.length})`}</button>
      <div id={resultsId} hidden={!resultsVisible}>
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
      </div>
    </>}
    </section>
    <section className="interest-saved-section" aria-label="Saved ideas">
    <div className="interest-section-heading"><h3>Saved ideas</h3></div>
    {!savedIdeas.length && <p>No ideas in your shortlist. Ideas added to your itinerary appear below.</p>}
    <ul className="interest-results saved-idea-grid">{savedIdeas.map(favorite => <li key={favorite._id} className="interest-result is-saved">
      {renderIdea(favorite.item, true)}
      <IdeaItinerary favorite={favorite} disabled={pending} />
      <button type="button" className="text-button saved-idea-remove" aria-label={`Remove saved idea: ${favorite.item.title}`} disabled={pending} onClick={() => void changeFavorite(() => remove({ favoriteId: favorite._id }))}>×</button>
    </li>)}</ul>
    </section>
    <section className="ideas-itinerary" aria-label="Activity itinerary">
      <div className="interest-section-heading"><h3>Itinerary</h3></div>
      {!itineraryIdeas.length && <p>Add a saved idea to your itinerary to see it here.</p>}
      <ul className="itinerary-list">{itineraryIdeas.map(favorite => <li key={favorite._id}>
        <details className="itinerary-activity">
          <summary>
            <span className="itinerary-summary-content"><strong>{favorite.item.title}</strong>
            <span className="itinerary-activity-meta">{cityLabel(favorite.item.destination)} · {favorite.itinerary?.date || "Date not set"}{favorite.itinerary?.time ? ` · ${favorite.itinerary.time} (local time)` : ""}</span>
            </span><span className="itinerary-show">▾ Show</span><span className="itinerary-hide">▴ Hide</span>
          </summary>
          <div className="itinerary-activity-body">
            <IdeaItinerary compact favorite={favorite} disabled={pending} />
            <details className="idea-source-details"><summary>Activity details</summary>{renderIdea(favorite.item, false, true)}</details>
          </div>
        </details>
      </li>)}</ul>
    </section>
  </section>;
}
