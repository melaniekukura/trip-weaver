import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

export function IdeaItinerary({ favorite, disabled, compact = false }: { compact?: boolean; favorite: Doc<"interestFavorites">; disabled: boolean }) {
  const update = useMutation(api.interestJobs.updateItinerary);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  function edit() {
    setDate(favorite.itinerary?.date ?? ""); setTime(favorite.itinerary?.time ?? "");
    setNotes(favorite.itinerary?.notes ?? ""); setError(""); setEditing(true);
  }
  async function save(remove = false) {
    if (lock.current) return;
    lock.current = true; setPending(true); setError("");
    try {
      await update({ favoriteId: favorite._id, itinerary: remove ? null : {
        ...(date ? { date } : {}), ...(time ? { time } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
      } });
      setEditing(false);
    } catch (failure) {
      const data = failure instanceof ConvexError ? failure.data : null;
      setError(data && typeof data === "object" && "message" in data ? String(data.message) : "Unable to save itinerary details. Please try again.");
    } finally { lock.current = false; setPending(false); }
  }
  return <div className="idea-itinerary">
    {favorite.itinerary && <>
      {!compact && <><p className="itinerary-status">✓ Added to itinerary</p>
      <p>{favorite.itinerary.date ?? "Date not set"}{favorite.itinerary.time ? ` · ${favorite.itinerary.time} (local time)` : ""}</p></>}
      {favorite.itinerary.notes && <p className="itinerary-notes">{favorite.itinerary.notes}</p>}
    </>}
    {editing ? <fieldset disabled={disabled || pending} className="idea-itinerary-fields"
      onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
      <legend>{favorite.itinerary ? "Edit itinerary details" : "Add to itinerary"}</legend>
      <div className="form-row">
        <label>Date (optional)<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        <label>Time (optional)<input type="time" value={time} onChange={event => setTime(event.target.value)} /></label>
      </div>
      <p className="field-hint">Use the destination’s local date and time. You can leave these blank and plan later.</p>
      <label>Notes (optional)<textarea rows={4} maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Booking confirmation number, meeting point, reservation details…" /></label>
      <div className="button-row">
        <button type="button" className="primary-button" onClick={() => void save()}>{pending ? "Saving…" : favorite.itinerary ? "Save details" : "Add to itinerary"}</button>
        <button type="button" className="text-button" onClick={() => { setEditing(false); setError(""); }}>Cancel</button>
      </div>
    </fieldset> : <div className="button-row">
      <button type="button" className="secondary-button" disabled={disabled || pending} onClick={edit}>{favorite.itinerary ? "Edit itinerary details" : "Add to itinerary"}</button>
      {favorite.itinerary && <button type="button" className="text-button" disabled={disabled || pending} onClick={() => void save(true)}>{pending ? "Removing…" : "Remove from itinerary"}</button>}
    </div>}
    {error && <p role="alert" className="search-error">{error}</p>}
  </div>;
}
