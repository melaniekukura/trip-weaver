/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workpool from "@convex-dev/workpool/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { localFareContext } from "./localTransportationFields";
const modules = import.meta.glob("./**/*.ts");
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv("FIRECRAWL_API_KEY", "test-key"); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); fetchMock.mockReset(); });
async function setup() {
  const t = convexTest(schema, modules); rateLimiter.register(t); workpool.register(t, "researchPool");
  const [owner, other] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const alice = t.withIdentity({ subject: `${owner}|session` }), bob = t.withIdentity({ subject: `${other}|session` });
  const tripId = await alice.mutation(api.trips.create, { name: "Europe", origin: "DTW", destinations: ["Paris", "London"],
    startDate: "2026-10-01", endDate: "2026-10-05", budget: null, currency: "USD", travelers: 2, interests: [] });
  const toggle = (destination: string, enabled: boolean, refresh = false) => alice.mutation(api.localTransportation.setEnabled, { tripId, destination, enabled, refresh });
  const read = () => alice.query(api.trips.get, { tripId });
  return { t, alice, bob, tripId, toggle, read };
}

test("requires ownership and a current destination; disabled destinations never search", async () => {
  const { t, alice, bob, tripId, toggle, read } = await setup();
  for (const client of [t, bob]) {
    await expect(client.mutation(api.localTransportation.setEnabled, { tripId, destination: "Paris", enabled: true })).rejects.toThrow();
    await expect(client.mutation(api.localTransportation.changeCount, { tripId, destination: "Paris", mode: "bus", delta: 1 })).rejects.toThrow();
  }
  await expect(toggle("Berlin", true)).rejects.toThrow();
  await toggle("Paris", false);
  await expect(alice.mutation(api.localTransportation.changeCount, { tripId, destination: "Paris", mode: "bus", delta: 1 })).rejects.toThrow();
  await t.action(internal.localTransportation.execute, { tripId, destination: "Paris", generation: 1, mode: "bus" });
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await read()).localTransportation).toBeUndefined();
  await toggle("Paris", true);
  expect((await read()).localTransportation?.map(row => row.destination)).toEqual(["Paris"]);
  await toggle("Paris", false);
  await t.action(internal.localTransportation.execute, { tripId, destination: "Paris", generation: 1, mode: "bus" });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("stores local source-backed fares without overwriting ride counts and reuses completed research", async () => {
  const { t, alice, tripId, toggle, read } = await setup();
  fetchMock.mockImplementation(async url => new Response(JSON.stringify(String(url).endsWith("/search")
    ? { success: true, data: { web: [{ url: "https://transit.example/fares" }] } }
    : { success: true, data: { metadata: { sourceURL: "https://transit.example/fares" }, markdown: "Single fare EUR 2.50",
      json: { official: true, applicable: true, amount: 2.5, currency: "EUR", evidence: "Single fare EUR 2.50", note: "Central zone" } } })));
  await toggle("Paris", true);
  const first = (await read()).localTransportation![0];
  await toggle("Paris", true);
  expect((await read()).localTransportation![0].generation).toBe(first.generation);
  await alice.mutation(api.localTransportation.changeCount, { tripId, destination: "Paris", mode: "bus", delta: 1 });
  await t.action(internal.localTransportation.execute, { tripId, destination: "Paris", generation: 1, mode: "bus" });
  expect((await read()).localTransportation![0].rides[0]).toMatchObject({ status: "priced", count: 1, amount: 2.5, currency: "EUR" });
  const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
  expect(body.query).toContain("Paris"); expect(body.query).not.toContain("London");
  for (const mode of first.rides.slice(1).map(ride => ride.mode)) await t.mutation(internal.localTransportation.finish, {
    tripId, destination: "Paris", generation: 1, mode, fare: { mode, count: 0, status: "unknown" },
  });
  await toggle("Paris", false);
  await toggle("Paris", true);
  const cached = (await read()).localTransportation![0];
  expect(cached.rides[0]).toMatchObject({ status: "priced", count: 1 });
  expect(cached.workIds).toBeUndefined();
  await toggle("London", true);
  expect((await read()).localTransportation?.filter(row => row.enabled)).toHaveLength(2);
});

test("turning off during a search prevents scraping and ignores late results", async () => {
  const { t, tripId, toggle, read } = await setup();
  await toggle("Paris", true);
  fetchMock.mockImplementationOnce(async () => {
    await toggle("Paris", false);
    return new Response(JSON.stringify({ success: true, data: { web: [{ url: "https://transit.example/fares" }] } }));
  });
  const args = { tripId, destination: "Paris", generation: 1, mode: "bus" as const };
  await t.action(internal.localTransportation.execute, args);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await t.mutation(internal.localTransportation.finish, { ...args, fare: { mode: "bus", count: 0, status: "priced", amount: 99, currency: "USD" } });
  expect((await read()).localTransportation![0].rides[0].amount).toBeUndefined();
});

test("removed destinations, changed dates and deleted trips stop queued searches", async () => {
  const { t, tripId, toggle } = await setup();
  await toggle("Paris", true);
  const args = { tripId, destination: "Paris", generation: 1, mode: "bus" as const };
  await t.run(ctx => ctx.db.patch("trips", tripId, { endDate: "2026-10-06" }));
  await t.action(internal.localTransportation.execute, args);
  await t.run(ctx => ctx.db.patch("trips", tripId, { endDate: "2026-10-05", destinations: ["London"] }));
  await t.action(internal.localTransportation.execute, args);
  await t.run(ctx => ctx.db.delete("trips", tripId));
  await t.action(internal.localTransportation.execute, args);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("provider and worker failures remain unknown and cannot leak provider errors", async () => {
  const { t, tripId, toggle, read } = await setup();
  await toggle("Paris", true);
  fetchMock.mockRejectedValue(new Error("test-key private provider error"));
  await t.action(internal.localTransportation.execute, { tripId, destination: "Paris", generation: 1, mode: "bus" });
  const row = (await read()).localTransportation![0];
  await t.mutation(internal.localTransportation.onComplete, { context: { tripId, destination: "Paris", generation: 1 },
    workId: row.workIds![1] as never, result: { kind: "failed", error: "Interrupted" } });
  const result = (await read()).localTransportation![0];
  expect(result.rides.slice(0, 3).map(ride => ride.status)).toEqual(["unknown", "unknown", "pending"]);
  expect(JSON.stringify(result)).not.toContain("test-key");
  expect(localFareContext("Paris", "October", "taxi")).toContain("Never present a starting fare");
});
