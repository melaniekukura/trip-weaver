import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { transportLocationLabel } from "./transportationLegs";
import { getFirecrawlSessionId } from "./firecrawlSession";
import { lodgingDateDefaults } from "./lodgingDates";
import { LocationPicker } from "./LocationPicker";
import { supportedCurrencies } from "../convex/currencies";

const stayTypes = [
  ["hotel", "Hotel"], ["hostel", "Hostel"], ["vacation-rental", "Vacation rental / Airbnb"],
  ["resort", "Resort"], ["bed-and-breakfast", "Bed & breakfast"], ["other", "Other"],
] as const;
type StayType = typeof stayTypes[number][0];
const stayTypeLabel = (type?: string) => stayTypes.find(option => option[0] === type)?.[1] ?? "Stay";

type Draft = {
  type: StayType;
  destination: string;
  name: string;
  address: string;
  checkInDate: string;
  checkOutDate: string;
  booked: boolean;
  totalCost: string;
  currency: string;
  bookingUrl: string;
  confirmationNumber: string;
  notes: string;
};

function initialDraft(destination: string, checkInDate: string, checkOutDate: string, currency: string): Draft {
  return { type: "hotel", destination, name: "", address: "", checkInDate,
    checkOutDate, booked: false, totalCost: "", currency, bookingUrl: "", confirmationNumber: "", notes: "" };
}

function lodgingDraft(lodging: Doc<"lodgings">): Draft {
  return { type: lodging.type ?? "hotel", destination: lodging.destination, name: lodging.name, address: lodging.address ?? "",
    checkInDate: lodging.checkInDate, checkOutDate: lodging.checkOutDate, booked: lodging.booked,
    totalCost: lodging.totalCost === undefined ? "" : String(lodging.totalCost), currency: lodging.currency, bookingUrl: lodging.bookingUrl ?? "",
    confirmationNumber: lodging.confirmationNumber ?? "", notes: lodging.notes ?? "" };
}

function errorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "object" && error.data !== null &&
      "message" in error.data && typeof error.data.message === "string") return error.data.message;
  return "Unable to complete this request. Please try again.";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function LocationField({ label, destinations, value, disabled = false, onChange, onCustomSelect }: {
  label: string;
  destinations: string[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onCustomSelect?: (value: string) => void;
}) {
  const pickerId = useId();
  const menuId = useId();
  const picker = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const isCustom = !destinations.includes(value);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function choose(destination: string) {
    onChange(destination);
    setOpen(false);
  }

  return <div className="lodging-location-field">
    <label htmlFor={pickerId}>{label}</label>
    <div className="lodging-location-picker" ref={picker} onKeyDown={event => {
      if (event.key === "Escape") setOpen(false);
    }}>
      <button id={pickerId} className="lodging-location-trigger" type="button" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(current => !current)}>
        <span>{isCustom ? "Another city…" : transportLocationLabel(value)}</span><span aria-hidden="true">⌄</span>
      </button>
      {open && <div id={menuId} className="lodging-location-menu" role="listbox" aria-label={label}>
        {destinations.map(destination => <button key={destination} type="button" role="option"
          aria-selected={destination === value} onClick={() => choose(destination)}>{transportLocationLabel(destination)}</button>)}
        <button type="button" role="option" aria-selected={isCustom} onClick={() => choose("")}>Another city…</button>
      </div>}
    </div>
    {isCustom && <LocationPicker citiesOnly required label="Search for another city" value={value} disabled={disabled}
      onClear={() => onChange("")} onSelect={destination => {
        onChange(destination);
        onCustomSelect?.(destination);
      }} />}
  </div>;
}

export function LodgingTab({ tripId, route, plan, defaultCurrency }: {
  tripId: Id<"trips">;
  route: Pick<Doc<"trips">, "origin" | "destinations" | "startDate" | "endDate">;
  plan?: Doc<"trips">["flightPlan"];
  defaultCurrency: string;
}) {
  const { destinations, startDate, endDate } = route;
  const defaultDraft = (destination = destinations[0] ?? "") => {
    const dates = lodgingDateDefaults(route, plan, destination);
    return initialDraft(destination, dates.checkInDate, dates.checkOutDate, defaultCurrency);
  };
  const lodgings = useQuery(api.lodgings.list, { tripId });
  const create = useMutation(api.lodgings.create);
  const update = useMutation(api.lodgings.update);
  const remove = useMutation(api.lodgings.remove);
  const startSearch = useMutation(api.lodgingJobs.start);
  const [editing, setEditing] = useState<Id<"lodgings"> | "new" | null>(null);
  const [draft, setDraft] = useState(() => defaultDraft());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [searchDestination, setSearchDestination] = useState(destinations[0] ?? "");
  const [searchType, setSearchType] = useState<StayType>("hotel");
  const [runId, setRunId] = useState<Id<"lodgingRuns">>();
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchNotice, setSearchNotice] = useState("");
  const propertyNameInput = useRef<HTMLInputElement>(null);
  const run = useQuery(api.lodgingJobs.latest, searchDestination ? { tripId, destination: searchDestination, type: searchType, runId } : "skip");
  const searchBusy = searchPending || run?.status === "pending" || run?.status === "running";

  useEffect(() => {
    if (editing) propertyNameInput.current?.focus();
  }, [editing]);

  function begin(lodging?: Doc<"lodgings">) {
    setEditing(lodging?._id ?? "new");
    setDraft(lodging ? lodgingDraft(lodging) : defaultDraft());
    setError("");
  }

  function useResult(result: Doc<"lodgingRuns">["results"][number]) {
    setEditing("new");
    setDraft({ ...defaultDraft(searchDestination), type: searchType,
      name: result.title.slice(0, 160), bookingUrl: result.url });
    setError("");
  }

  async function search(refresh = false, destination = searchDestination) {
    if (searchBusy) return;
    setSearchPending(true); setSearchError(""); setSearchNotice("");
    try {
      const result = await startSearch({ tripId, destination, type: searchType, refresh,
        sessionId: getFirecrawlSessionId() });
      setRunId(result.runId);
      if (result.reused) setSearchNotice("Using a matching recent search.");
    } catch (searchFailure) { setSearchError(errorMessage(searchFailure)); }
    finally { setSearchPending(false); }
  }

  async function save() {
    setPending(true); setError("");
    const lodging = { type: draft.type, destination: draft.destination, name: draft.name, address: draft.address || undefined,
      checkInDate: draft.checkInDate, checkOutDate: draft.checkOutDate, booked: draft.booked,
      totalCost: draft.totalCost === "" ? undefined : Number(draft.totalCost), currency: draft.currency,
      bookingUrl: draft.bookingUrl || undefined,
      confirmationNumber: draft.confirmationNumber || undefined, notes: draft.notes || undefined };
    try {
      if (editing === "new") await create({ tripId, lodging });
      else if (editing) await update({ lodgingId: editing, lodging });
      setEditing(null);
    } catch (saveError) { setError(errorMessage(saveError)); }
    finally { setPending(false); }
  }

  async function removeStay(lodging: Doc<"lodgings">) {
    if (!window.confirm(`Remove ${lodging.name} from this trip?`)) return;
    setPending(true); setError("");
    try { await remove({ lodgingId: lodging._id }); }
    catch (removeError) { setError(errorMessage(removeError)); }
    finally { setPending(false); }
  }

  return <>
    <div className="lodging-heading">
      <div><h3>Where you’re staying</h3><p className="field-hint">Keep reservations and costs with the rest of your trip.</p></div>
      {!editing && <button className="primary-button" type="button" onClick={() => begin()}>Add a stay</button>}
    </div>
    {editing && <section className="lodging-editor" aria-label={editing === "new" ? "Add a stay" : "Edit stay"}>
      <h4>{editing === "new" ? "Add a stay" : "Edit stay"}</h4>
      <div className="lodging-fields">
        <label>Type of stay<select value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value as StayType })}>
          {stayTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <LocationField label="City or destination" destinations={destinations} value={draft.destination}
          onChange={destination => {
            setDraft({ ...draft, destination, ...lodgingDateDefaults(route, plan, destination) });
          }} />
        <label>Property name<input ref={propertyNameInput} required maxLength={160} value={draft.name} placeholder="Hotel, rental, or hostel"
          onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Check-in<input type="date" required min={startDate} max={endDate} value={draft.checkInDate}
          onChange={event => setDraft({ ...draft, checkInDate: event.target.value })} /></label>
        <label>Check-out<input type="date" required min={draft.checkInDate || startDate} max={endDate} value={draft.checkOutDate}
          onChange={event => setDraft({ ...draft, checkOutDate: event.target.value })} /></label>
        <label className="lodging-wide">Address<input maxLength={300} value={draft.address} placeholder="Optional"
          onChange={event => setDraft({ ...draft, address: event.target.value })} /></label>
        <label>Total cost<input type="number" min={0} max={1000000000} step="0.01" value={draft.totalCost} placeholder="Optional"
          onChange={event => setDraft({ ...draft, totalCost: event.target.value })} /></label>
        <label>Currency<select value={draft.currency} onChange={event => setDraft({ ...draft, currency: event.target.value })}>
          {supportedCurrencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}</select></label>
        <label>Confirmation number<input maxLength={120} value={draft.confirmationNumber} placeholder="Optional"
          onChange={event => setDraft({ ...draft, confirmationNumber: event.target.value })} /></label>
        <label className="lodging-wide">Booking link<input type="url" maxLength={2000} value={draft.bookingUrl} placeholder="https://…"
          onChange={event => setDraft({ ...draft, bookingUrl: event.target.value })} /></label>
        <label className="lodging-wide">Notes<textarea rows={3} maxLength={4000} value={draft.notes} placeholder="Check-in details, room requests, or reminders"
          onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
      </div>
      <label className="lodging-booked"><input type="checkbox" checked={draft.booked}
        onChange={event => setDraft({ ...draft, booked: event.target.checked })} /> Reservation is booked</label>
      {error && <p className="search-error" role="alert">{error}</p>}
      <div className="button-row"><button className="primary-button" type="button" disabled={pending || !draft.name.trim() || !draft.destination.trim() || !draft.checkInDate || !draft.checkOutDate}
        onClick={() => void save()}>{pending ? "Saving…" : "Save stay"}</button>
        <button className="secondary-button" type="button" disabled={pending} onClick={() => { setEditing(null); setError(""); }}>Cancel</button></div>
    </section>}
    <section className="lodging-search" aria-label="Search for lodging">
      <h4>Find a place to stay</h4>
      <div className="lodging-search-row">
        <LocationField label="City or destination" destinations={destinations} value={searchDestination} disabled={searchBusy}
          onChange={destination => {
            setSearchDestination(destination); setRunId(undefined); setSearchError(""); setSearchNotice("");
          }} onCustomSelect={destination => void search(false, destination)} />
        <label>Type of stay<select value={searchType} disabled={searchBusy} onChange={event => {
          setSearchType(event.target.value as StayType); setRunId(undefined); setSearchError(""); setSearchNotice("");
        }}>{stayTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className="primary-button" type="button" disabled={searchBusy || !searchDestination.trim()}
          onClick={() => void search()}>{searchBusy ? "Searching…" : "Search lodging"}</button>
      </div>
      <div className="lodging-search-meta"><p className="field-hint">Firecrawl finds source links for your destination and trip dates. Confirm availability and pricing before booking.</p>
        {run && !searchBusy && <button className="text-button" type="button" onClick={() => void search(true)}>Refresh results</button>}</div>
      {searchNotice && <p role="status">{searchNotice}</p>}
      {searchError && <p className="search-error" role="alert">{searchError}</p>}
      {(run?.status === "pending" || run?.status === "running") && <p role="status">Searching for {stayTypeLabel(searchType).toLowerCase()} options…</p>}
      {run?.status === "failed" && <p className="search-error" role="alert">{run.error}</p>}
      {run?.status === "completed" && <>
        {run.warning && <p role="status">{run.warning}</p>}
        {!run.results.length && <p>No lodging results found. Try another type of stay.</p>}
        <ul className="lodging-results">{run.results.map(result => <li key={result.url}>
          <span className="lodging-status">Search result</span>
          <h5><a href={result.url} target="_blank" rel="noopener noreferrer">{result.title} ↗</a></h5>
          {result.description && <p className="lodging-result-description">{result.description}</p>}
          <p className="field-hint">{new URL(result.url).hostname.replace(/^www\./, "")}</p>
          <button className="secondary-button" type="button" disabled={pending} onClick={() => useResult(result)}>Add to trip</button>
        </li>)}</ul>
      </>}
    </section>
    {lodgings === undefined && <p role="status">Loading your stays…</p>}
    {lodgings?.length === 0 && !editing && <div className="lodging-empty">
      <strong>No stays added yet</strong><p>Add a hotel, rental, hostel, or other accommodation.</p>
      <button className="secondary-button" type="button" onClick={() => begin()}>Add your first stay</button>
    </div>}
    {!!lodgings?.length && <div className="lodging-list">{[...lodgings]
      .sort((left, right) => left.checkInDate.localeCompare(right.checkInDate))
      .map(lodging => <article className="lodging-card" key={lodging._id}>
        <div className="lodging-card-main">
          <span className={`lodging-status${lodging.booked ? " is-booked" : ""}`}>{lodging.booked ? "Booked" : "Planning"}</span>
          <h4>{lodging.name}</h4>
          <p className="lodging-destination">{stayTypeLabel(lodging.type)} · {transportLocationLabel(lodging.destination)}</p>
          <p>{dateLabel(lodging.checkInDate)} → {dateLabel(lodging.checkOutDate)}</p>
          {lodging.address && <p>{lodging.address}</p>}
          {lodging.confirmationNumber && <p><strong>Confirmation:</strong> {lodging.confirmationNumber}</p>}
          {lodging.notes && <p className="lodging-notes">{lodging.notes}</p>}
        </div>
        <div className="lodging-card-side">
          {lodging.totalCost !== undefined && <strong>{money(lodging.totalCost, lodging.currency)}</strong>}
          {lodging.bookingUrl && <a className="text-button" href={lodging.bookingUrl} target="_blank" rel="noopener noreferrer">Open booking ↗</a>}
          <div className="button-row"><button className="secondary-button" type="button" disabled={pending} onClick={() => begin(lodging)}>Edit</button>
            <button className="text-button lodging-remove" type="button" disabled={pending} onClick={() => void removeStay(lodging)}>Remove</button></div>
        </div>
      </article>)}</div>}
    {error && !editing && <p className="search-error" role="alert">{error}</p>}
  </>;
}
