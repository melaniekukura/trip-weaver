import type { Doc } from "../convex/_generated/dataModel";
import type { FeeResult } from "../convex/extraFeeResearch";
import { transportationTotals } from "./budgetCalculations";

export const costCategories = [
  { id: "flights", label: "Flights", color: "#16CBC4" },
  { id: "transportation", label: "Local transportation", color: "#5265D8" },
  { id: "restaurants", label: "Restaurants", color: "#E78B36" },
  { id: "activities", label: "Activities & tickets", color: "#9A63CE" },
  { id: "baggage", label: "Baggage", color: "#D85D85" },
  { id: "car", label: "Rental car & parking", color: "#39886C" },
] as const;
export type CostCategory = typeof costCategories[number]["id"];
export type CostEntry = { id: string; title: string; category: CostCategory; currency: string; cents: number; date?: string };
export const formatCost = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

export function budgetCosts(trip: Doc<"trips">, fees: FeeResult[] = []) {
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
  if (trip.transportationBudget?.includeRides) for (const ride of transportation.rides) {
    if (ride.count) entries.push({ id: `ride-${ride.mode}`, title: ride.label, category: "transportation", currency: "USD", cents: Math.round(ride.price * 100) * ride.count });
  }
  for (const fee of fees) if (fee.status === "priced" && fee.amount !== undefined && fee.currency) {
    entries.push({ id: fee.target.id, title: fee.target.title, category: fee.target.category, currency: fee.currency,
      cents: Math.round(fee.amount * 100) * fee.target.quantity, ...(fee.target.date ? { date: fee.target.date } : {}) });
  }
  const totals: Record<string, number> = {};
  for (const entry of entries) totals[entry.currency] = (totals[entry.currency] ?? 0) + entry.cents;
  return { entries, totals: Object.fromEntries(Object.entries(totals).map(([currency, cents]) => [currency, cents / 100])),
    unknown: fees.filter(fee => fee.status !== "priced").length + transportation.flights.filter(flight => flight.amount === null).length,
    stale: transportation.staleCount };
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
