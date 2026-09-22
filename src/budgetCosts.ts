import { currentLocalDestinations, rideLabels } from "../convex/localTransportationFields";
import type { Doc } from "../convex/_generated/dataModel";
import type { FeeResult } from "../convex/extraFeeResearch";
import { transportationTotals } from "./budgetCalculations";

export const costCategories = [
  { id: "flights", label: "Flights", color: "#16CBC4" },
  { id: "transportation", label: "Local transportation", color: "#5265D8" },
  { id: "lodging", label: "Lodging", color: "#251F47" },
  { id: "restaurants", label: "Restaurants", color: "#E78B36" },
  { id: "activities", label: "Activities & tickets", color: "#9A63CE" },
  { id: "baggage", label: "Baggage", color: "#D85D85" },
  { id: "car", label: "Rental car & parking", color: "#39886C" },
] as const;
export type CostCategory = typeof costCategories[number]["id"];
export type CostEntry = { id: string; title: string; category: CostCategory; currency: string; cents: number; date?: string };
export const formatCost = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

export function budgetCosts(trip: Doc<"trips">, fees: FeeResult[] = [], lodgings: Doc<"lodgings">[] = []) {
  const transportation = transportationTotals(trip);
  const entries: CostEntry[] = [];
  for (const { leg, amount } of transportation.flights) {
    if (amount === null) continue;
    const cents = Math.round(amount * 100);
    if (leg.request.tripType === "round-trip") {
      const outgoing = Math.floor(cents / 2);
      entries.push({ id: `flight-${leg.index}-out`, title: leg.outbound.flight.airline, category: "flights", currency: "USD", cents: outgoing, date: leg.request.departureDate });
      entries.push({ id: `flight-${leg.index}-return`, title: leg.returning!.flight.airline, category: "flights", currency: "USD", cents: cents - outgoing, date: leg.request.returnDate });
    } else entries.push({ id: `flight-${leg.index}`, title: leg.outbound.flight.airline, category: "flights", currency: "USD", cents, date: leg.request.departureDate });
  }
  const localRides = currentLocalDestinations(trip).flatMap(({ destination, saved }) =>
    saved?.enabled ? saved.rides.map(ride => ({ ...ride, destination })) : []);
  for (const ride of localRides) {
    if (ride.count && ride.status === "priced" && ride.amount !== undefined && ride.currency) entries.push({
      id: `ride-${ride.destination}-${ride.mode}`, title: `${ride.destination} · ${rideLabels[ride.mode]}`,
      category: "transportation", currency: ride.currency, cents: Math.round(ride.amount * 100) * ride.count,
    });
  }
  for (const lodging of lodgings) if (lodging.totalCost !== undefined) entries.push({
    id: `lodging-${lodging._id}`, title: lodging.name, category: "lodging", currency: lodging.currency,
    cents: Math.round(lodging.totalCost * 100), date: lodging.checkInDate,
  });
  for (const fee of fees) if (fee.status === "priced" && fee.amount !== undefined && fee.currency) {
    entries.push({ id: fee.target.id, title: fee.target.title, category: fee.target.category, currency: fee.currency,
      cents: Math.round(fee.amount * 100) * fee.target.quantity, ...(fee.target.date ? { date: fee.target.date } : {}) });
  }
  return { ...summarizeCosts(entries),
    unknown: localRides.filter(ride => ride.count > 0 && ride.status !== "priced").length + fees.filter(fee => fee.status !== "priced").length +
      transportation.flights.filter(flight => flight.amount === null).length + lodgings.filter(lodging => lodging.totalCost === undefined).length,
    stale: transportation.staleCount };
}

export function summarizeCosts(entries: CostEntry[]) {
  return { entries, totals: totalCosts(entries),
    transportationTotals: totalCosts(entries.filter(entry => entry.category === "flights" || entry.category === "transportation")),
    extraFeeTotals: totalCosts(entries.filter(entry => !["flights", "transportation", "lodging"].includes(entry.category))),
    breakdown: costCategories.map(category => ({ ...category, totals: totalCosts(entries.filter(entry => entry.category === category.id)) })),
  };
}
export function convertBudgetCosts(costs: ReturnType<typeof budgetCosts>, currency: string, rates?: { base: string; rates: Record<string, number> }) {
  const entries: CostEntry[] = [];
  const scale = 10 ** new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits!;
  for (const entry of costs.entries) {
    if (entry.currency === currency) { entries.push(entry); continue; }
    const rate = rates?.base === currency ? rates.rates[entry.currency] : undefined;
    if (!rate || !Number.isFinite(rate) || rate <= 0) return null;
    const amount = Math.round(entry.cents / 100 / rate * scale) / scale;
    entries.push({ ...entry, currency, cents: Math.round(amount * 100) });
  }
  return { ...costs, ...summarizeCosts(entries) };
}

export function totalCosts(entries: CostEntry[]) {
  const cents: Record<string, number> = {};
  for (const entry of entries) cents[entry.currency] = (cents[entry.currency] ?? 0) + entry.cents;
  return Object.fromEntries(Object.entries(cents).map(([currency, amount]) => [currency, amount / 100]));
}

export function dailyCosts(startDate: string, endDate: string, entries: CostEntry[]) {
  const start = Date.parse(`${startDate}T00:00:00Z`), end = Date.parse(`${endDate}T00:00:00Z`);
  const length = Math.floor((end - start) / 86400000) + 1;
  if (!Number.isFinite(length) || length < 1 || length > 366) return null;
  const days = Array.from({ length }, (_, index) => ({ date: new Date(start + index * 86400000).toISOString().slice(0, 10), cents: 0 }));
  let unscheduledCents = 0;
  for (const entry of entries) {
    if (entry.date) {
      const day = days.find(day => day.date === entry.date);
      if (day) day.cents += entry.cents;
      else unscheduledCents += entry.cents;
    } else {
      const daily = Math.floor(entry.cents / length), remainder = entry.cents % length;
      days.forEach((day, index) => { day.cents += daily + (index < remainder ? 1 : 0); });
    }
  }
  return { days, unscheduledCents };
}
