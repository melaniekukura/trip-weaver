export type FlightFilters = {
  departureFrom: string;
  departureTo: string;
  arrivalFrom: string;
  arrivalTo: string;
  stops: "any" | "nonstop" | "one" | "multiple";
  maxPrice: string;
};

export const emptyFlightFilters: FlightFilters = {
  departureFrom: "", departureTo: "", arrivalFrom: "", arrivalTo: "", stops: "any", maxPrice: "",
};

type FilterableFlight = { departure: string; arrival: string; stops: string; amount: number };

function clockMinutes(label: string): number | null {
  const match = label.match(/^(\d{1,2}):(\d{2}) (AM|PM)\b/);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) return null;
  return (Number(match[1]) % 12 + (match[3] === "PM" ? 12 : 0)) * 60 + Number(match[2]);
}

function inputMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function withinHours(label: string, from: string, to: string) {
  if (!from && !to) return true;
  const minutes = clockMinutes(label);
  if (minutes === null) return false;
  const lower = from ? inputMinutes(from) : 0;
  const upper = to ? inputMinutes(to) : 1439;
  return lower <= upper ? minutes >= lower && minutes <= upper : minutes >= lower || minutes <= upper;
}

export function flightFilterError(filters: FlightFilters): string | null {
  if (filters.maxPrice !== "" && (!Number.isFinite(Number(filters.maxPrice)) || Number(filters.maxPrice) < 0)) {
    return "Enter a maximum price of zero or more.";
  }
  return null;
}

export function matchesFlightFilters(flight: FilterableFlight, filters: FlightFilters) {
  const stopCount = flight.stops === "Nonstop" ? 0 : Number(flight.stops.match(/^(\d+) stops?$/)?.[1]);
  if (filters.stops === "nonstop" && stopCount !== 0) return false;
  if (filters.stops === "one" && stopCount !== 1) return false;
  if (filters.stops === "multiple" && !(stopCount >= 2)) return false;
  if (filters.maxPrice !== "" && !flightFilterError(filters) && flight.amount > Number(filters.maxPrice)) return false;
  return withinHours(flight.departure, filters.departureFrom, filters.departureTo) &&
    withinHours(flight.arrival, filters.arrivalFrom, filters.arrivalTo);
}
