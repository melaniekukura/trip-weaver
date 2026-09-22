export type RequiredTripField = "name" | "startDate" | "endDate" | "travelers" | "origin" | "destination";

function validDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value && value >= "1900-01-01";
}

export function invalidRequiredTripFields(details: {
  name: string;
  origin: string;
  destinations: string[];
  startDate: string;
  endDate: string;
  travelers: string;
}): Record<RequiredTripField, boolean> {
  const startValid = validDate(details.startDate);
  const travelerCount = Number(details.travelers);
  return {
    name: !details.name.trim(),
    startDate: !startValid,
    endDate: !validDate(details.endDate) || (startValid && details.endDate < details.startDate),
    travelers: !Number.isInteger(travelerCount) || travelerCount < 1 || travelerCount > 100,
    origin: !details.origin.trim(),
    destination: details.destinations.length === 0 || details.destinations.some(value => !value.trim()),
  };
}
