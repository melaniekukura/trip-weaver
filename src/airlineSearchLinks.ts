import { airlineNames } from "../convex/airlineNames";

const airlines = [
  { key: "delta", name: "Delta", url: "https://www.delta.com/flightsearch/book-a-flight" },
  { key: "air europa", name: "Air Europa", url: "https://www.aireuropa.com/us/en/home" },
  { key: "united", name: "United", url: "https://www.united.com/en/us" },
  { key: "lufthansa", name: "Lufthansa", url: "https://www.lufthansa.com/us/en/homepage" },
  { key: "american", name: "American Airlines", url: "https://www.aa.com/" },
  { key: "british airways", name: "British Airways", url: "https://www.britishairways.com/" },
];

export function airlineSearchLinks(labels: string[]) {
  const names = new Set(labels.flatMap(airlineNames));
  return airlines.filter(airline => names.has(airline.key));
}
