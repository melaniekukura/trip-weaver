/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workpool from "@convex-dev/workpool/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv("FIRECRAWL_API_KEY", "test-key"); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); fetchMock.mockReset(); });
async function setup() {
  const t = convexTest(schema, modules); rateLimiter.register(t); workpool.register(t, "researchPool");
  const [owner, other] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const alice = t.withIdentity({ subject: `${owner}|session` }), bob = t.withIdentity({ subject: `${other}|session` });
  const tripId = await alice.mutation(api.trips.create, { name: "Paris", origin: "DTW", destinations: ["Paris"], startDate: "2026-10-01", endDate: "2026-10-05", budget: null, currency: "USD", travelers: 2, interests: [] });
  const favoriteId = await t.run(ctx => ctx.db.insert("interestFavorites", { tripId, item: {
    title: "Museum", kind: "activities", description: "A museum", destination: "Paris", url: "https://museum.example/tickets", retrievedAt: "2026-09-18" }, itinerary: { date: "2026-10-02" } }));
  return { t, alice, bob, tripId, favoriteId };
}

test("fee access is owned, results are cached and changing itinerary invalidates them", async () => {
  const { t, alice, bob, tripId, favoriteId } = await setup();
  for (const client of [t, bob]) {
    await expect(client.query(api.extraFees.latest, { tripId })).rejects.toThrow();
    await expect(client.mutation(api.extraFees.start, { tripId })).rejects.toThrow();
    await expect(client.mutation(api.extraFees.saveSettings, { tripId, settings: { bagsPerTraveler: 0, rentalCar: false, rentalProvider: "", parkingLocation: "", carDays: 1 } })).rejects.toThrow();
  }
  const runId = await alice.mutation(api.extraFees.start, { tripId });
  expect(await alice.mutation(api.extraFees.start, { tripId })).toBe(runId);
  const latest = await alice.query(api.extraFees.latest, { tripId });
  expect(latest.results).toHaveLength(2);
  await alice.mutation(api.interestJobs.updateItinerary, { favoriteId, itinerary: null });
  expect(await alice.query(api.extraFees.latest, { tripId })).toEqual({ run: null, results: [] });
});

test("research stores exact source-backed quotes and failures never become zero prices", async () => {
  const { t, alice, tripId } = await setup();
  fetchMock.mockImplementation(async url => new Response(JSON.stringify(String(url).endsWith("/search")
    ? { success: true, data: { web: [{ url: "https://museum.example/tickets" }] } }
    : { success: true, data: { metadata: { sourceURL: "https://museum.example/tickets" }, markdown: "Adult admission EUR 25",
      json: { official: true, applicable: true, amount: 25, currency: "EUR", evidence: "Adult admission EUR 25", note: "Standard adult" } } })));
  const runId = await alice.mutation(api.extraFees.start, { tripId });
  await t.action(internal.extraFees.execute, { runId, index: 0 });
  fetchMock.mockRejectedValue(new Error("test-key provider failure"));
  await t.action(internal.extraFees.execute, { runId, index: 1 });
  const data = await alice.query(api.extraFees.latest, { tripId });
  expect(data.run?.status).toBe("completed");
  expect(data.results[0]).toMatchObject({ status: "priced", amount: 25, currency: "EUR", target: { quantity: 2 } });
  expect(data.results[1]).toMatchObject({ status: "unknown" });
  expect(data.results[1].amount).toBeUndefined();
  expect(JSON.stringify(data)).not.toContain("test-key");
});

test("one failed work item does not overwrite the remaining research", async () => {
  const { t, alice, tripId } = await setup();
  const runId = await alice.mutation(api.extraFees.start, { tripId });
  const data = await alice.query(api.extraFees.latest, { tripId });
  await t.mutation(internal.extraFees.onComplete, { context: { runId }, workId: data.run!.workIds![0] as never, result: { kind: "failed", error: "Interrupted" } });
  const after = await alice.query(api.extraFees.latest, { tripId });
  expect(after.results.map(row => row.status)).toEqual(["unknown", "pending"]);
  expect(after.run?.status).toBe("running");
  await t.run(ctx => ctx.db.delete("trips", tripId));
  await t.mutation(internal.extraFees.cleanupTrip, { tripId });
  expect(await t.run(ctx => ctx.db.get("extraFeeRuns", runId))).toBeNull();
});
