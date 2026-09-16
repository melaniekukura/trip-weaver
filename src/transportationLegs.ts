import type { DestinationStop } from "./DestinationsEditor";

export function transportationLegs(origin: string, stops: DestinationStop[]) {
  return stops.map((stop, index) => ({
    id: stop.id, origin: index === 0 ? origin : stops[index - 1].value, destination: stop.value,
  }));
}

export function transportLocationLabel(value: string) {
  return value.split(" — ")[0].replace(/ \([^)]*\)$/, "").split(",")[0] || "Choose location";
}
