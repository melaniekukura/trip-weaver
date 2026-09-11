import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import { flightLocation } from "./locations";

export type FlightResearch = NonNullable<FunctionReturnType<typeof api.flightJobs.latest>>;

export function lowestFlightSources(sources: FlightResearch["sources"]) {
  return sources.filter((source) => source.flight && Number.isFinite(source.flight.amount) && source.flight.amount > 0)
    .sort((a, b) => a.flight!.amount - b.flight!.amount).slice(0, 3);
}

export function flightRequestFromTrip(originValue: string, destinationValue: string, departureDate: string) {
  const from = flightLocation(originValue);
  const to = flightLocation(destinationValue);
  if (!from || !to) throw new Error("Select your departure and arrival city or airport from the live suggestions in Destinations.");
  if (from.code === to.code) throw new Error("Choose different departure and arrival locations.");
  const departure = Date.parse(`${departureDate}T00:00:00Z`);
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate) || !Number.isFinite(departure) ||
    new Date(departure).toISOString().slice(0, 10) !== departureDate || departure < today || departure > today + 330 * 86400000) {
    throw new Error("Choose a departure date within the next 330 days in Overview.");
  }
  return { origin: from.code, destination: to.code, departureDate,
    ...(from.type === "city" ? { originType: "city" as const } : {}),
    ...(to.type === "city" ? { destinationType: "city" as const } : {}),
  };
}
