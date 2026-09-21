import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { flightPlanItinerary } from "../convex/flightPlanFields";
import { transportLocationLabel } from "./transportationLegs";
import { ItineraryEmailAction } from "./ItineraryEmailAction";
import { IdeaItinerary } from "./IdeaItinerary";

type TripRoute = Pick<Doc<"trips">, "origin" | "destinations" | "startDate" | "endDate">;
type Favorite = Doc<"interestFavorites">;
type FlightLeg = NonNullable<Doc<"trips">["flightPlan"]>["legs"][number];

type ItineraryItem = {
  id: string;
  date?: string;
  time?: string;
  title: string;
  location: string;
  kind: "transportation" | "activity";
  detail?: string;
  notes?: string;
  url?: string;
  reference?: string;
  favorite?: Favorite;
};

export type ItineraryDay = { date?: string; items: ItineraryItem[] };

function timeFromFlight(value: string) {
  return value.match(/^\d{1,2}:\d{2} [AP]M/)?.[0];
}

function timeValue(value?: string) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const twelveHour = value.match(/^(\d{1,2}):(\d{2}) ([AP]M)$/);
  if (twelveHour) {
    const hour = Number(twelveHour[1]) % 12 + (twelveHour[3] === "PM" ? 12 : 0);
    return hour * 60 + Number(twelveHour[2]);
  }
  const twentyFourHour = value.match(/^(\d{2}):(\d{2})$/);
  return twentyFourHour ? Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]) : Number.MAX_SAFE_INTEGER;
}

export function itineraryTimeLabel(value?: string) {
  if (!value) return "Time not set";
  const twentyFourHour = value.match(/^(\d{2}):(\d{2})$/);
  if (!twentyFourHour) return value;
  const hour = Number(twentyFourHour[1]);
  return `${hour % 12 || 12}:${twentyFourHour[2]} ${hour < 12 ? "AM" : "PM"}`;
}

export function itineraryDays(route: TripRoute, legs: FlightLeg[] = [], favorites: Favorite[] = []): ItineraryDay[] {
  const itinerary = flightPlanItinerary(route);
  const items: ItineraryItem[] = [];
  for (const leg of legs.filter(item => item.booked && item.itinerary === itinerary)) {
    const outbound = leg.outbound.flight;
    items.push({
      id: `flight:${leg.index}:outbound`, date: leg.request.departureDate, time: timeFromFlight(outbound.departure),
      title: `${transportLocationLabel(leg.request.origin)} to ${transportLocationLabel(leg.request.destination)}`,
      location: `${outbound.originAirport ?? leg.request.origin} → ${outbound.destinationAirport ?? leg.request.destination}`,
      kind: "transportation", detail: `${outbound.airline} · ${outbound.duration} · ${outbound.stops}`,
      reference: leg.reference,
    });
    if (leg.request.tripType === "round-trip" && leg.request.returnDate && leg.returning) {
      const returning = leg.returning.flight;
      items.push({
        id: `flight:${leg.index}:return`, date: leg.request.returnDate, time: timeFromFlight(returning.departure),
        title: `${transportLocationLabel(leg.request.destination)} to ${transportLocationLabel(leg.request.origin)}`,
        location: `${returning.originAirport ?? leg.request.destination} → ${returning.destinationAirport ?? leg.request.origin}`,
        kind: "transportation", detail: `${returning.airline} · ${returning.duration} · ${returning.stops}`,
        reference: leg.reference,
      });
    }
  }
  for (const favorite of favorites.filter(item => item.itinerary)) {
    items.push({
      id: `activity:${favorite._id}`, date: favorite.itinerary?.date, time: favorite.itinerary?.time,
      title: favorite.item.title, location: transportLocationLabel(favorite.item.destination),
      kind: "activity", detail: favorite.item.venue, notes: favorite.itinerary?.notes, url: favorite.item.url, favorite,
    });
  }
  const groups = new Map<string, ItineraryItem[]>();
  for (const item of items) {
    const key = item.date || "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].sort(([left], [right]) => {
    if (!left) return 1;
    if (!right) return -1;
    return left.localeCompare(right);
  }).map(([date, dayItems]) => ({
    date: date || undefined,
    items: dayItems.sort((left, right) => timeValue(left.time) - timeValue(right.time) || left.title.localeCompare(right.title)),
  }));
}

function dateLabel(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Date not set";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

function ItineraryEntry({ item }: { item: ItineraryItem }) {
  return <li className={`full-itinerary-entry is-${item.kind}`}>
    <div className="full-itinerary-time">{itineraryTimeLabel(item.time)}<span>local time</span></div>
    <div className="full-itinerary-marker" aria-hidden="true"><span>{item.kind === "transportation" ? "✈" : "●"}</span></div>
    <div className="full-itinerary-card">
      <span className="full-itinerary-kind">{item.kind === "transportation" ? "Booked transportation" : "Activity"}</span>
      <h5>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title} ↗</a> : item.title}</h5>
      <p className="full-itinerary-location">{item.location}</p>
      {item.detail && <p>{item.detail}</p>}
      {item.reference && <p><strong>Booking reference:</strong> {item.reference}</p>}
      {item.favorite ? <IdeaItinerary favorite={item.favorite} disabled={false} compact />
        : item.notes && <p className="full-itinerary-notes">{item.notes}</p>}
    </div>
  </li>;
}

export function TripItinerary({ tripId, route, plan, onOpenTransportation, onOpenInterests, onSaveTrip }: {
  tripId?: Id<"trips">;
  route: TripRoute;
  plan?: Doc<"trips">["flightPlan"];
  onOpenTransportation: () => void;
  onOpenInterests: () => void;
  onSaveTrip?: () => Promise<Id<"trips"> | null>;
}) {
  const favorites = useQuery(api.interestJobs.favorites, tripId ? { tripId } : "skip");
  const days = itineraryDays(route, plan?.legs, favorites);
  const datedDays = days.filter(day => day.date);
  const unscheduled = days.find(day => !day.date)?.items ?? [];
  const itemCount = days.reduce((count, day) => count + day.items.length, 0);
  const staleBookings = plan?.legs.some(leg => leg.booked && leg.itinerary !== flightPlanItinerary(route));

  return <section className="full-itinerary" aria-labelledby="full-itinerary-title">
    <div className="full-itinerary-heading">
      <div><h3 id="full-itinerary-title">Your itinerary</h3></div>
      <div className="full-itinerary-summary"><strong>{itemCount}</strong><span>{itemCount === 1 ? "plan" : "plans"}</span></div>
    </div>
    <div className="full-itinerary-dates">
      <span>{dateLabel(route.startDate)}</span><span aria-hidden="true">→</span><span>{dateLabel(route.endDate)}</span>
    </div>
    {staleBookings && <p className="transport-stale" role="status">Some booked transportation belongs to an earlier route or set of dates and is not shown. Update it in Transportation.</p>}
    {favorites === undefined && tripId && <p role="status">Loading itinerary activities…</p>}
    {favorites !== undefined && !itemCount && <div className="full-itinerary-empty">
      <h4>Your schedule is ready to take shape</h4>
      <div className="button-row"><button type="button" className="secondary-button" onClick={onOpenTransportation}>Plan transportation</button>
        <button type="button" className="secondary-button" onClick={onOpenInterests}>Find activities</button></div>
    </div>}
    {!!datedDays.length && <div className="full-itinerary-days">{datedDays.map(day => <section className="full-itinerary-day" key={day.date}>
      <header><span>{dateLabel(day.date!).split(",")[0]}</span><h4>{dateLabel(day.date!).replace(/^[^,]+, /, "")}</h4></header>
      <ol>{day.items.map(item => <ItineraryEntry key={item.id} item={item} />)}</ol>
    </section>)}</div>}
    {!!unscheduled.length && <section className="full-itinerary-unscheduled">
      <div><h4>Still to schedule</h4></div>
      <ol>{unscheduled.map(item => <ItineraryEntry key={item.id} item={item} />)}</ol>
    </section>}
    {tripId && onSaveTrip && <ItineraryEmailAction tripId={tripId} onSaveTrip={onSaveTrip} />}
    {!!itemCount && <div className="full-itinerary-actions"><span>Need to make a change?</span>
      <button type="button" className="text-button" onClick={onOpenTransportation}>Edit transportation</button>
      <button type="button" className="text-button" onClick={onOpenInterests}>Edit activities</button></div>}
  </section>;
}
