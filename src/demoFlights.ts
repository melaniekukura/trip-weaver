export type DemoFlight = {
  id: string;
  airline: string;
  departureTime: string;
  durationMinutes: number;
  stops: number;
  priceUsd: number;
};

export const demoFlights: readonly DemoFlight[] = [
  { id: "demo-1", airline: "Northstar Air", departureTime: "14:20", durationMinutes: 540, stops: 0, priceUsd: 620 },
  { id: "demo-2", airline: "Horizon Airways", departureTime: "06:15", durationMinutes: 780, stops: 1, priceUsd: 385 },
  { id: "demo-3", airline: "Coastal Air", departureTime: "11:40", durationMinutes: 610, stops: 1, priceUsd: 475 },
  { id: "demo-4", airline: "Atlas Airways", departureTime: "08:30", durationMinutes: 690, stops: 1, priceUsd: 420 },
  { id: "demo-5", airline: "Summit Air", departureTime: "17:05", durationMinutes: 560, stops: 0, priceUsd: 710 },
];

export function lowestPricedFlights(flights: readonly DemoFlight[]): DemoFlight[] {
  return flights.filter((flight) => Number.isFinite(flight.priceUsd) && flight.priceUsd >= 0)
    .sort((a, b) => a.priceUsd - b.priceUsd).slice(0, 3);
}
