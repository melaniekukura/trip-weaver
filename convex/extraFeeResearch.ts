import type { Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { feeResult, feeSettings, feeTarget } from "./extraFeeSchema";
import { flightPlanItinerary } from "./flightPlanFields";
import { safeDiscoveryUrl } from "./interestSearch";

export type FeeResult = Infer<typeof feeResult>;
export type FeeTarget = Infer<typeof feeTarget>;
export const defaultFeeSettings: Infer<typeof feeSettings> = {
  bagsPerTraveler: 1, rentalCar: false, rentalProvider: "", parkingLocation: "", carDays: 1,
};

export function feeTargets(trip: Doc<"trips">, favorites: Doc<"interestFavorites">[]): FeeTarget[] {
  const settings = trip.extraFeeSettings ?? defaultFeeSettings;
  const targets: FeeTarget[] = [];
  for (const favorite of favorites.filter(item => item.itinerary !== undefined)) {
    const item = favorite.item;
    const date = favorite.itinerary?.date ?? `${trip.startDate} through ${trip.endDate}`;
    const restaurant = /restaurant|cafe|café|trattoria|dining/i.test(`${item.title} ${item.interest ?? ""}`);
    for (const booking of restaurant ? [false] : [false, true]) {
      const kind = restaurant ? "explicit fixed-price meal menu per adult (not individual dishes or drinks)" : booking ? "mandatory booking or service fee in addition to admission" : "standard adult admission ticket";
      targets.push({ id: `${favorite._id}-${booking ? "booking" : "ticket"}`, category: restaurant ? "restaurants" : "activities",
        title: `${item.title} · ${restaurant ? "Meal" : booking ? "Booking fees" : "Tickets"}`, quantity: trip.travelers, unit: "per person",
        ...(favorite.itinerary?.date ? { date: favorite.itinerary.date } : {}),
        query: `${item.title} ${item.destination} official ${kind} ${date}`.slice(0, 500), ...(item.url.length <= 1000 ? { sourceUrl: item.url } : {}),
        context: `Find the ${kind} for ${item.title} in ${item.destination} on ${date}. ${restaurant ? "Only a complete fixed-price meal menu, never individual dish prices or a presumed meal total." : booking ? "Only mandatory fees not already included in the ticket price. Do not use the ticket amount itself." : "Do not use child, resident, member, package, restaurant menu, or optional upgrade prices."} If this activity is not ticketed or the fee is not stated, return unknown unless the source explicitly confirms free admission/no additional fee. Quote one person's price; do not multiply by travelers.`,
      });
    }
  }
  for (const leg of trip.flightPlan?.legs.filter(leg => leg.itinerary === flightPlanItinerary(trip)) ?? []) {
    if (!settings.bagsPerTraveler) continue;
    for (const [direction, source] of [["Outgoing", leg.outbound], ["Return", leg.returning]] as const) {
      if (!source) continue;
      for (let bag = 1; bag <= settings.bagsPerTraveler; bag++) {
        targets.push({ id: `bag-${leg.index}-${direction}-${bag}`, category: "baggage",
          title: `${source.flight.airline} · ${direction} · Checked bag ${bag}`, quantity: trip.travelers, unit: "per person / leg",
          date: direction === "Outgoing" ? leg.request.departureDate : leg.request.returnDate ?? trip.endDate,
          query: `${source.flight.airline} official checked baggage fees ${leg.request.origin} ${leg.request.destination} economy bag ${bag}`.slice(0, 500),
          context: `Find the additional fee for checked bag number ${bag}, standard weight, on ${source.flight.airline}, ${direction === "Outgoing" ? `${leg.request.origin} to ${leg.request.destination}` : `${leg.request.destination} to ${leg.request.origin}`} on ${direction === "Outgoing" ? leg.request.departureDate : leg.request.returnDate}. Economy including basic fares; specific fare brand, ticket issue date, and traveler status are UNKNOWN. Do not assume an allowance or free bags. If the fee depends on missing information or a range, return unknown. Do not reuse a first-bag price for a second bag. Price one bag on this direction, not the round trip.`,
        });
      }
    }
  }
  if (settings.rentalCar) {
    const city = trip.destinations[0] ?? trip.origin;
    targets.push({ id: "parking", category: "car", title: "Parking", quantity: settings.carDays, unit: "per day",
      query: `${settings.parkingLocation || city} official daily parking rates`.slice(0, 500),
      context: `Find the daily parking rate for ${settings.parkingLocation || `an unspecified parking location in ${city}`} during ${trip.startDate} through ${trip.endDate}. ${settings.parkingLocation ? "Match that exact location." : "The parking location is unknown: return unknown, not a rate from an arbitrary car park."} Do not convert hourly rates to daily rates or count refundable deposits.`,
    });
    targets.push({ id: "rental-fees", category: "car", title: "Additional rental-car fees", quantity: settings.carDays, unit: "per day",
      query: `${settings.rentalProvider || "rental car"} ${city} official mandatory daily additional rental fees`.slice(0, 500),
      context: `Find mandatory fixed daily additional fees for ${settings.rentalProvider || "an unknown rental provider"} in ${city} during ${trip.startDate} through ${trip.endDate}. Exclude base rental price, fuel, refundable deposits, parking and optional insurance. ${settings.rentalProvider ? "Vehicle class and pickup office are unknown." : "Provider is unknown, so return unknown."} If tax depends on the unknown rental price, mileage, vehicle or contract, return unknown. Never combine alternative fees or invent a daily total.`,
    });
  }
  return targets;
}

export async function feeSearchKey(targets: FeeTarget[]) {
  const bytes = new TextEncoder().encode(JSON.stringify(["extra-fees-v1", targets]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export const feeExtractionSchema = {
  type: "object", properties: {
    official: { type: "boolean" }, applicable: { type: "boolean" },
    amount: { type: ["number", "null"] }, currency: { type: ["string", "null"] },
    evidence: { type: ["string", "null"] }, note: { type: "string" },
  }, required: ["official", "applicable", "amount", "currency", "evidence", "note"], additionalProperties: false,
};

export function parseFeeQuote(raw: unknown, markdown: string, sourceUrl: string) {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const url = safeDiscoveryUrl(sourceUrl);
  const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
  const evidence = typeof data.evidence === "string" ? data.evidence.trim() : "";
  const currency = typeof data.currency === "string" ? data.currency.toUpperCase() : "";
  const amount = data.amount;
  const currencies: Record<string, RegExp> = { USD: /USD|US\$/, EUR: /EUR|€/, GBP: /GBP|£/, CAD: /CAD|CA\$|C\$/, AUD: /AUD|AU\$|A\$/, JPY: /JPY|円/, CHF: /CHF/, CNY: /CNY|RMB/, KRW: /KRW|₩/, INR: /INR|₹/, MXN: /MXN/, BRL: /BRL|R\$/, SGD: /SGD|S\$/, NZD: /NZD|NZ\$/, THB: /THB|฿/ };
  const numbers = [...evidence.matchAll(/\d+(?:[.,]\d+)*/g)].map(match => Number(match[0].replace(/,(?=\d{3}(?:\D|$))/g, "").replace(",", ".")));
  const explicitFree = /\bfree\b|no (?:additional |booking |service )?fee|included at no (?:extra |additional )?cost/i.test(evidence);
  if (!url || data.official !== true || data.applicable !== true || typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 1000000 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 0.0001 || !currencies[currency]?.test(evidence) ||
    !evidence || evidence.length > 500 || !normalized(markdown).includes(normalized(evidence)) ||
    (amount === 0 ? !explicitFree : !numbers.includes(amount))) return null;
  return { amount, currency, evidence, sourceUrl: url, note: typeof data.note === "string" ? data.note.slice(0, 300) : "" };
}

export function feeSubtotals(results: FeeResult[]) {
  const categories = ["activities", "restaurants", "baggage", "car"] as const;
  return categories.map(category => {
    const rows = results.filter(row => row.target.category === category);
    const amounts: Record<string, number> = {};
    for (const row of rows) if (row.status === "priced" && row.currency && row.amount !== undefined) {
      amounts[row.currency] = (amounts[row.currency] ?? 0) + Math.round(row.amount * 100) * row.target.quantity;
    }
    return { category, unknown: rows.filter(row => row.status !== "priced").length,
      amounts: Object.fromEntries(Object.entries(amounts).map(([currency, cents]) => [currency, cents / 100])) };
  });
}
