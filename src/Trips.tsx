import { useMutation, usePaginatedQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { TripForm } from "./TripForm";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { FlightSearchPanel } from "./FlightSearchPanel";

function errorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "object" && error.data !== null &&
      "message" in error.data && typeof error.data.message === "string") return error.data.message;
  return "Unable to save your changes. Please try again.";
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
        <h1 id="trips-title">My trips</h1></div>
        <button disabled={editor !== null} className="primary-button new-trip-button" onClick={() => setEditor("new")}>
          <span aria-hidden="true">+</span> New Trip
        </button>
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
