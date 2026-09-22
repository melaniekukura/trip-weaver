import { tripCreationReady } from "./tripCreation";
import { useDefaultOrigin } from "./profileDefaults";
import { useConvexAuth, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { DestinationsEditor } from "./DestinationsEditor";
import type { DestinationStop } from "./DestinationsEditor";
import { tripPlannerPath } from "./tripRoutes";
import { useTripFormController } from "./useTripFormController";
import { GuestFeatureGate } from "./GuestFeatureGate";
import type { GuestTripDraft } from "./guestTripDraft";
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
import { LodgingTab } from "./LodgingTab";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { invalidRequiredTripFields } from "./tripFormValidation";
import type { RequiredTripField } from "./tripFormValidation";

const planningTabs = ["Overview", "Transportation", "Lodging", "Interests", "Accessibility", "Itinerary"];
const setupTabs = ["Overview", "Destinations", "Create my trip"];

type InitialTrip = Pick<GuestTripDraft, "origin" | "destinations" | "startDate"> &
  Partial<Omit<GuestTripDraft, "origin" | "destinations" | "startDate">>;

export function TripForm({ trip, initialValues, onClose, mode = "modal", onSignInRequired, onGuestContinue, onDraftChange }: {
  trip?: Doc<"trips">; initialValues?: InitialTrip; onClose: () => void; mode?: "modal" | "page" | "guest";
  onSignInRequired?: () => void;
  onGuestContinue?: (draft: Omit<GuestTripDraft, "draftId">) => void;
  onDraftChange?: (draft: GuestTripDraft) => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const planning = mode !== "modal";
  const guest = mode === "guest";
  const tabs = planning ? planningTabs : setupTabs;
  const [accessibility, setAccessibility] = useState(trip?.accessibility ?? initialValues?.accessibility ?? "");
  const form = useRef<HTMLFormElement>(null);
  const [active, setActive] = useState(0);
  const [name, setName] = useState(trip?.name ?? initialValues?.name ?? "");
  const [travelers, setTravelers] = useState(String(trip?.travelers ?? initialValues?.travelers ?? 1));
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMounted, setAssistantMounted] = useState(false);
  const assistantToggle = useRef<HTMLButtonElement>(null);
  const assistantClose = useRef<HTMLButtonElement>(null);
  const [startDate, setStartDate] = useState(trip?.startDate ?? initialValues?.startDate ?? "");
  const [interests, setInterests] = useState(trip?.interests ?? initialValues?.interests ?? []);
  const [endDate, setEndDate] = useState(trip?.endDate ?? initialValues?.endDate ?? "");
  const [touchedRequired, setTouchedRequired] = useState<Partial<Record<RequiredTripField, boolean>>>({});
  const [origin, setOrigin, defaultAirport] = useDefaultOrigin(trip?.origin ?? initialValues?.origin);
  const [destinations, setDestinations] = useState<DestinationStop[]>(() =>
    (trip?.destinations ?? initialValues?.destinations ?? []).map((value, index) => ({ id: `saved-${index}`, value })));
  const [homeReturnNotNeededFor, setHomeReturnNotNeededFor] = useState(trip?.homeReturnNotNeededFor ?? initialValues?.homeReturnNotNeededFor ?? "");
  const { savedTrip, pending, error, notice, saveTrip } = useTripFormController({
    trip, form, planning, origin, destinations, homeReturnNotNeededFor, setActive,
  });
  const liveTrip = useQuery(api.trips.get, savedTrip ? { tripId: savedTrip._id } : "skip");
  const homeRoute = { origin, destinations: destinations.map(stop => stop.value), startDate, endDate,
    travelers: Number(travelers), homeReturnNotNeededFor };
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
  const invalidRequired = invalidRequiredTripFields({ name, origin, destinations: destinations.map(stop => stop.value),
    startDate, endDate, travelers });
  const showInvalid = (field: RequiredTripField) => invalidRequired[field] && touchedRequired[field];
  const touchRequired = (field: RequiredTripField) => setTouchedRequired(current => ({ ...current, [field]: true }));

  function revealInvalidRequired() {
    const fields = (Object.keys(invalidRequired) as RequiredTripField[]).filter(field => invalidRequired[field]);
    setTouchedRequired(current => ({ ...current, ...Object.fromEntries(fields.map(field => [field, true])) }));
    const first = fields[0];
    if (!first) return;
    setActive(first === "origin" || first === "destination" ? (planning ? 0 : 1) : 0);
    requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[data-required-field="${first}"]`)?.focus());
  }
  const draftValues = { name, origin, destinations: destinations.map(stop => stop.value), startDate, endDate,
    travelers: Number(travelers), interests, accessibility, homeReturnNotNeededFor };

  useEffect(() => {
    if (guest && initialValues?.draftId) onDraftChange?.({ draftId: initialValues.draftId, ...draftValues });
  }, [guest, initialValues?.draftId, name, origin, destinations, startDate, endDate, travelers, interests,
    accessibility, homeReturnNotNeededFor, onDraftChange]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creationReady) { revealInvalidRequired(); return; }
    if (guest && initialValues?.draftId) {
      onDraftChange?.({ draftId: initialValues.draftId, ...draftValues });
      onSignInRequired?.();
      return;
    }
    if (!isAuthenticated) {
      onGuestContinue?.(draftValues);
      return;
    }
    const creating = !savedTrip;
    const tripId = await saveTrip();
    if (!tripId || planning) return;
    if (creating) window.location.hash = tripPlannerPath(tripId);
    onClose();
  }

  function toggleAssistant() {
    const nextOpen = !assistantOpen;
    if (nextOpen) setAssistantMounted(true);
    setAssistantOpen(nextOpen);
    requestAnimationFrame(() => {
      if (nextOpen) assistantClose.current?.focus();
      else assistantToggle.current?.focus();
    });
  }

  const destinationFields = <>
    <h3>Where are you headed?</h3>
    <DestinationsEditor origin={origin} stops={destinations} disabled={pending} defaultAirport={defaultAirport}
      invalid={{ origin: !!showInvalid("origin"), destination: !!showInvalid("destination") }}
      onRequiredBlur={touchRequired} onOriginChange={setOrigin} onStopsChange={setDestinations} homePrompt={homePrompt} />
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
              <label>Trip name<input name="name" required maxLength={120} value={name} onChange={event => setName(event.target.value)}
                onBlur={() => touchRequired("name")} aria-invalid={showInvalid("name") || undefined} data-required-field="name"
                placeholder="Autumn in Japan" autoFocus={!planning} /></label>
              <div className="form-row">
                <label>Start date<input name="startDate" type="date" required min="1900-01-01" max="9999-12-31"
                  value={startDate} onChange={(event) => setStartDate(event.target.value)} onBlur={() => touchRequired("startDate")}
                  aria-invalid={showInvalid("startDate") || undefined} data-required-field="startDate" /></label>
                <label>End date<input name="endDate" type="date" required min={startDate || "1900-01-01"} max="9999-12-31"
                  value={endDate} onChange={(event) => setEndDate(event.target.value)} onBlur={() => touchRequired("endDate")}
                  aria-invalid={showInvalid("endDate") || undefined} data-required-field="endDate" /></label>
              </div>
              <label>Travelers<input name="travelers" type="number" min={1} max={100} step={1} required value={travelers}
                onChange={event => setTravelers(event.target.value)} onBlur={() => touchRequired("travelers")}
                aria-invalid={showInvalid("travelers") || undefined} data-required-field="travelers" /></label>
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
                <TransportationTab guest={guest} accessibility={accessibility} travelers={Number(travelers)} onRoundTripChange={onRoundTripChange} onRemoveLeg={removeTransportationLeg} routePending={pending} homePrompt={homePrompt} homeReturnNotNeededFor={homeReturnNotNeededFor} tripId={savedTrip?._id} origin={origin} destinations={destinations}
                  departureDate={startDate} returnDate={endDate} onReturnDateChange={setEndDate} onSaveTrip={guest ? async () => null : saveTrip} onEditDetails={() => { setActive(0); tabButtons.current[0]?.focus(); }} />
                {guest && <GuestFeatureGate onSignIn={() => onSignInRequired?.()}><section className="transport-expenses">
                  <h3>Other transportation expenses</h3><p>Add itemized transportation costs and include them in your budget.</p>
                </section></GuestFeatureGate>}
              </section>
              <section className="trip-tab-panel" role="tabpanel" id="trip-panel-2" aria-labelledby="trip-tab-2" data-tab="2" hidden={active !== 2}>
                {guest ? <GuestFeatureGate onSignIn={() => onSignInRequired?.()}><section><h3>Where you’re staying</h3>
                  <p>Search for lodging, compare stays, and track booking details.</p></section></GuestFeatureGate> : savedTrip &&
                  <LodgingTab tripId={savedTrip._id} route={homeRoute} plan={liveTrip?.flightPlan} defaultCurrency={liveTrip?.currency ?? savedTrip.currency} />}
              </section>
              <section className="trip-tab-panel" role="tabpanel" id="trip-panel-3" aria-labelledby="trip-tab-3" data-tab="3" hidden={active !== 3}>
                <h3>Interests &amp; activities</h3>
                <div className="interests-planning-context">
                <CityStaySummary route={homeRoute} plan={liveTrip?.flightPlan} onOpenTransportation={() => { setActive(1); tabButtons.current[1]?.focus(); }} />
                <InterestsEditor interests={interests} onChange={setInterests} />
                </div>
                <InterestDiscovery guest={guest} onSignIn={() => onSignInRequired?.()} accessibility={accessibility} tripId={savedTrip?._id}
                  interests={interests} destinations={destinations.map(stop => stop.value)} onSaveTrip={guest ? async () => null : saveTrip} />
              </section>
              <section className="trip-tab-panel" role="tabpanel" id="trip-panel-4" aria-labelledby="trip-tab-4" data-tab="4" hidden={active !== 4}>
                <AccessibilityTab initialValue={accessibility} onChange={setAccessibility} />
              </section>
              <section className="trip-tab-panel" role="tabpanel" id="trip-panel-5" aria-labelledby="trip-tab-5" data-tab="5" hidden={active !== 5}>
                {guest ? <GuestFeatureGate onSignIn={() => onSignInRequired?.()}><section><h3>Your itinerary</h3>
                  <p>Build a complete day-by-day schedule from flights, lodging, and activities.</p></section></GuestFeatureGate> : <TripItinerary tripId={savedTrip?._id} route={homeRoute} plan={liveTrip?.flightPlan}
                  onSaveTrip={saveTrip}
                  onOpenTransportation={() => { setActive(1); tabButtons.current[1]?.focus(); }}
                  onOpenLodging={() => { setActive(2); tabButtons.current[2]?.focus(); }}
                  onOpenInterests={() => { setActive(3); tabButtons.current[3]?.focus(); }} />}
              </section>
            </>}
          </fieldset>
        </div>
        <footer className="trip-modal-footer">
          {error && <p className="search-error" role="alert">{error}</p>}
          {notice && <p className="field-hint" role="status">{notice}</p>}
          <div className="modal-footer-actions">
            <button className="secondary-button" type="button" disabled={pending} onClick={onClose}>{guest ? "Back home" : planning ? "Back to trips" : "Cancel"}</button>
            <div className="button-row">
              {active > 0 && <button className="secondary-button" type="button" onClick={() => setActive(active - 1)}>Back</button>}
              {active < tabs.length - 1 && <button className="secondary-button" type="button" onClick={() => setActive(active + 1)}>Next</button>}
              <button className={`primary-button trip-save-button${!creationReady ? " is-incomplete" : ""}`} type="submit"
                disabled={pending} aria-disabled={!creationReady || undefined}>{pending ? "Saving…" : guest ? "Sign in to save" : !planning && active === 2 ? "Create my trip" : planning ? "Save changes" : "Save trip"}</button>
            </div>
          </div>
        </footer>
      </form>
    </>
  );

  if (planning) return <section className="trip-planner-editor" aria-labelledby="editor-title">
    {!guest && <button ref={assistantToggle} className={`assistant-toggle${assistantOpen ? " is-open" : ""}`} type="button"
      aria-label={assistantOpen ? "Close AI chat" : "Ask Trip-Weaver"}
      aria-controls="trip-assistant-drawer" aria-expanded={assistantOpen} onClick={toggleAssistant}>
      <span aria-hidden="true">✦</span>
      <span className="assistant-toggle-label">{assistantOpen ? "Close AI chat" : "Ask Trip-Weaver"}</span>
    </button>}
    <div className="trip-planner-main">{content}</div>
    {!guest && <aside id="trip-assistant-drawer" className={`trip-assistant-drawer${assistantOpen ? " is-open" : ""}`}
      aria-label="Trip planning assistant" aria-hidden={!assistantOpen} inert={!assistantOpen}
      onKeyDown={(event) => { if (event.key === "Escape") toggleAssistant(); }}>
      <button ref={assistantClose} className="assistant-drawer-close" type="button" aria-label="Close AI chat"
        onClick={toggleAssistant}>×</button>
      {assistantMounted && <TripAssistant tripId={savedTrip?._id} />}
    </aside>}
  </section>;
  return <dialog ref={dialog} className="trip-modal" aria-labelledby="editor-title" onCancel={(event) => {
    event.preventDefault();
    if (!pending) onClose();
  }}>{content}</dialog>;
}
