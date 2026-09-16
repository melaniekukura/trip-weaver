import type { Infer } from "convex/values";
import type { discoveryKind } from "./interestSchema";

type Search = { destination: string; startDate: string; endDate: string; interests: string[]; kind: Infer<typeof discoveryKind> };

export function interestSearchKey(search: Search) {
  return JSON.stringify(["interests-v6-dining", search.destination, search.kind, search.startDate, search.endDate,
    [...new Set(search.interests.map(value => value.trim().toLowerCase()))].sort()]);
}

export const foodInterest = (interest: string) => /food|cook|culinar|gastron|restaurant|dining/i.test(interest);

export function interestQuery(search: Search, kind: "activities" | "events", restaurants?: "local" | "tasting") {
  const destination = search.destination.split(" — ")[0].replace(/\s*\([^)]*\)$/, "");
  const interest = search.interests.join(", ").slice(0, 180);
  const dateLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const eventTopic = /museum|art|history/i.test(interest) ? "museum exhibitions" : /food|cook|culinar|gastron|restaurant|dining/i.test(interest) ? "food festivals" : "events exhibitions festivals";
  if (restaurants) return `${destination} ${restaurants === "tasting" ? "restaurants tasting menu" : "restaurants local cuisine trattoria"} official menu -tours -classes -site:facebook.com -site:reddit.com -site:youtube.com -site:yelp.com`.slice(0, 500);
  const topic = kind === "events" ? `${eventTopic} ${dateLabel(search.startDate)} through ${dateLabel(search.endDate)} official calendar`
    : /food|cook|culinar|gastron|restaurant|dining/i.test(interest) ? "restaurants local dining menus food markets cooking classes local food experiences official"
    : /museum|art|history/i.test(interest) ? "museum exhibitions collections official opening hours"
    : "places experiences official visitor information";
  return `${kind === "events" ? `"${destination.split(",")[0]}" ${destination}` : destination} ${topic}${interest && kind !== "events" ? ` ${interest}` : ""} official details -"top 10" -"best things to do"`.slice(0, 500);
}

export function safeDiscoveryUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || value.length > 4000) return null;
    if (!url.hostname.includes(".") || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes(":") ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

export function discoveryPreview(value: string) {
  const plain = value.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/[#*_`\\]/g, "").replace(/\s+/g, " ").trim();
  return plain.length > 420 ? `${plain.slice(0, 417).replace(/\s+\S*$/, "")}…` : plain;
}
