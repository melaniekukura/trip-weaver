export type LocationOption = {
  id: string;
  city: string;
  country: string;
  airport?: string;
  code?: string;
};

type CityEntry = [string, string, [string, string][]];
const cities: CityEntry[] = [
  ["Detroit", "United States", [["DTW", "Detroit Metropolitan"]]],
  ["New York", "United States", [["JFK", "John F. Kennedy"], ["LGA", "LaGuardia"], ["EWR", "Newark Liberty"]]],
  ["Chicago", "United States", [["ORD", "O'Hare"], ["MDW", "Midway"]]],
  ["Los Angeles", "United States", [["LAX", "Los Angeles International"], ["BUR", "Hollywood Burbank"]]],
  ["San Francisco", "United States", [["SFO", "San Francisco International"]]],
  ["Boston", "United States", [["BOS", "Logan International"]]],
  ["London", "United Kingdom", [["LHR", "Heathrow"], ["LGW", "Gatwick"], ["STN", "Stansted"], ["LTN", "Luton"], ["LCY", "London City"], ["SEN", "Southend"]]],
  ["Paris", "France", [["CDG", "Charles de Gaulle"], ["ORY", "Orly"]]],
  ["Lisbon", "Portugal", [["LIS", "Humberto Delgado"]]],
  ["Porto", "Portugal", [["OPO", "Francisco Sá Carneiro"]]],
  ["Madrid", "Spain", [["MAD", "Adolfo Suárez Madrid–Barajas"]]],
  ["Barcelona", "Spain", [["BCN", "Josep Tarradellas Barcelona–El Prat"]]],
  ["Rome", "Italy", [["FCO", "Fiumicino"], ["CIA", "Ciampino"]]],
  ["Amsterdam", "Netherlands", [["AMS", "Schiphol"]]],
  ["Tokyo", "Japan", [["HND", "Haneda"], ["NRT", "Narita"]]],
  ["Osaka", "Japan", [["KIX", "Kansai International"], ["ITM", "Osaka Itami"]]],
  ["Toronto", "Canada", [["YYZ", "Pearson International"], ["YTZ", "Billy Bishop"]]],
  ["Vancouver", "Canada", [["YVR", "Vancouver International"]]],
  ["Sydney", "Australia", [["SYD", "Sydney Kingsford Smith"]]],
  ["Singapore", "Singapore", [["SIN", "Changi"]]],
];

export const locations: LocationOption[] = cities.flatMap(([city, country, airports]) => [
  { id: `city-${city}`, city, country },
  ...airports.map(([code, airport]) => ({ id: code, city, country, code, airport })),
]);

export function locationValue(location: LocationOption): string {
  return location.code ? `${location.city} — ${location.airport} (${location.code})` : `${location.city} (all airports)`;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function searchLocations(query: string): LocationOption[] {
  const search = normalize(query);
  if (!search) return locations.filter((location) => !location.code).slice(0, 6);
  return locations.filter((location) => normalize(`${location.city} ${location.country} ${location.airport ?? ""} ${location.code ?? ""}`).includes(search)).slice(0, 30);
}

export function moveDestination<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || to < 0 || from >= result.length || to >= result.length) return result;
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}
