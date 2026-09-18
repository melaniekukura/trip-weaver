/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workpool from "@convex-dev/workpool/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { discoveryPreview, interestQuery, interestSearchKey, safeDiscoveryUrl } from "./interestSearch";

const modules = import.meta.glob("./**/*.ts");
const trip = { name: "Autumn", origin: "Detroit", destinations: ["Milan, Italy (MIL; all airports)"], startDate: "2026-10-01", endDate: "2026-10-09",
  budget: null, currency: "USD", travelers: 1, interests: ["Art", "Food"] };
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
  vi.stubEnv("FIRECRAWL_API_KEY", "test-key"); vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    if (body.url) {
      const event = body.url.includes("events");
      const name = body.url.includes("restaurant") ? "Osteria Test" : event ? "Autumn exhibition" : body.url.includes("food") ? "Cooking class" : "Museum visit";
      return new Response(JSON.stringify({ success: true, data: { markdown: `${name} Visitor information`, links: [],
        metadata: { url: body.url }, json: { pageType: "individual", relevant: true, name, excerpt: "Visitor information", candidates: [] } } }));
    }
    const event = /exhibitions|festivals/.test(body.query) && body.query.includes("official calendar");
    const restaurant = body.query.includes("-tours -classes");
    const food = !event && body.query.includes("Food");
    return new Response(JSON.stringify({ success: true, data: { web: [{ title: event ? "Autumn exhibition" : food ? "Cooking class" : "Museum visit", description: "Visitor information",
      url: restaurant ? "https://restaurant.example.org/menu" : event ? "https://example.org/events" : food ? "https://food.example.org/class" : "https://museum.example.org/museum" }] } }));
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); fetchMock.mockReset(); });
async function setup() {
  const t = convexTest(schema, modules); rateLimiter.register(t); workpool.register(t, "researchPool");
  const [owner, other] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const alice = t.withIdentity({ subject: `${owner}|session` }); const bob = t.withIdentity({ subject: `${other}|session` });
  const tripId = await alice.mutation(api.trips.create, trip);
  return { t, alice, bob, tripId, args: { tripId, destination: trip.destinations[0], kind: "both" as const } };
}

test("both searches persist source-backed results, deduplicate jobs, and reuse completed results", async () => {
  const { t, alice, args } = await setup();
  const first = await alice.mutation(api.interestJobs.start, args);
  expect(await alice.mutation(api.interestJobs.start, { ...args, refresh: true })).toEqual({ ...first, reused: true });
  await t.action(internal.interestJobs.execute, { runId: first.runId });
  const run = await alice.query(api.interestJobs.latest, args);
  expect(run).toMatchObject({ status: "completed", warnings: [], interests: ["Art", "Food"] });
  expect(run?.results.map(result => result.kind)).toEqual(["activities", "activities", "activities", "events"]);
  expect(fetchMock).toHaveBeenCalledTimes(14);
  expect(await alice.mutation(api.interestJobs.start, args)).toEqual({ ...first, reused: true });
  await alice.mutation(api.interestJobs.save, { runId: first.runId, index: 0 });
  await alice.mutation(api.interestJobs.save, { runId: first.runId, index: 0 });
  expect(await alice.query(api.interestJobs.favorites, { tripId: args.tripId })).toHaveLength(1);
  const refreshed = await alice.mutation(api.interestJobs.start, { ...args, refresh: true });
  expect(refreshed.runId).not.toBe(first.runId);
});

test("anonymous and other-user access is refused for searches and favorites", async () => {
  const { t, alice, bob, args } = await setup();
  const { runId } = await alice.mutation(api.interestJobs.start, args);
  await t.action(internal.interestJobs.execute, { runId });
  await alice.mutation(api.interestJobs.save, { runId, index: 0 });
  const [favorite] = await alice.query(api.interestJobs.favorites, { tripId: args.tripId });
  for (const client of [t, bob]) {
    await expect(client.mutation(api.interestJobs.start, args)).rejects.toThrow("unavailable");
    await expect(client.query(api.interestJobs.latest, args)).rejects.toThrow("unavailable");
    await expect(client.query(api.interestJobs.favorites, { tripId: args.tripId })).rejects.toThrow("unavailable");
    await expect(client.mutation(api.interestJobs.save, { runId, index: 0 })).rejects.toThrow("unavailable");
    await expect(client.mutation(api.interestJobs.removeFavorite, { favoriteId: favorite._id })).rejects.toThrow("unavailable");
  }
  await expect(alice.mutation(api.interestJobs.start, { ...args, destination: " " })).rejects.toThrow("Choose a city");
  await expect(alice.mutation(api.interestJobs.save, { runId, index: -1 })).rejects.toThrow("completed search result");
});

test("one provider failure preserves the other category and allows retry instead of caching a partial run", async () => {
  const { t, alice, args } = await setup();
  fetchMock.mockResolvedValueOnce(new Response("private error", { status: 429 }));
  const { runId } = await alice.mutation(api.interestJobs.start, args);
  await t.action(internal.interestJobs.execute, { runId });
  const run = await alice.query(api.interestJobs.latest, args);
  expect(run?.status).toBe("completed"); expect(run?.results).toHaveLength(4); expect(run?.warnings).toHaveLength(1);
  expect(JSON.stringify(run)).not.toContain("private error");
  expect((await alice.mutation(api.interestJobs.start, args)).runId).not.toBe(runId);
});

test("all failed searches report failure and the limit reports a retry time", async () => {
  const { t, alice, args } = await setup();
  fetchMock.mockImplementation(async () => new Response("private error", { status: 503 }));
  for (let i = 0; i < 6; i++) {
    const { runId } = await alice.mutation(api.interestJobs.start, args);
    await t.action(internal.interestJobs.execute, { runId });
  }
  expect((await alice.query(api.interestJobs.latest, args))?.status).toBe("failed");
  await expect(alice.mutation(api.interestJobs.start, args)).rejects.toThrow("5 minute(s)");
});

test("changing interests invalidates search results; trip deletion removes research and favorites", async () => {
  const { t, alice, args, tripId } = await setup();
  const { runId } = await alice.mutation(api.interestJobs.start, args);
  await t.action(internal.interestJobs.execute, { runId });
  await alice.mutation(api.interestJobs.save, { runId, index: 0 });
  const saved = await alice.query(api.trips.get, { tripId });
  await alice.mutation(api.trips.update, { tripId, expectedUpdatedAt: saved.updatedAt, changes: { ...trip, interests: ["Hiking"] } });
  expect(await alice.query(api.interestJobs.latest, { ...args, runId })).toBeNull();
  await alice.mutation(api.trips.remove, { tripId });
  await t.mutation(internal.interestJobs.cleanupTrip, { tripId });
  expect(await t.run(ctx => ctx.db.get("interestRuns", runId))).toBeNull();
  expect(await t.run(ctx => ctx.db.query("interestFavorites").withIndex("by_tripId", q => q.eq("tripId", tripId)).take(100))).toEqual([]);
});

test("search keys include dates and preferences; query uses city and dates without airport clutter", () => {
  const search = { ...trip, destination: trip.destinations[0], kind: "both" as const };
  expect(interestSearchKey(search)).toBe(interestSearchKey({ ...search, interests: ["food", "art"] }));
  expect(interestSearchKey(search)).not.toBe(interestSearchKey({ ...search, endDate: "2026-10-10" }));
  const query = interestQuery(search, "events");
  expect(query).toContain("Milan, Italy"); expect(query).toContain("October 1, 2026 through October 9, 2026"); expect(query).not.toContain("all airports");
  for (const url of ["javascript:alert(1)", "https://user:pass@example.org", "bad"]) expect(safeDiscoveryUrl(url)).toBeNull();
});


test("provider markdown becomes a bounded readable preview", () => {
  expect(discoveryPreview("# Museum\n[Visitor information](https://example.org) ![Photo](https://example.org/img.png) <b>Art</b>"))
    .toBe("Museum Visitor information Art");
  expect(discoveryPreview("Exhibition ".repeat(100)).length).toBeLessThanOrEqual(420);
});

test("searching one interest preserves trip interests and isolates cached results", async () => {
  const { t, alice, args, tripId } = await setup();
  const food = await alice.mutation(api.interestJobs.start, { ...args, interest: "Food" });
  const art = await alice.mutation(api.interestJobs.start, { ...args, interest: "Art" });
  expect(food.runId).not.toBe(art.runId);
  await t.action(internal.interestJobs.execute, { runId: food.runId });
  const run = await alice.query(api.interestJobs.latest, { ...args, interest: "Food", runId: art.runId });
  expect(run).toMatchObject({ _id: food.runId, interests: ["Food"], status: "completed" });
  expect((await alice.query(api.trips.get, { tripId }))?.interests).toEqual(["Art", "Food"]);
  expect(await alice.mutation(api.interestJobs.start, { ...args, interest: "Food" })).toEqual({ ...food, reused: true });
  await expect(alice.mutation(api.interestJobs.start, { ...args, interest: "Hiking" })).rejects.toThrow("Choose one of this trip’s interests");
});

test("saved ideas support optional itinerary details, edits and removal without deleting the idea", async () => {
  const { t, alice, bob, tripId } = await setup();
  const favoriteId = await t.run(ctx => ctx.db.insert("interestFavorites", { tripId, item: {
    kind: "activities", title: "Restaurant", description: "Dinner", url: "https://example.org/dinner", destination: "Milan", retrievedAt: "2026-09-17T00:00:00Z",
  } }));
  for (const client of [t, bob]) {
    await expect(client.mutation(api.interestJobs.updateItinerary, { favoriteId, itinerary: {} })).rejects.toThrow("unavailable");
  }
  await alice.mutation(api.interestJobs.updateItinerary, { favoriteId, itinerary: {} });
  expect((await alice.query(api.interestJobs.favorites, { tripId }))[0].itinerary).toEqual({});
  const itinerary = { date: "2026-10-03", time: "19:30", notes: "Confirmation: TEST-123\nMeet at entrance" };
  await alice.mutation(api.interestJobs.updateItinerary, { favoriteId, itinerary });
  expect((await alice.query(api.interestJobs.favorites, { tripId }))[0].itinerary).toEqual(itinerary);
  for (const invalid of [{ date: "2026-02-30" }, { date: "tomorrow" }, { time: "25:30" }, { notes: "x".repeat(4001) }]) {
    await expect(alice.mutation(api.interestJobs.updateItinerary, { favoriteId, itinerary: invalid })).rejects.toThrow();
  }
  expect((await alice.query(api.interestJobs.favorites, { tripId }))[0].itinerary).toEqual(itinerary);
  await alice.mutation(api.interestJobs.updateItinerary, { favoriteId, itinerary: { notes: "Plan later" } });
  expect((await alice.query(api.interestJobs.favorites, { tripId }))[0].itinerary).toEqual({ notes: "Plan later" });
  await alice.mutation(api.interestJobs.updateItinerary, { favoriteId, itinerary: null });
  const favorites = await alice.query(api.interestJobs.favorites, { tripId });
  expect(favorites).toHaveLength(1); expect(favorites[0].itinerary).toBeUndefined();
});


test("other-city searches have separate results without modifying the trip route", async () => {
  const { t, alice, bob, tripId, args } = await setup();
  const otherArgs = { ...args, destination: "Florence, Italy", interest: "Food" };
  const original = await alice.mutation(api.interestJobs.start, args);
  const other = await alice.mutation(api.interestJobs.start, otherArgs);
  expect(other.runId).not.toBe(original.runId);
  const saved = await alice.query(api.interestJobs.latest, otherArgs);
  expect(saved).toMatchObject({ destination: "Florence, Italy", interests: ["Food"] });
  expect((await alice.query(api.trips.get, { tripId }))?.destinations).toEqual(trip.destinations);
  for (const client of [t, bob]) {
    await expect(client.mutation(api.interestJobs.start, otherArgs)).rejects.toThrow("unavailable");
    await expect(client.query(api.interestJobs.latest, otherArgs)).rejects.toThrow("unavailable");
  }
  await expect(alice.mutation(api.interestJobs.start, { ...args, destination: "x".repeat(201) })).rejects.toThrow("Choose a city");
});

test("accessibility changes invalidate results and requirements reach the detail extractor", async () => {
  const { t, alice, args, tripId } = await setup();
  const original = await alice.mutation(api.interestJobs.start, args);
  const saved = await alice.query(api.trips.get, { tripId });
  await alice.mutation(api.trips.update, { tripId, expectedUpdatedAt: saved.updatedAt, changes: { ...trip, accessibility: "Step-free access" } });
  expect(await alice.query(api.interestJobs.latest, { ...args, runId: original.runId })).toBeNull();
  const next = await alice.mutation(api.interestJobs.start, args);
  await t.action(internal.interestJobs.execute, { runId: next.runId });
  const run = await alice.query(api.interestJobs.latest, args);
  expect(run?.accessibility).toEqual(["step-free access"]);
  const scrapeCalls = fetchMock.mock.calls.map(([, options]) => JSON.parse(String(options?.body))).filter(body => body.url);
  expect(scrapeCalls.length).toBeGreaterThan(0);
  expect(scrapeCalls.every(body => body.formats[2].prompt.includes("step-free access"))).toBe(true);
});

test("sightseeing search includes major museums and monuments and retains more than five distinct attractions", async () => {
  const { t } = await setup();
  fetchMock.mockImplementation(async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    if (body.url) {
      const title = body.url.includes("museum") ? `Museum ${body.url.split("/").pop()}` : `Monument ${body.url.split("/").pop()}`;
      return new Response(JSON.stringify({ success: true, data: { markdown: `${title}. Visitor information.`, links: [], metadata: { url: body.url },
        json: { pageType: "individual", relevant: true, name: title, excerpt: "Visitor information.", candidates: [] } } }));
    }
    const category = body.query.includes("monuments") ? "monument" : "museum";
    return new Response(JSON.stringify({ success: true, data: { web: Array.from({ length: 5 }, (_, index) => ({
      title: `${category} ${index}`, url: `https://${category}${index}.example.org/${index}`,
    })) } }));
  });
  const result = await t.action(internal.interestJobs.discover, { destination: "Paris", interests: ["Art"], kind: "activities", startDate: trip.startDate, endDate: trip.endDate });
  expect(result.results).toHaveLength(10);
  expect(result.results.some(item => item.title.startsWith("Museum"))).toBe(true);
  expect(result.results.some(item => item.title.startsWith("Monument"))).toBe(true);
  const queries = fetchMock.mock.calls.map(([, options]) => JSON.parse(String(options?.body)).query).filter(Boolean);
  expect(queries.some(query => query.includes("major museums"))).toBe(true);
  expect(queries.some(query => query.includes("famous monuments"))).toBe(true);
});
