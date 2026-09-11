import { ConvexError } from "convex/values";
import type { AirportScope, FlightRequest } from "./flightSearch";

function unavailable(): never {
  throw new ConvexError({ code: "AIRPORT_LOOKUP_FAILED", message: "City airports could not be verified. Please try again." });
}

export function cityAirportCodes(data: unknown, cityCode: string): string[] {
  if (!Array.isArray(data)) return unavailable();
  const codes = new Set<string>();
  for (const record of data) {
    if (record && typeof record === "object" && record.city_code === cityCode && record.iata_type === "airport" &&
      record.flightable === true && typeof record.code === "string" && /^[A-Z]{3}$/.test(record.code)) codes.add(record.code);
  }
  if (!codes.size) return unavailable();
  return [...codes].sort();
}

export async function resolveAirportScope(request: FlightRequest): Promise<AirportScope> {
  const scope = { origin: [request.origin], destination: [request.destination] };
  if (request.originType !== "city" && request.destinationType !== "city") return scope;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("https://api.travelpayouts.com/data/en/airports.json", { signal: controller.signal });
    if (!response.ok) return unavailable();
    const data: unknown = await response.json();
    return {
      origin: request.originType === "city" ? cityAirportCodes(data, request.origin) : scope.origin,
      destination: request.destinationType === "city" ? cityAirportCodes(data, request.destination) : scope.destination,
    };
  } catch { return unavailable(); }
  finally { clearTimeout(timer); }
}
