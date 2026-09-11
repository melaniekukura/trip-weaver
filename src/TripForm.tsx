import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { DestinationsEditor } from "./DestinationsEditor";
import type { DestinationStop } from "./DestinationsEditor";
import { TransportationTab } from "./TransportationTab";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

const tabs = ["Overview", "Destinations", "Transportation", "Budget", "Interests", "Accessibility"];

export function TripForm({ trip, onClose }: { trip?: Doc<"trips">; onClose: () => void }) {
  const create = useMutation(api.trips.create);
  const update = useMutation(api.trips.update);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [startDate, setStartDate] = useState(trip?.startDate ?? "");
  const [origin, setOrigin] = useState(trip?.origin ?? "");
  const [destinations, setDestinations] = useState<DestinationStop[]>(() =>
    (trip?.destinations ?? []).map((value, index) => ({ id: `saved-${index}`, value })));
  const dialog = useRef<HTMLDialogElement>(null);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const modal = dialog.current;
    const overflow = document.body.style.overflow;
    modal?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      modal?.close();
      document.body.style.overflow = overflow;
      requestAnimationFrame(() => { if (opener?.isConnected) opener.focus(); });
    };
  }, []);

  function tabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabButtons.current[next]?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = event.currentTarget.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(":invalid");
    if (invalid) {
      const panel = invalid.closest<HTMLElement>("[data-tab]");
      flushSync(() => setActive(Number(panel?.dataset.tab ?? 0)));
      invalid.focus();
      invalid.reportValidity();
      return;
    }
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const changes = {
      name: value("name"), origin,
      destinations: destinations.map((stop) => stop.value),
      startDate: value("startDate"), endDate: value("endDate"),
      budget: value("budget") === "" ? null : Number(value("budget")),
      currency: value("currency"), travelers: Number(value("travelers")),
      accessibility: value("accessibility"),
      interests: value("interests").split(",").map((item) => item.trim()).filter(Boolean),
    };
    setPending(true);
    setError("");
    try {
      if (trip) await update({ tripId: trip._id, changes, expectedUpdatedAt: trip.updatedAt });
      else await create(changes);
      onClose();
    } catch (err) { setError(err instanceof ConvexError && typeof err.data === "object" && err.data !== null &&
      "message" in err.data && typeof err.data.message === "string" ? err.data.message : "Unable to save your trip. Please try again."); }
    finally { setPending(false); }
  }

  return (
    <dialog ref={dialog} className="trip-modal" aria-labelledby="editor-title" onCancel={(event) => {
      event.preventDefault();
      if (!pending) onClose();
    }}>
      <header className="trip-modal-header">
        <div>
          <p className="eyebrow">Your next adventure</p>
          <h2 id="editor-title">{trip ? "Edit trip" : "Plan a new trip"}</h2>
        </div>
        <button className="modal-close" type="button" aria-label="Close trip form" disabled={pending} onClick={onClose}>×</button>
      </header>
      <form className="trip-modal-form" noValidate onSubmit={submit}>
        <div className="trip-tabs" role="tablist" aria-label="Trip details">
          {tabs.map((tab, index) => (
            <button key={tab} ref={(element) => { tabButtons.current[index] = element; }}
              type="button" role="tab" id={`trip-tab-${index}`} aria-controls={`trip-panel-${index}`}
              aria-selected={active === index} tabIndex={active === index ? 0 : -1}
              onClick={() => setActive(index)} onKeyDown={(event) => tabKeyDown(event, index)}>{tab}</button>
          ))}
        </div>
        <div className="trip-modal-body trip-form">
          <fieldset disabled={pending}>
            <section className="trip-tab-panel" role="tabpanel" id="trip-panel-0" aria-labelledby="trip-tab-0" data-tab="0" hidden={active !== 0}>
              <h3>The essentials</h3>
              <p className="field-hint">Give your trip a name and set your travel dates.</p>
              <label>Trip name<input name="name" required maxLength={120} defaultValue={trip?.name} placeholder="Autumn in Japan" autoFocus /></label>
              <div className="form-row">
                <label>Start date<input name="startDate" type="date" required min="1900-01-01" max="9999-12-31"
                  value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
                <label>End date<input name="endDate" type="date" required min={startDate || "1900-01-01"} max="9999-12-31" defaultValue={trip?.endDate} /></label>
              </div>
              <label>Travelers<input name="travelers" type="number" min={1} max={100} step={1} required defaultValue={trip?.travelers ?? 1} /></label>
            </section>
            <section className="trip-tab-panel" role="tabpanel" id="trip-panel-1" aria-labelledby="trip-tab-1" data-tab="1" hidden={active !== 1}>
              <h3>Where are you headed?</h3>
              <p className="field-hint">Add your starting point and each destination in travel order.</p>
              <DestinationsEditor origin={origin} stops={destinations} disabled={pending}
                onOriginChange={setOrigin} onStopsChange={setDestinations} />
            </section>
            <section className="trip-tab-panel" role="tabpanel" id="trip-panel-2" aria-labelledby="trip-tab-2" data-tab="2" hidden={active !== 2}>
              <TransportationTab origin={origin} destination={destinations[0]?.value ?? ""}
                departureDate={startDate} onEditDetails={(tab) => setActive(tab)} />
            </section>
            <section className="trip-tab-panel" role="tabpanel" id="trip-panel-3" aria-labelledby="trip-tab-3" data-tab="3" hidden={active !== 3}>
              <h3>Plan your spending</h3>
              <p className="field-hint">Set a total budget for everyone on this trip, or leave it blank for now.</p>
              <div className="form-row">
                <label>Total budget (optional)<input name="budget" type="number" min={0} max={1000000000} step="0.01" defaultValue={trip?.budget ?? ""} /></label>
                <label>Currency<select name="currency" defaultValue={trip?.currency ?? "USD"}>
                  {["USD", "EUR", "GBP", "CAD", "AUD", "JPY"].map((currency) => <option key={currency}>{currency}</option>)}
                </select></label>
              </div>
            </section>
            <section className="trip-tab-panel" role="tabpanel" id="trip-panel-4" aria-labelledby="trip-tab-4" data-tab="4" hidden={active !== 4}>
              <h3>What do you enjoy?</h3>
              <p className="field-hint">Save the things you would like to do and explore.</p>
              <label>Interests (optional) <span className="field-hint">Separate with commas, up to 20 interests</span>
                <textarea name="interests" rows={4} maxLength={1650} defaultValue={trip?.interests.join(", ")} placeholder="Food, museums, hiking" /></label>
            </section>
            <section className="trip-tab-panel" role="tabpanel" id="trip-panel-5" aria-labelledby="trip-tab-5" data-tab="5" hidden={active !== 5}>
              <h3>Travel comfortably</h3>
              <p className="field-hint">Note any access requirements to consider when planning your itinerary.</p>
              <label>Accessibility notes (optional)
                <textarea name="accessibility" rows={5} maxLength={2000} defaultValue={trip?.accessibility ?? ""}
                  placeholder="For example: step-free routes, accessible rooms, or regular rest breaks" /></label>
            </section>
          </fieldset>
        </div>
        <footer className="trip-modal-footer">
          {error && <p className="search-error" role="alert">{error}</p>}
          <div className="modal-footer-actions">
            <button className="secondary-button" type="button" disabled={pending} onClick={onClose}>Cancel</button>
            <div className="button-row">
              {active > 0 && <button className="secondary-button" type="button" onClick={() => setActive(active - 1)}>Back</button>}
              {active < tabs.length - 1 && <button className="secondary-button" type="button" onClick={() => setActive(active + 1)}>Next</button>}
              <button className="primary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save trip"}</button>
            </div>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
