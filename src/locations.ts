export type LocationOption = {
  id: string;
  city: string;
  country: string;
  airport?: string;
  code?: string;
  cityCode?: string;
};

export function locationValue(location: LocationOption): string {
  if (!location.code) return `${location.city}, ${location.country} (${location.cityCode}; all airports)`;
  const suffix = ` (${location.code})`;
  return `${location.city} — ${location.airport}`.slice(0, 120 - suffix.length) + suffix;
}

export function airportCode(value: string): string | null {
  if (/all airports/i.test(value)) return null;
  return value.trim().match(/(?:^|\()([A-Z]{3})\)?$/i)?.[1].toUpperCase() ?? null;
}

export function flightLocation(value: string): { code: string; type: "city" | "airport" } | null {
  const city = value.match(/\(([A-Z]{3}); all airports\)$/i);
  if (city) return { code: city[1].toUpperCase(), type: "city" };
  const code = airportCode(value);
  return code ? { code, type: "airport" } : null;
}

export function locationSearchTerm(value: string): string {
  return airportCode(value) ?? value.split(" — ")[0].replace(/ \([^)]*all airports\)$/, "").split(",")[0];
}

export function parseLocations(data: unknown): LocationOption[] {
  if (!Array.isArray(data)) throw new Error("Location search returned an unexpected response.");
  const options = new Map<string, LocationOption>();
  for (const item of data) {
    if (!item || typeof item !== "object" || typeof item.code !== "string" || !/^[A-Z]{3}$/.test(item.code) ||
      typeof item.name !== "string" || typeof item.country_name !== "string") continue;
    if (item.type === "city") {
      options.set(`city-${item.code}`, { id: `city-${item.code}`, city: item.name, country: item.country_name, cityCode: item.code });
      if (typeof item.main_airport_name === "string" && item.main_airport_name) {
        options.set(item.code, { id: item.code, city: item.name, country: item.country_name,
          code: item.code, airport: item.main_airport_name });
      }
    } else if (item.type === "airport" && typeof item.city_name === "string") {
      options.set(item.code, { id: item.code, city: item.city_name, country: item.country_name,
        code: item.code, airport: item.name, cityCode: item.city_code });
    }
  }
  return [...options.values()].filter((option) => locationValue(option).length <= 120).slice(0, 40);
}

const cache = new Map<string, { expires: number; options: LocationOption[] }>();

export async function searchLocations(query: string, signal?: AbortSignal): Promise<LocationOption[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const cached = cache.get(term.toLowerCase());
  if (cached && cached.expires > Date.now()) return cached.options;
  const url = new URL("https://autocomplete.travelpayouts.com/places2");
  url.searchParams.set("term", term);
  url.searchParams.set("locale", "en");
  url.searchParams.append("types[]", "city");
  url.searchParams.append("types[]", "airport");
  const response = await fetch(url, { signal, credentials: "omit" });
  if (!response.ok) throw new Error("Location search is unavailable. Please try again.");
  const options = parseLocations(await response.json());
  if (cache.size >= 50) cache.delete(cache.keys().next().value!);
  cache.set(term.toLowerCase(), { expires: Date.now() + 300_000, options });
  return options;
}

export function moveDestination<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || to < 0 || from >= result.length || to >= result.length) return result;
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}
