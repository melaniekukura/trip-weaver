import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { emptyFlightFilters } from "./flightFilters";
import type { FlightFilters } from "./flightFilters";
export function useOptionalProfile() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.profile.get, isAuthenticated ? {} : "skip");
}
export function useDefaultOrigin(initial?: string) {
  const profile = useOptionalProfile();
  const [choice, setChoice] = useState<string | undefined>(initial);
  return [choice ?? profile?.defaultAirport ?? "", setChoice, profile?.defaultAirport ?? undefined] as const;
}
export function profileFlightFilters(maxConnections?: number | null): FlightFilters {
  const stops = maxConnections === 0 ? "nonstop" : maxConnections === 1 ? "max-one"
    : maxConnections === 2 ? "max-two" : maxConnections === 3 ? "max-three" : "any";
  return { ...emptyFlightFilters, stops };
}
export function useProfileFlightFilters() {
  const profile = useOptionalProfile();
  const [choice, setChoice] = useState<FlightFilters | null>(null);
  return [choice ?? profileFlightFilters(profile?.maxConnections), setChoice] as const;
}
