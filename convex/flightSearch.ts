import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";

const locationType = v.union(v.literal("airport"), v.literal("city"));
export const flightRequest = v.object({
  origin: v.string(), destination: v.string(), departureDate: v.string(),
  originType: v.optional(locationType), destinationType: v.optional(locationType),
  tripType: v.optional(v.union(v.literal("one-way"), v.literal("round-trip"))), returnDate: v.optional(v.string()),
});
export type AirportScope = { origin: string[]; destination: string[] };
export type FlightRequest = Infer<typeof flightRequest>;
export const flightOption = v.object({
  airline: v.string(), departure: v.string(), arrival: v.string(), duration: v.string(),
  stops: v.string(), amount: v.number(), currency: v.literal("USD"),
  originAirport: v.optional(v.string()), destinationAirport: v.optional(v.string()),
});

export function validateFlightRequest(input: FlightRequest): FlightRequest {
  const origin = input.origin.trim().toUpperCase();
  const destination = input.destination.trim().toUpperCase();
  const date = new Date(`${input.departureDate}T00:00:00Z`);
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || origin === destination ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.departureDate) || !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== input.departureDate) {
    throw new ConvexError({ code: "INVALID_FLIGHT_SEARCH", message: "Enter different three-letter airport or city codes and a valid departure date." });
  }
  const normalized: FlightRequest = { origin, destination, departureDate: input.departureDate,
    ...(input.originType === "city" ? { originType: "city" as const } : {}),
    ...(input.destinationType === "city" ? { destinationType: "city" as const } : {}),
  };
  if (input.tripType === "round-trip") {
    const returning = new Date(`${input.returnDate}T00:00:00Z`);
    if (!input.returnDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.returnDate) ||
      !Number.isFinite(returning.getTime()) || returning.toISOString().slice(0, 10) !== input.returnDate ||
      input.returnDate < input.departureDate) {
      throw new ConvexError({ code: "INVALID_FLIGHT_SEARCH", message: "Choose a valid return date on or after departure." });
    }
    return { ...normalized, tripType: "round-trip", returnDate: input.returnDate };
  }
  if (input.returnDate) throw new ConvexError({ code: "INVALID_FLIGHT_SEARCH", message: "Choose round trip to include a return date." });
  return normalized;
}

export function flightSearchUrl(input: FlightRequest) {
  const request = validateFlightRequest(input);
  const date = new Date(`${request.departureDate}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const url = new URL("https://www.google.com/travel/flights");
  url.searchParams.set("hl", "en"); url.searchParams.set("curr", "USD");
  const returning = request.returnDate ? new Date(`${request.returnDate}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : null;
  const journey = returning ? `returning ${returning} round trip` : "one way";
  url.searchParams.set("q", `Flights from ${request.origin} to ${request.destination} on ${date} ${journey} 1 adult economy`);
  return url.href;
}

export function parseFlightPage(markdown: string, input: FlightRequest, scope?: AirportScope): Infer<typeof flightOption>[] {
  const request = validateFlightRequest(input);
  if ((request.originType === "city" || request.destinationType === "city") && !scope) {
    throw new ConvexError({ code: "AIRPORT_LOOKUP_FAILED", message: "City airports could not be verified." });
  }
  const originAirports = new Set(request.originType === "city" ? scope!.origin : [request.origin]);
  const destinationAirports = new Set(request.destinationType === "city" ? scope!.destination : [request.destination]);
  const text = markdown.replace(/\u00a0/g, " ").replace(/[\u200b-\u200d]/g, "").replace(/\n[ \t]*\n+/g, "\n");
  const header = text.split("## Filters")[0];
  const fail = (): never => { throw new ConvexError({ code: "FLIGHTS_UNAVAILABLE", message: "Matching flight prices could not be verified. Try again or open Google Flights." }); };
  const roundTrip = request.tripType === "round-trip";
  const journeyLabel = roundTrip ? "Round trip" : "One way";
  const datesLabel = `departing ${request.departureDate}${roundTrip ? ` and returning ${request.returnDate}` : ""}`;
  if (!header.includes(`# Flight search\n${journeyLabel}\n`) || !/\nEconomy(?: \(include Basic\))?\n/.test(header) ||
    !text.includes("Prices include required taxes + fees for 1 adult.") || !/Currency\s*USD\b/.test(text) ||
    !text.includes(`${datesLabel}\n`)) return fail();
  const dateLabel = new Date(`${request.departureDate}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
  const blocks = text.split(/\n- (?=\d{1,2}:\d{2} [AP]M\n)/).slice(1);
  const flights: Infer<typeof flightOption>[] = [];
  for (const block of blocks) {
    const listing = block.split(/\n(?:###|Track prices|Departure)/)[0];
    const lines = listing.split("\n").map((line) => line.trim()).filter(Boolean);
    const departure = lines[1];
    const arrival = lines[3];
    const airline = lines[4];
    const duration = lines[5];
    const amount = listing.match(roundTrip
      ? /\n\$([\d,]+(?:\.\d{2})?)\nround trip(?:\n|$)/
      : /\n\$([\d,]+(?:\.\d{2})?)(?:\n(?!round trip)|$)/);
    const stops = lines.find((line) => /^(Nonstop|\d+ stops?)$/.test(line));
    if (!departure?.endsWith(`on ${dateLabel}`) || !/^\d{1,2}:\d{2} [AP]M on [A-Za-z]{3}, [A-Za-z]{3} \d{1,2}$/.test(arrival ?? "") ||
      !airline || airline.length > 200 || !/^(\d+ hr(?: \d+ min)?|\d+ min)$/.test(duration ?? "") ||
      !originAirports.has(lines[6]) || lines[8] !== "–" || !destinationAirports.has(lines[9]) || !amount || !stops) continue;
    const price = Number(amount[1].replaceAll(",", ""));
    if (!Number.isFinite(price) || price <= 0) continue;
    const option = { airline, departure, arrival, duration, stops, amount: price, currency: "USD" as const,
      originAirport: lines[6], destinationAirport: lines[9] };
    if (!flights.some((flight) => JSON.stringify(flight) === JSON.stringify(option))) flights.push(option);
  }
  if (flights.length === 0) return fail();
  return flights.sort((a, b) => a.amount - b.amount).slice(0, 5);
}
