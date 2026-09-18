import { validateTrip } from "../convex/tripFields";
export function tripCreationReady(details: { name: string; origin: string; destinations: string[]; startDate: string; endDate: string; travelers: number }) {
  try {
    validateTrip({ ...details, budget: null, currency: "USD", interests: [] });
    return true;
  } catch { return false; }
}
