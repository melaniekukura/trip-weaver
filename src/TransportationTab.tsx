import { SelectedFlightCard } from "./SelectedFlightCard";
import { AirlineBookingLink } from "./AirlineBookingLink";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { ReactNode } from "react";
import { homeJourneyStatus, sameTravelLocation } from "../convex/homeJourney";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { FlightRequest } from "../convex/flightSearch";
import { validateFlightRequest } from "../convex/flightSearch";
import { FlightFilterControls } from "./FlightFilterControls";
import { ReturnFlightPicker } from "./ReturnFlightPicker";
import { emptyFlightFilters } from "./flightFilters";
import { FlightResults } from "./FlightResults";
import { flightRequestFromTrip } from "./flightResearch";
import type { DestinationStop } from "./DestinationsEditor";
import { flightPlanItinerary } from "../convex/flightPlanFields";
import { transportationLegs, transportLocationLabel } from "./transportationLegs";

type TransportationTabProps = {
  onRemoveLeg?: (index: number) => Promise<void>; routePending?: boolean;
  onRoundTripChange?: (roundTrip: boolean) => void;
  homePrompt?: ReactNode; homeReturnNotNeededFor?: string;
  tripId?: Id<"trips">;
  origin: string;
  destinations: DestinationStop[];
  departureDate: string;
  returnDate: string;
  onReturnDateChange?: (date: string) => void;
  onEditDetails: (tab: 0 | 1) => void;
  onSaveTrip: () => Promise<Id<"trips"> | null>;
};

type LegSelection = { route: string; source: Doc<"researchSources"> };

export function TransportationTab({ onRoundTripChange, onRemoveLeg, routePending = false, homePrompt, homeReturnNotNeededFor, tripId, origin, destinations, departureDate, returnDate, onReturnDateChange, onEditDetails, onSaveTrip }: TransportationTabProps) {
  const persisted = useQuery(api.trips.get, tripId ? { tripId } : "skip");
  const mutatePlan = useMutation(api.trips.changeFlightPlan);
  const [mutatingPlan, setSavingPlan] = useState(false);
  const savingPlan = mutatingPlan || routePending;
  const [planError, setPlanError] = useState("");
  const planLock = useRef(false);
  const plan = persisted?.flightPlan;
  const itineraryKey = flightPlanItinerary({ origin, destinations: destinations.map(stop => stop.value), startDate: departureDate, endDate: returnDate });
  const savedItineraryKey = persisted ? flightPlanItinerary(persisted) : itineraryKey;
  const matchingItinerary = savedItineraryKey === itineraryKey;
  const selectionKey = matchingItinerary ? itineraryKey : "";
  async function changePlan(index: number, action: "select" | "book" | "edit" | "clear" | "confirm", outboundId?: Id<"researchSources">, returnId?: Id<"researchSources">) {
    if (planLock.current) return false;
    planLock.current = true; setSavingPlan(true); setPlanError("");
    try {
      const id = tripId ?? await onSaveTrip();
      if (!id) return false;
      await mutatePlan({ tripId: id, revision: plan?.revision ?? 0, index, action, outboundId, returnId });
      return true;
    } catch (error) {
      const data = error instanceof ConvexError ? error.data : null;
      setPlanError(data && typeof data === "object" && "message" in data ? String(data.message) : "Unable to save the flight plan. Please try again.");
      return false;
    } finally { planLock.current = false; setSavingPlan(false); }
  }
  const legs = transportationLegs(origin, destinations);
  const [roundTripChoice, setRoundTripChoice] = useState<{ route: string; selected: boolean } | null>(null);
  const routeKey = JSON.stringify([origin, destinations]);
  const reportRoundTrip = useCallback((selected: boolean) => {
    setRoundTripChoice(current => current?.route === routeKey && current.selected === selected ? current : { route: routeKey, selected });
    onRoundTripChange?.(selected);
  }, [routeKey, onRoundTripChange]);
  const roundTrip = legs.length === 1 && (roundTripChoice?.route === routeKey
    ? roundTripChoice.selected : plan?.legs.find(leg => leg.index === 0)?.request.tripType === "round-trip");
  const totalCount = legs.length + (roundTrip ? 1 : 0);
  const [selections, setSelections] = useState<Record<string, LegSelection | null>>({});
  const itinerary = JSON.stringify([origin, destinations, departureDate, returnDate]);
  const bookedCount = legs.reduce((count, _, index) => {
    const booked = plan?.legs.find(leg => leg.index === index && leg.itinerary === selectionKey && leg.booked);
    if (!booked) return count;
    return count + (roundTrip ? booked.request.tripType === "round-trip" && booked.returning ? 2 : 0 : 1);
  }, 0);
  const homeStatus = homeJourneyStatus({ origin, destinations: destinations.map(stop => stop.value), startDate: departureDate, endDate: returnDate, homeReturnNotNeededFor }, plan?.legs);
  const homeResolved = homeStatus !== "missing" && (!persisted || homeJourneyStatus(persisted, plan?.legs) !== "missing");
  const allBooked = legs.length > 0 && bookedCount === totalCount;
  return <>
    <h3>Find your way there</h3>
    <p className="field-hint">One leg per pair of stops from your Destinations tab. Search and pick transport for each leg in order.</p>
    {homePrompt}
    {!legs.length && <div className="flight-setup">
      <p>Add your starting point and destinations to plan transportation.</p>
      <button className="secondary-button" type="button" onClick={() => onEditDetails(1)}>Choose locations</button>
    </div>}
    {tripId && persisted === undefined ? <p role="status">Loading saved flight plan…</p> : <div className="transport-legs">{legs.map((leg, index) => {
      const previous = index > 0 ? selections[legs[index - 1].id] : null;
      return <TransportationLeg key={leg.id} {...leg} index={index} allowRoundTrip={legs.length === 1} isHomeLeg={index === legs.length - 1 && sameTravelLocation(leg.destination, origin)} departureDate={departureDate} returnDate={returnDate} onReturnDateChange={onReturnDateChange}
        onRoundTripChange={index === 0 ? reportRoundTrip : undefined}
        onRemove={onRemoveLeg && legs.length > 1 ? () => onRemoveLeg(index) : undefined}
        removalHint={index < legs.length - 1 ? `Removes ${transportLocationLabel(leg.destination)} from Destinations; the next leg will leave from ${transportLocationLabel(leg.origin)}.` : "Removes this final stop from Destinations."}
        saved={plan?.legs.find(item => item.index === index)} itineraryKey={selectionKey} savingPlan={savingPlan}
        changePlan={(action, outboundId, returnId) => changePlan(index, action, outboundId, returnId)}
        previousArrival={previous?.route === itinerary ? previous.source.flight.arrival : plan?.legs.find(item => item.index === index - 1 && item.itinerary === itineraryKey)?.outbound.flight.arrival}
        onSelect={(source) => setSelections(current => {
          const next = { ...current, [leg.id]: source ? { route: itinerary, source } : null };
          for (const later of legs.slice(index + 1)) next[later.id] = null;
          return next;
        })} onSaveTrip={onSaveTrip} onEditDetails={onEditDetails} />;
    })}</div>}
    {!matchingItinerary && <p className="transport-stale" role="status">The editor’s trip details differ from the saved itinerary. Save your intended changes or reopen the trip to load the saved route before confirming flights.</p>}
    {planError && <p className="search-error" role="alert">{planError}</p>}
    {legs.length > 0 && <div className={`flight-plan-banner${allBooked && homeResolved ? " is-complete" : ""}`}>
      <div><strong>{allBooked && homeResolved ? "All legs booked" : `${bookedCount} / ${totalCount} legs booked`}</strong>
        <p>{!homeResolved ? "Add your journey home or mark it as not needed before confirming." : allBooked ? "Confirm this as your final flight plan." : "Mark each leg as booked to finalize your plan."}</p></div>
      <button type="button" className="primary-button" disabled={!allBooked || !homeResolved || savingPlan || (allBooked && !!plan?.confirmed)}
        onClick={() => void changePlan(0, "confirm")}>
        {allBooked && homeResolved && plan?.confirmed ? "Flight plan confirmed ✓" : "Confirm flight plan"}</button>
    </div>}
  </>;
}

function TransportationLeg({ onRoundTripChange, onRemove, removalHint, origin, destination, index, allowRoundTrip, isHomeLeg, departureDate: tripStart, returnDate, onReturnDateChange, previousArrival, onSelect, onEditDetails, onSaveTrip, saved, itineraryKey, savingPlan, changePlan }: {
  onRoundTripChange?: (roundTrip: boolean) => void;
  onRemove?: () => Promise<void>; removalHint: string;
  allowRoundTrip: boolean; isHomeLeg: boolean;
  origin: string; destination: string; index: number; departureDate: string; returnDate: string;
  saved?: NonNullable<Doc<"trips">["flightPlan"]>["legs"][number]; itineraryKey: string; savingPlan: boolean;
  changePlan: (action: "select" | "book" | "edit" | "clear", outboundId?: Id<"researchSources">, returnId?: Id<"researchSources">) => Promise<boolean>;
  onReturnDateChange?: (date: string) => void;
  previousArrival?: string; onSelect: (source: Doc<"researchSources"> | null) => void;
  onEditDetails: TransportationTabProps["onEditDetails"]; onSaveTrip: TransportationTabProps["onSaveTrip"];
}) {
  const id = useId();
  const [tripTypeChoice, setTripType] = useState<"one-way" | "round-trip">(saved?.request.tripType ?? "one-way");
  const tripType = allowRoundTrip ? tripTypeChoice : "one-way";
  useEffect(() => {
    onRoundTripChange?.(tripType === "round-trip");
  }, [tripType, onRoundTripChange]);
  const [filters, setFilters] = useState({ ...emptyFlightFilters });
  const [showOptions, setShowOptions] = useState(false);
  const [expanded, setExpanded] = useState(index === 0);
  const [dateOverride, setDateOverride] = useState(saved?.request.departureDate ?? (isHomeLeg ? returnDate : ""));
  const departureDate = index === 0 ? tripStart : dateOverride || tripStart;
  const [starting, setStarting] = useState(false);
  const [savingBooking, setSavingBooking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitted, setSubmitted] = useState<{ tripId: Id<"trips">; flight: FlightRequest; route: string } | null>(null);
  const lock = useRef(false);
  const start = useMutation(api.flightJobs.start);
  const route = JSON.stringify([origin, destination, departureDate, tripType, tripType === "round-trip" ? returnDate : null]);
  const restored = saved && { tripId: saved.outbound.tripId, flight: saved.request,
    route: JSON.stringify([origin, destination, saved.request.departureDate, saved.request.tripType ?? "one-way", saved.request.returnDate ?? null]) };
  const candidate = submitted ?? restored;
  const current = candidate?.route === route && (!saved || saved.itinerary === itineraryKey || submitted) ? candidate : null;
  const research = useQuery(api.flightJobs.latest, current ? { tripId: current.tripId, flight: current.flight } : "skip");
  const result = research;
  const busy = starting || result?.run.status === "pending" || result?.run.status === "running";
  const selectedOutbound = saved?.itinerary === itineraryKey && current && saved.request.departureDate === departureDate &&
    (saved.request.tripType ?? "one-way") === tripType ? saved.outbound : undefined;
  const booked = !!selectedOutbound && !!saved?.booked;
  const returning = selectedOutbound ? saved?.returning : undefined;
  const price = tripType === "round-trip" ? returning?.flight.amount : selectedOutbound?.flight.amount;
  const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  async function select(source: Doc<"researchSources">) {
    if (await changePlan("select", source._id)) { setShowOptions(false); onSelect(source); }
  }


  async function search(refresh = false) {
    if (lock.current) return;
    lock.current = true;
    setStarting(true); setError(""); setNotice("");
    try {
      const flight = validateFlightRequest({
        ...flightRequestFromTrip(origin, destination, departureDate),
        ...(allowRoundTrip && tripType === "round-trip" ? { tripType, returnDate } : {}),
      });
      const tripId = await onSaveTrip();
      if (!tripId) return;
      const response = await start({ tripId, flight, refresh });
      setSubmitted({ tripId, flight, route });
      setShowOptions(true);
      if (response.reused) setNotice("Using a recent matching search. Refresh to request new prices.");
    } catch (err) {
      const data = err instanceof ConvexError ? err.data : null;
      setError(data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message : err instanceof Error ? err.message : "Unable to start flight search. Please try again.");
    } finally { lock.current = false; setStarting(false); }
  }

  const stale = (!!saved && saved.itinerary !== itineraryKey) || (!!candidate && !current);
  const status = stale ? "Details changed · search again" : booked ? `✓ Booked: ${selectedOutbound!.flight.airline} · ${money(price!)}` :
    selectedOutbound && price !== undefined ? `Ready to book · ${money(price)}` : selectedOutbound ? `Selected: ${selectedOutbound.flight.airline}${price === undefined ? "" : ` · ${money(price)}`}` : busy ? "Searching…" :
    result?.run.status === "completed" ? "Searched — pick an option" : result?.run.status === "failed" ? "Search failed" : "Not searched yet";


  return <section className="transport-leg" aria-label={`Leg ${index + 1}: ${origin} to ${destination}`}>
    <button type="button" className="transport-leg-header" aria-expanded={expanded} aria-controls={`${id}-body`}
      onClick={() => setExpanded(!expanded)}>
      <span className="transport-leg-number">{index + 1}</span>
      <span className="transport-leg-title"><strong>{transportLocationLabel(origin)} → {transportLocationLabel(destination)}</strong>
        <span className={selectedOutbound && !stale ? "transport-status-selected" : undefined}>{status}</span></span>
      <span className="transport-leg-disclosure">{expanded ? "▴ Hide" : "▾ Show"}</span>
    </button>
    <div id={`${id}-body`} className="transport-leg-body" hidden={!expanded}>
      {onRemove && <div className="transport-remove-leg">
        <button type="button" className="text-button" disabled={savingPlan || busy} onClick={() => void onRemove()}>Remove leg</button>
        <p className="field-hint">{removalHint}{saved?.booked ? " This does not cancel the airline booking." : ""}</p>
      </div>}
      <div className="transport-mode" role="group" aria-label="Mode">
        <span className="transport-field-label">Mode</span>
        <div className="transport-mode-options">
          <button type="button" className="transport-mode-pill" aria-pressed="true">Flight</button>
          {["Train", "Bus", "Ferry"].map(mode => <button key={mode} type="button" className="transport-mode-pill"
            disabled title={`${mode} search coming soon`} aria-label={`${mode} — coming soon`}>{mode}</button>)}
        </div>
        <p className="field-hint">Train, bus, and ferry searches are coming soon.</p>
      </div>
      <div className="transport-leg-fields">
        {allowRoundTrip && <div role="group" aria-label="Trip type">
          <span className="transport-field-label">Trip type</span>
          <div className="transport-mode-options transport-trip-types">
            {(["one-way", "round-trip"] as const).map(value => <button key={value} type="button" className="transport-mode-pill"
              aria-pressed={tripType === value} disabled={busy || booked || savingPlan}
              onClick={() => { void (async () => {
                if (tripType === value || (saved && !await changePlan("clear"))) return;
                setTripType(value); setShowOptions(false); onSelect(null); setError(""); setNotice("");
              })(); }}>{value === "one-way" ? "One way" : "Round trip"}</button>)}
          </div>
        </div>}
        <div className="transport-departure-hint">
          <span className="transport-field-label">Earliest departure</span>
          <p>{index === 0 ? `Trip start: ${tripStart || "Set dates in Overview"}` : previousArrival ?
            `Previous arrival: ${previousArrival}` : "Choose the previous leg’s flight first"}</p>
        </div>
        {index > 0 && <label htmlFor={`${id}-departure`}>Departure date
          <input id={`${id}-departure`} disabled={booked || savingPlan} type="date" min={tripStart} max={returnDate || undefined} value={departureDate}
            onChange={(event) => { const value = event.target.value; void (async () => {
              if (saved && !await changePlan("clear")) return;
              setDateOverride(value); setShowOptions(false); onSelect(null);
            })(); }} />
        </label>}
        {tripType === "round-trip" && <label className="transport-return-date" htmlFor={`${id}-return`}>Return date
          <input id={`${id}-return`} type="date" min={departureDate} value={returnDate} disabled={busy || booked || savingPlan || !onReturnDateChange}
            onChange={event => onReturnDateChange?.(event.target.value)} />
          <span className="field-hint">Also updates your trip’s end date.</span>
        </label>}

      </div>
      {index > 0 && <p className="field-hint">Choose this leg’s travel date. Arrival hints use local airport times; allow time for your stay and transfers.</p>}
      {stale && <p className="transport-stale" role="status">The route or dates changed. Search again for matching flights.</p>}
      <div className="button-row">
        <button className="text-button" type="button" onClick={() => onEditDetails(0)}>Edit trip dates</button>
      </div>
      {!booked && <details className="transport-filter-details">
        <summary>Flight filters</summary>
        <FlightFilterControls value={filters} onChange={(value) => { setFilters(value); setShowOptions(false); onSelect(null); }}
          priceLabel={tripType === "round-trip" ? "Maximum round-trip price (USD)" : "Maximum price (USD)"} />
      </details>}
      {!selectedOutbound && <p className="field-hint transport-search-note">1 adult · Economy including basic fares · USD. Times are local to each airport.</p>}
      {!booked && <button className="primary-button" type="button" disabled={busy || savingPlan}
        onClick={() => void search(result?.run.status === "completed")}>
        {busy ? "Finding outgoing flights…" : result?.run.status === "completed" ? "Refresh outgoing flights" : "Search Flight"}
      </button>}
      {starting && <p role="status">Saving your trip and starting flight search…</p>}
      {error && <p className="search-error" role="alert">{error}</p>}
      {notice && !stale && <p role="status" className="field-hint">{notice}</p>}
      {stale && saved?.booked && <div className="chosen-flight-card">
        <div><h4>Previously booked · itinerary changed</h4><strong>{saved.outbound.flight.airline}</strong>
          <p>{saved.outbound.flight.departure} → {saved.outbound.flight.arrival}</p>
          <p>Trip-Weaver confirmation #{saved.reference}</p></div>
        <button type="button" className="secondary-button" disabled={savingPlan} onClick={() => void changePlan("edit")}>Edit</button>
      </div>}
      {current && !starting && <div className="transportation-flights">
        {selectedOutbound && <SelectedFlightCard source={selectedOutbound} direction="Outgoing" roundTrip={tripType === "round-trip"} booked={booked} />}
        {booked && returning && <SelectedFlightCard source={returning} direction="Return" roundTrip booked />}
        {!booked && selectedOutbound && <button type="button" className="text-button" onClick={() => setShowOptions(!showOptions)}>
          {showOptions ? "Hide other options" : "See other options"}</button>}
        {!booked && (!selectedOutbound || showOptions) && <fieldset disabled={savingPlan}>
          <FlightResults compact research={result} flight={current.flight} filters={filters}
            selectedSourceId={selectedOutbound?._id} onSelectOutbound={(source) => void select(source)} onSelectFlight={(source) => void select(source)} />
        </fieldset>}
        {!booked && selectedOutbound && tripType === "round-trip" && <ReturnFlightPicker key={selectedOutbound._id} tripId={current.tripId}
          request={current.flight} outbound={selectedOutbound} selectedReturn={returning} disabled={savingPlan}
          onSelectReturn={(source) => changePlan("select", selectedOutbound._id, source?._id)}
          onClose={() => setShowOptions(true)} />}
        {selectedOutbound && <div className="transport-booking-footer">
          <div><strong>{price === undefined ? "Choose a return flight to complete this leg" : `Total · ${money(price)}`}</strong>
            {booked && <p>Trip-Weaver confirmation #{saved?.reference}</p>}
            <p className="field-hint">{booked ? "Recorded as booked by you." : "Book externally, then mark this leg as booked."}</p>
          </div>
          {!booked && <AirlineBookingLink key={`${selectedOutbound._id}-${returning?._id ?? ""}`} tripId={selectedOutbound.tripId}
            outbound={selectedOutbound} returning={returning} outboundId={selectedOutbound._id} returnId={returning?._id} needsReturn={tripType === "round-trip"} />}
          <button type="button" className="secondary-button" disabled={savingPlan || savingBooking || price === undefined}
            aria-busy={savingBooking} aria-live="polite"
            onClick={() => { void (async () => {
              if (booked) { await changePlan("edit"); return; }
              setSavingBooking(true);
              try { await changePlan("book"); } finally { setSavingBooking(false); }
            })(); }}>{savingBooking ? "Saving booking…" : booked ? "Edit" : "Mark as booked"}</button>
        </div>}
      </div>}

    </div>
  </section>;
}
