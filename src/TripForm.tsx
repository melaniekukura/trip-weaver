import { tripCreationReady } from "./tripCreation";
import { useDefaultOrigin } from "./profileDefaults";
import { useConvex, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { DestinationsEditor } from "./DestinationsEditor";
import type { DestinationStop } from "./DestinationsEditor";
import { tripPreferences } from "./tripPreferences";
import { tripPlannerPath } from "./tripRoutes";
import { HomeJourneyPrompt } from "./HomeJourneyPrompt";
import { homeJourneyStatus } from "../convex/homeJourney";
import { flightPlanItinerary } from "../convex/flightPlanFields";
import { CityStaySummary } from "./CityStaySummary";
import { InterestsEditor } from "./InterestsEditor";
import { InterestDiscovery } from "./InterestDiscovery";
import { TransportationTab } from "./TransportationTab";
import { AccessibilityTab } from "./AccessibilityTab";
import { TripItinerary } from "./TripItinerary";
import { TripAssistant } from "./TripAssistant";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";

const planningTabs = ["Overview", "Transportation", "Interests", "Accessibility", "Itinerary"];
const setupTabs = ["Overview", "Destinations", "Create my trip"];

type InitialTrip = { origin: string; destinations: string[]; startDate: string };

export function TripForm({ trip, initialValues, onClose, mode = "modal" }: {
  trip?: Doc<"trips">; initialValues?: InitialTrip; onClose: () => void; mode?: "modal" | "page";
}) {
  const planning = mode === "page";
  const tabs = planning ? planningTabs : setupTabs;
  const [accessibility, setAccessibility] = useState(trip?.accessibility ?? "");
  const [notice, setNotice] = useState("");
  const convex = useConvex();
  const [savedTrip, setSavedTrip] = useState(trip);
  const createdId = useRef<Id<"trips"> | null>(null);
  const saveLock = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const create = useMutation(api.trips.create);
  const update = useMutation(api.trips.update);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [name, setName] = useState(trip?.name ?? "");
  const [travelers, setTravelers] = useState(String(trip?.travelers ?? 1));
  const [startDate, setStartDate] = useState(trip?.startDate ?? initialValues?.startDate ?? "");
  const [interests, setInterests] = useState(trip?.interests ?? []);
  const [endDate, setEndDate] = useState(trip?.endDate ?? "");
  const [origin, setOrigin] = useDefaultOrigin(trip?.origin ?? initialValues?.origin);
  const [destinations, setDestinations] = useState<DestinationStop[]>(() =>
    (trip?.destinations ?? initialValues?.destinations ?? []).map((value, index) => ({ id: `saved-${index}`, value })));
  const [homeReturnNotNeededFor, setHomeReturnNotNeededFor] = useState(trip?.homeReturnNotNeededFor ?? "");
  const liveTrip = useQuery(api.trips.get, savedTrip ? { tripId: savedTrip._id } : "skip");
  const homeRoute = { origin, destinations: destinations.map(stop => stop.value), startDate, endDate, homeReturnNotNeededFor };
  const [roundTripRoute, setRoundTripRoute] = useState("");
  const routeKey = JSON.stringify([origin, destinations]);
  const onRoundTripChange = useCallback((roundTrip: boolean) => {
    setRoundTripRoute(roundTrip ? routeKey : "");
  }, [routeKey]);
  const homeStatus = destinations.length === 1 && roundTripRoute === routeKey
    ? "covered" : homeJourneyStatus(homeRoute, liveTrip?.flightPlan?.legs);
  const dialog = useRef<HTMLDialogElement>(null);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (planning) return;
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
  }, [planning]);

  useEffect(() => {
    if (planning && savedTrip) document.title = `${savedTrip.name} | Trip-Weaver`;
  }, [planning, savedTrip]);

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

  async function saveTrip(homeChange?: { stops: DestinationStop[]; waiver: string }): Promise<Id<"trips"> | null> {
    if (saveLock.current || !form.current) return null;
    const invalid = form.current.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(":invalid");
    if (invalid) {
      const panel = invalid.closest<HTMLElement>("[data-tab]");
      flushSync(() => setActive(Number(panel?.dataset.tab ?? 0)));
      invalid.focus();
      invalid.reportValidity();
      return null;
    }
    const data = new FormData(form.current);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const changes = {
      name: value("name"), origin,
      destinations: (homeChange?.stops ?? destinations).map((stop) => stop.value),
      homeReturnNotNeededFor: homeChange?.waiver ?? homeReturnNotNeededFor,
      startDate: value("startDate"), endDate: value("endDate"),
      travelers: Number(value("travelers")),
      ...tripPreferences(data, savedTrip, planning),
    };
    saveLock.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      let existing = savedTrip;
      if (!existing && createdId.current) existing = await convex.query(api.trips.get, { tripId: createdId.current });
      const tripId = existing?._id ?? await create(changes);
      if (!existing) createdId.current = tripId;
      else await update({ tripId, changes, expectedUpdatedAt: existing.updatedAt });
      const persisted = await convex.query(api.trips.get, { tripId });
      setSavedTrip(persisted);
      if (planning) setNotice("Trip changes saved.");
      return tripId;
    } catch (err) {
      setError(err instanceof ConvexError && typeof err.data === "object" && err.data !== null &&
        "message" in err.data && typeof err.data.message === "string" ? err.data.message : "Unable to save your trip. Please try again.");
      return null;
    } finally { saveLock.current = false; setPending(false); }
  }

  async function chooseHome(action: "add" | "not-needed" | "reset") {
    if (pending || (action === "add" && destinations.length >= 20)) return;
    const stops = action === "add" ? [...destinations, { id: crypto.randomUUID(), value: origin }] : destinations;
    const waiver = action === "not-needed" ? flightPlanItinerary(homeRoute) : "";
    if (savedTrip && !await saveTrip({ stops, waiver })) return;
    setDestinations(stops); setHomeReturnNotNeededFor(waiver);
  }
  async function removeTransportationLeg(index: number) {
    if (pending || destinations.length <= 1 || index < 0 || index >= destinations.length) return;
    const stops = destinations.filter((_, position) => position !== index);
    if (savedTrip && !await saveTrip({ stops, waiver: "" })) return;
    setDestinations(stops); setHomeReturnNotNeededFor("");
  }
  const homePrompt = <HomeJourneyPrompt origin={origin} destination={destinations.at(-1)?.value ?? ""} status={homeStatus}
    disabled={pending} full={destinations.length >= 20} onAdd={() => void chooseHome("add")}
    onNotNeeded={() => void chooseHome("not-needed")} onReset={() => void chooseHome("reset")} />;

  const creationReady = tripCreationReady({ name, origin, destinations: destinations.map(stop => stop.value),
    startDate, endDate, travelers: Number(travelers) });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!savedTrip && !creationReady) return;
    const tripId = await saveTrip();
    if (!tripId || planning) return;
    if (active === 2) window.location.hash = tripPlannerPath(tripId);
    onClose();
  }

  const destinationFields = <>
    <h3>Where are you headed?</h3>
    <DestinationsEditor origin={origin} stops={destinations} disabled={pending}
      onOriginChange={setOrigin} onStopsChange={setDestinations} homePrompt={homePrompt} />
  </>;

  const content = (
    <>
      <header className="trip-modal-header">
        <div>
          <p className="eyebrow">{planning ? "Your trip planner" : "Your next adventure"}</p>
          <h2 id="editor-title">{planning ? savedTrip?.name : savedTrip ? "Edit trip" : "Plan a new trip"}</h2>
        </div>
        {!planning && <button className="modal-close" type="button" aria-label="Close trip form" disabled={pending} onClick={onClose}>×</button>}
      </header>
      <form ref={form} className="trip-modal-form" noValidate onSubmit={submit}>
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
              <label>Trip name<input name="name" required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Autumn in Japan" autoFocus={!planning} /></label>
              <div className="form-row">
                <label>Start date<input name="startDate" type="date" required min="1900-01-01" max="9999-12-31"
                  value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
                <label>End date<input name="endDate" type="date" required min={startDate || "1900-01-01"} max="9999-12-31"
                  value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
              </div>
              <label>Travelers<input name="travelers" type="number" min={1} max={100} step={1} required value={travelers} onChange={event => setTravelers(event.target.value)} /></label>
              {planning && destinationFields}
            </section>
            {!planning && <section className="trip-tab-panel" role="tabpanel" id="trip-panel-1" aria-labelledby="trip-tab-1" data-tab="1" hidden={active !== 1}>
              {destinationFields}
            </section>}
            {!planning && <section className="trip-tab-panel create-trip-panel" role="tabpanel" id="trip-panel-2" aria-labelledby="trip-tab-2" data-tab="2" hidden={active !== 2}>
              <h3>Ready to plan your trip?</h3>
            </section>}
            {planning && <>
              <section className="trip-tab-panel" role="tabpanel" id="trip-panel-1" aria-labelledby="trip-tab-1" data-tab="1" hidden={active !== 1}>
                <TransportationTab accessibility={accessibility} onRoundTripChange={onRoundTripChange} onRemoveLeg={removeTransportationLeg} routePending={pending} homePrompt={homePrompt} homeReturnNotNeededFor={homeReturnNotNeededFor} tripId={savedTrip?._id} origin={origin} destinations={destinations}
                  departureDate={startDate} returnDate={endDate} onReturnDateChange={setEndDate} onSaveTrip={saveTrip} onEditDetails={() => { setActive(0); tabButtons.current[0]?.focus(); }} />
              </section>
              <section className="trip-tab-panel" role="tabpanel" id="trip-panel-2" aria-labelledby="trip-tab-2" data-tab="2" hidden={active !== 2}>
                <h3>Interests &amp; activities</h3>
                <div className="interests-planning-context">
                <CityStaySummary route={homeRoute} plan={liveTrip?.flightPlan} onOpenTransportation={() => { setActive(1); tabButtons.current[1]?.focus(); }} />
                <InterestsEditor interests={interests} onChange={setInterests} />
                </div>
                <InterestDiscovery accessibility={accessibility} tripId={savedTrip?._id} interests={interests} destinations={destinations.map(stop => stop.value)} onSaveTrip={saveTrip} />
              </section>
              <section className="trip-tab-panel" role="tabpanel" id="trip-panel-3" aria-labelledby="trip-tab-3" data-tab="3" hidden={active !== 3}>
                <AccessibilityTab initialValue={trip?.accessibility} onChange={setAccessibility} />
              </section>
              <section className="trip-tab-panel" role="tabpanel" id="trip-panel-4" aria-labelledby="trip-tab-4" data-tab="4" hidden={active !== 4}>
                <TripItinerary tripId={savedTrip?._id} route={homeRoute} plan={liveTrip?.flightPlan}
                  onSaveTrip={saveTrip}
                  onOpenTransportation={() => { setActive(1); tabButtons.current[1]?.focus(); }}
                  onOpenInterests={() => { setActive(2); tabButtons.current[2]?.focus(); }} />
              </section>
            </>}
          </fieldset>
        </div>
        <footer className="trip-modal-footer">
          {error && <p className="search-error" role="alert">{error}</p>}
          {notice && <p className="field-hint" role="status">{notice}</p>}
          <div className="modal-footer-actions">
            <button className="secondary-button" type="button" disabled={pending} onClick={onClose}>{planning ? "Back to trips" : "Cancel"}</button>
            <div className="button-row">
              {active > 0 && <button className="secondary-button" type="button" onClick={() => setActive(active - 1)}>Back</button>}
              {active < tabs.length - 1 && <button className="secondary-button" type="button" onClick={() => setActive(active + 1)}>Next</button>}
              <button className="primary-button trip-save-button" type="submit" disabled={pending || (!savedTrip && !creationReady)}>{pending ? "Saving…" : !planning && active === 2 ? "Create my trip" : planning ? "Save changes" : "Save trip"}</button>
            </div>
          </div>
        </footer>
      </form>
    </>
  );

  if (planning) return <section className="trip-planner-editor" aria-labelledby="editor-title">
    <div className="trip-planner-main">{content}</div>
    <aside className="trip-assistant-rail" aria-label="Trip planning assistant">
      <TripAssistant tripId={savedTrip?._id} />
    </aside>
  </section>;
  return <dialog ref={dialog} className="trip-modal" aria-labelledby="editor-title" onCancel={(event) => {
    event.preventDefault();
    if (!pending) onClose();
  }}>{content}</dialog>;
}
