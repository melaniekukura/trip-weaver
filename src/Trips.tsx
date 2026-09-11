import { useMutation, usePaginatedQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { FlightSearchPanel } from "./FlightSearchPanel";

function errorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "object" && error.data !== null &&
      "message" in error.data && typeof error.data.message === "string") return error.data.message;
  return "Unable to save your changes. Please try again.";
}

function TripForm({ trip, onClose }: { trip?: Doc<"trips">; onClose: () => void }) {
  const create = useMutation(api.trips.create);
  const update = useMutation(api.trips.update);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState(trip?.startDate ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const changes = {
      name: value("name"), origin: value("origin"),
      destinations: value("destinations").split("\n").map((item) => item.trim()).filter(Boolean),
      startDate: value("startDate"), endDate: value("endDate"),
      budget: value("budget") === "" ? null : Number(value("budget")),
      currency: value("currency"), travelers: Number(value("travelers")),
      interests: value("interests").split(",").map((item) => item.trim()).filter(Boolean),
    };
    setPending(true);
    setError("");
    try {
      if (trip) await update({ tripId: trip._id, changes, expectedUpdatedAt: trip.updatedAt });
      else await create(changes);
      onClose();
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }

  return (
    <section className="trip-editor" aria-labelledby="editor-title">
      <h3 id="editor-title">{trip ? "Edit trip" : "Plan a new trip"}</h3>
      <form className="trip-form" onSubmit={submit}>
        <fieldset disabled={pending}>
          <label>Trip name<input name="name" required maxLength={120} defaultValue={trip?.name} placeholder="Autumn in Japan" /></label>
          <label>Leaving from<input name="origin" required maxLength={120} defaultValue={trip?.origin} placeholder="Detroit, MI" /></label>
          <label>Destinations <span className="field-hint">One per line, in travel order</span>
            <textarea name="destinations" required rows={3} maxLength={2500} defaultValue={trip?.destinations.join("\n")} placeholder={"Kyoto\nOsaka"} /></label>
          <div className="form-row">
            <label>Start date<input name="startDate" type="date" required min="1900-01-01" max="9999-12-31"
              value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label>End date<input name="endDate" type="date" required min={startDate || "1900-01-01"} max="9999-12-31" defaultValue={trip?.endDate} /></label>
          </div>
          <div className="form-row">
            <label>Total budget (optional)<input name="budget" type="number" min={0} max={1000000000} step="0.01" defaultValue={trip?.budget ?? ""} /></label>
            <label>Currency<select name="currency" defaultValue={trip?.currency ?? "USD"}>
              {["USD", "EUR", "GBP", "CAD", "AUD", "JPY"].map((currency) => <option key={currency}>{currency}</option>)}
            </select></label>
            <label>Travelers<input name="travelers" type="number" min={1} max={100} step={1} required defaultValue={trip?.travelers ?? 1} /></label>
          </div>
          <label>Interests <span className="field-hint">Separate with commas</span>
            <input name="interests" maxLength={1650} defaultValue={trip?.interests.join(", ")} placeholder="Food, museums, hiking" /></label>
        </fieldset>
        {error && <p className="search-error" role="alert">{error}</p>}
        <div className="button-row">
          <button className="primary-button" disabled={pending}>{pending ? "Saving…" : "Save trip"}</button>
          <button className="secondary-button" type="button" disabled={pending} onClick={onClose}>Cancel</button>
        </div>
      </form>
    </section>
  );
}

export function Trips() {
  const { results, status, loadMore } = usePaginatedQuery(api.trips.list, {}, { initialNumItems: 12 });
  const remove = useMutation(api.trips.remove);
  const [editor, setEditor] = useState<Doc<"trips"> | "new" | null>(null);
  const [flightTripId, setFlightTripId] = useState<Id<"trips"> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Id<"trips"> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deleteTrip(tripId: Id<"trips">) {
    setDeleting(true); setError("");
    try { await remove({ tripId }); setConfirmDelete(null); }
    catch (err) { setError(errorMessage(err)); }
    finally { setDeleting(false); }
  }

  return (
    <section className="trips-section" id="my-trips" aria-labelledby="trips-title">
      <div className="trips-heading"><div><p className="eyebrow">Made for your next adventure</p>
        <h2 id="trips-title">My trips</h2></div>
        {!editor && <button className="primary-button" onClick={() => setEditor("new")}>New trip</button>}
      </div>
      {editor && <TripForm key={editor === "new" ? "new" : editor._id}
        trip={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} />}
      {error && <p className="search-error" role="alert">{error}</p>}
      {status === "LoadingFirstPage" ? <p role="status">Loading your trips…</p> :
        results.length === 0 ? <p className="empty-state">Your next trip starts here. Add your destinations and dates to save a plan.</p> : null}
      <div className="trip-grid">
        {results.map((trip) => (
          <article className="saved-trip" key={trip._id}>
            <span className="result-label">{trip.origin}</span><h3>{trip.name}</h3>
            <p>{trip.destinations.join(" → ")}</p>
            <p><time dateTime={trip.startDate}>{trip.startDate}</time> – <time dateTime={trip.endDate}>{trip.endDate}</time></p>
            <p>{trip.travelers} {trip.travelers === 1 ? "traveler" : "travelers"}
              {trip.budget !== null && ` · ${new Intl.NumberFormat("en-US", { style: "currency", currency: trip.currency }).format(trip.budget)} total budget`}</p>
            {trip.interests.length > 0 && <p className="field-hint">{trip.interests.join(" · ")}</p>}
            {confirmDelete === trip._id ? <div className="delete-confirmation">
              <p>Delete “{trip.name}”? This cannot be undone.</p>
              <div className="button-row"><button className="danger-button" disabled={deleting} onClick={() => void deleteTrip(trip._id)}>{deleting ? "Deleting…" : "Delete trip"}</button>
                <button className="secondary-button" disabled={deleting} onClick={() => setConfirmDelete(null)}>Keep trip</button></div>
            </div> : <div className="button-row">
              <button className="secondary-button" disabled={editor !== null} onClick={() => setEditor(trip)}>Edit</button>
              <button className="text-button" disabled={editor !== null || deleting} onClick={() => { setConfirmDelete(trip._id); setError(""); }}>Delete</button>
            </div>}
            <button className="text-button" aria-expanded={flightTripId === trip._id}
              onClick={() => setFlightTripId(flightTripId === trip._id ? null : trip._id)}>
              {flightTripId === trip._id ? "Close flight search" : "Find flights"}
            </button>
            {flightTripId === trip._id && <FlightSearchPanel key={trip._id} trip={trip} />}
          </article>
        ))}
      </div>
      {(status === "CanLoadMore" || status === "LoadingMore") &&
        <button className="secondary-button load-more" disabled={status === "LoadingMore"} onClick={() => loadMore(12)}>
          {status === "LoadingMore" ? "Loading…" : "Load more trips"}</button>}
    </section>
  );
}
