import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { emptyFlightFilters } from "./flightFilters";
import type { FlightFilters } from "./flightFilters";
export function useDefaultOrigin(initial?: string, loadProfile = true) {
  const profile = useQuery(api.profile.get, loadProfile ? {} : "skip");
  const [choice, setChoice] = useState<string | undefined>(initial);
  return [choice ?? profile?.defaultAirport ?? "", setChoice] as const;
}
export function profileFlightFilters(maxConnections?: number | null): FlightFilters {
  const stops = maxConnections === 0 ? "nonstop" : maxConnections === 1 ? "max-one"
    : maxConnections === 2 ? "max-two" : maxConnections === 3 ? "max-three" : "any";
  return { ...emptyFlightFilters, stops };
}
export function useProfileFlightFilters() {
  const profile = useQuery(api.profile.get, {});
  const [choice, setChoice] = useState<FlightFilters | null>(null);
  return [choice ?? profileFlightFilters(profile?.maxConnections), setChoice] as const;
}
