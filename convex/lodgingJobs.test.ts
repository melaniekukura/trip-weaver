/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workpool from "@convex-dev/workpool/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { isRelevantLodgingResult } from "./lodgingJobs";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const trip = { name: "California", origin: "DTW", destinations: ["Los Angeles, CA (LAX; all airports)"],
  startDate: "2026-10-15", endDate: "2026-10-22", budget: null, currency: "USD", travelers: 2, interests: [] };
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
  vi.stubEnv("FIRECRAWL_API_KEY", "test-key"); vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, creditsUsed: 1, data: { web: [
    { title: "Ocean Hotel", description: "Rooms near the beach in Los Angeles", url: "https://hotel.example/stay" },
    { title: "City Hotel", description: "Downtown Los Angeles rooms", url: "https://city.example/rooms" },
    { title: "Hôtel du Port", description: "Chambres avec vue sur le port", url: "https://fr.example/chambres" },
  ] } })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

async function setup() {
  const t = convexTest(schema, modules); rateLimiter.register(t); workpool.register(t, "researchPool");
  const [ownerId, otherId] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const alice = t.withIdentity({ subject: `${ownerId}|session` });
  const bob = t.withIdentity({ subject: `${otherId}|session` });
  const tripId = await alice.mutation(api.trips.create, trip);
  return { t, alice, bob, tripId, args: { tripId, destination: trip.destinations[0], type: "hotel" as const } };
}

test("lodging search persists Firecrawl results and reuses a recent match", async () => {
  const { t, alice, args } = await setup();
  const sessionId = "lodging-session";
  const first = await alice.mutation(api.lodgingJobs.start, { ...args, sessionId });
  expect(await alice.mutation(api.lodgingJobs.start, { ...args, refresh: true })).toEqual({ ...first, reused: true });
  await t.action(internal.lodgingJobs.execute, { runId: first.runId, sessionId });
  const run = await alice.query(api.lodgingJobs.latest, args);
  expect(run).toMatchObject({ status: "completed", type: "hotel", results: [
    { title: "Ocean Hotel", url: "https://hotel.example/stay" },
    { title: "City Hotel", url: "https://city.example/rooms" },
  ] });
  const query = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).query;
  const location = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).location;
  const excludeDomains = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).excludeDomains;
  expect(query).toContain("official hotels");
  expect(query).toContain('hotels physically located in "Los Angeles, CA"');
  expect(location).toBe("Los Angeles, CA");
  expect(excludeDomains).toContain("booking.com");
  expect(run?.warning).toBe("Some non-English results were omitted.");
  expect(await alice.query(api.firecrawl.budget, { sessionId })).toMatchObject({ projectUsed: 1, sessionUsed: 1 });
  expect(await alice.mutation(api.lodgingJobs.start, args)).toEqual({ ...first, reused: true });
});

test("lodging relevance requires the selected category without requiring the city in every snippet", () => {
  expect(isRelevantLodgingResult("Hotel Esplanade", "Hotel rooms near the beach", "https://hotel.example", "hotel")).toBe(true);
  expect(isRelevantLodgingResult("Park Hyatt Milan", "Luxury five-star hotel property", "https://hyatt.example", "hotel")).toBe(true);
  expect(isRelevantLodgingResult("21 Best Hotels in Milan", "Our favorite luxury properties", "https://magazine.example", "hotel")).toBe(false);
  expect(isRelevantLodgingResult("Luxury Hotels & Resorts", "Properties across Europe", "https://americanexpress.com/travel", "hotel")).toBe(false);
  expect(isRelevantLodgingResult("Generator Rome Review: Hostel vs. Hotel? My Honest Stay in Italy!",
    "Book Colosseum tickets through the official site.", "https://travel.example/blog/generator-rome-review", "hostel")).toBe(false);
  expect(isRelevantLodgingResult("Don Omar Tickets", "Concert tour dates and tickets", "https://ticketmaster.ca", "hotel")).toBe(false);
  expect(isRelevantLodgingResult("Car Rental", "Rental cars from the airport", "https://cars.example", "hotel")).toBe(false);
  expect(isRelevantLodgingResult("Forte Hotel Vieste", "Hotel rooms in Vieste, Italy", "https://hotel.example", "hotel")).toBe(true);
  expect(isRelevantLodgingResult("Backpackers Hostel", "Hostel dorms for guests", "https://hostel.example", "hotel")).toBe(false);
});

test("lodging relevance rejects social posts and properties outside the requested city", () => {
  expect(isRelevantLodgingResult("What are budget-friendly Italy travel tips?", "Hotel Rosso 23 and Naples travel advice",
    "https://facebook.com/posts/123", "hotel", "Naples, Italy")).toBe(false);
  expect(isRelevantLodgingResult("Fall in Sorrento Package", "Luxury rooms and suites on the Amalfi coast",
    "https://mediterraneosorrento.com", "hotel", "Naples, Italy")).toBe(false);
  expect(isRelevantLodgingResult("Official Site - Hotel La Reginella Capri", "Hotel La Reginella, Capri - Naples, Italy",
    "https://hotellareginella.com", "hotel", "Naples, Italy")).toBe(false);
  expect(isRelevantLodgingResult("Grand Hotel Vesuvio", "A luxury hotel in Naples with direct booking",
    "https://vesuvio.example", "hotel", "Naples, Italy")).toBe(true);
  expect(isRelevantLodgingResult("Naples Waterfront Hotel", "Rooms and suites with direct booking",
    "https://waterfront.example", "hotel", "Naples, Italy")).toBe(true);
});

test("lodging searches enforce ownership and isolate custom destinations and stay types", async () => {
  const { t, alice, bob, args } = await setup();
  const hotel = await alice.mutation(api.lodgingJobs.start, args);
  const hostel = await alice.mutation(api.lodgingJobs.start, { ...args, type: "hostel" });
  expect(hostel.runId).not.toBe(hotel.runId);
  for (const client of [t, bob]) {
    await expect(client.mutation(api.lodgingJobs.start, args)).rejects.toThrow("unavailable");
    await expect(client.query(api.lodgingJobs.latest, args)).rejects.toThrow("unavailable");
  }
  const custom = await alice.mutation(api.lodgingJobs.start, { ...args, destination: "Seattle" });
  expect(custom.runId).not.toBe(hotel.runId);
  await expect(alice.mutation(api.lodgingJobs.start, { ...args, destination: " " })).rejects.toThrow("City or destination");
});

test("lodging provider failures expose a safe retry message", async () => {
  const { t, alice, args } = await setup();
  fetchMock.mockResolvedValue(new Response("provider secret", { status: 503 }));
  const { runId } = await alice.mutation(api.lodgingJobs.start, args);
  await t.action(internal.lodgingJobs.execute, { runId });
  const run = await alice.query(api.lodgingJobs.latest, args);
  expect(run).toMatchObject({ status: "failed", error: "Lodging search is unavailable. Please try again." });
  expect(JSON.stringify(run)).not.toContain("provider secret");
});
