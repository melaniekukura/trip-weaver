/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workpool from "@convex-dev/workpool/test";
import type { WorkId } from "@convex-dev/workpool";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import markdown from "./fixtures/google-flights.txt?raw";

const modules = import.meta.glob("./**/*.ts");
const details = { name: "Japan", origin: "Detroit", destinations: ["Kyoto", "Osaka"],
  startDate: "2026-10-01", endDate: "2026-10-09", budget: null, currency: "USD", travelers: 1, interests: ["Gardens"] };
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.useFakeTimers(); vi.stubEnv("FIRECRAWL_API_KEY", "test-secret"); vi.stubGlobal("fetch", fetchMock);
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { markdown } })));

});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t); workpool.register(t, "researchPool");
  const [aliceId, bobId] = await t.run(async (ctx) => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const alice = t.withIdentity({ subject: `${aliceId}|session` });
  const bob = t.withIdentity({ subject: `${bobId}|session` });
  const tripId = await alice.mutation(api.trips.create, details);
  const args = { tripId, flight: { origin: "DTW", destination: "LAX", departureDate: "2026-10-15" } };
  return { t, alice, bob, tripId, args };
}



test("anonymous and other-user requests cannot start or read trip flight search", async () => {
  const { t, alice, bob, args } = await setup();
  await alice.mutation(api.flightJobs.start, args);
  for (const client of [t, bob]) {
    await expect(client.mutation(api.flightJobs.start, args)).rejects.toThrow();
    await expect(client.query(api.flightJobs.latest, args)).rejects.toThrow();
  }
  expect(fetchMock).not.toHaveBeenCalled();
});



test("duplicate pending requests share the same background job", async () => {
  const { alice, args } = await setup();
  const first = await alice.mutation(api.flightJobs.start, args);
  const second = await alice.mutation(api.flightJobs.start, { ...args, refresh: true });
  expect(second).toEqual({ runId: first.runId, reused: true });
});

test("provider errors become sanitized failed runs and allow an explicit retry", async () => {
  const { t, alice, args } = await setup();
  fetchMock.mockResolvedValue(new Response("test-secret", { status: 402 }));
  const { runId } = await alice.mutation(api.flightJobs.start, args);
  await t.action(internal.flightJobs.execute, { runId });
  const failed = await alice.query(api.flightJobs.latest, args);
  expect(failed?.run.status).toBe("failed");
  expect(failed?.run.error).toContain("out of credits");
  expect(failed?.run.error).not.toContain("test-secret");
  const retry = await alice.mutation(api.flightJobs.start, args);
  expect(retry.runId).not.toBe(runId);
});

test("per-user limit rejects excess new searches", async () => {
  const { t, alice, args } = await setup();
  for (let i = 0; i < 3; i++) {
    const { runId } = await alice.mutation(api.flightJobs.start, { ...args, refresh: true });
    await t.mutation(internal.flightJobs.fail, { runId, message: "Test failure" });
  }
  await expect(alice.mutation(api.flightJobs.start, { ...args, refresh: true })).rejects.toThrow("RESEARCH_RATE_LIMITED");
});

test("missing provider key fails without creating a stuck run", async () => {
  const { alice, args } = await setup();
  vi.stubEnv("FIRECRAWL_API_KEY", "");
  await expect(alice.mutation(api.flightJobs.start, args)).rejects.toThrow("RESEARCH_NOT_CONFIGURED");
  expect(await alice.query(api.flightJobs.latest, args)).toBeNull();
});





test("deleting a trip prevents late writes and cleanup removes flight search", async () => {
  const { t, alice, args, tripId } = await setup();
  const { runId } = await alice.mutation(api.flightJobs.start, args);
  await t.mutation(internal.flightJobs.claim, { runId });
  await alice.mutation(api.trips.remove, { tripId });
  await t.mutation(internal.flightJobs.finish, { runId, sources: [{ title: "late", category: "flights", description: "", destination: "LAX", sourceUrl: "https://www.google.com/travel/flights", retrievedAt: new Date().toISOString(), flight: { airline: "Delta", departure: "6:00 PM", arrival: "7:52 PM", duration: "4 hr 52 min", stops: "Nonstop", amount: 389, currency: "USD" } }] });
  await t.mutation(internal.flightJobs.cleanupTrip, { tripId });
  expect(await t.run(async (ctx) => await ctx.db.get("researchRuns", runId))).toBeNull();
  expect(await t.run(async (ctx) => await ctx.db.query("researchSources").withIndex("by_tripId", (q) => q.eq("tripId", tripId)).take(5))).toEqual([]);
});

test("the actual work queue runs flight search and its completion callback", async () => {
  const { t, alice, args } = await setup();
  await alice.mutation(api.flightJobs.start, args);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await alice.query(api.flightJobs.latest, args))?.run.status).toBe("completed");
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("workpool failure callback recovers an interrupted run without exposing raw errors", async () => {
  const { t, alice, args } = await setup();
  const { runId } = await alice.mutation(api.flightJobs.start, args);
  const run = (await alice.query(api.flightJobs.latest, args))!.run;
  await t.mutation(internal.flightJobs.claim, { runId });
  await t.mutation(internal.flightJobs.onComplete, {
    workId: run.workId! as WorkId, context: { runId }, result: { kind: "failed", error: "test-secret raw stack" },
  });
  const failed = await alice.query(api.flightJobs.latest, args);
  expect(failed?.run.status).toBe("failed");
  expect(failed?.run.error).toBe("Flight search was interrupted. You can try again.");
});



test("deployment-wide budget limits apply across different users", async () => {
  const { t } = await setup();
  for (let i = 0; i < 11; i++) {
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    const user = t.withIdentity({ subject: `${userId}|session` });
    const tripId = await user.mutation(api.trips.create, details);
    const request = user.mutation(api.flightJobs.start, { tripId, flight: { origin: "DTW", destination: "LAX", departureDate: "2026-10-15" } });
    if (i < 10) await request;
    else await expect(request).rejects.toThrow("RESEARCH_RATE_LIMITED");
  }
});

test("flight jobs scrape fresh matching fares, preserve distinct options, and expire after 15 minutes", async () => {
  const { default: markdown } = await import("./fixtures/google-flights.txt?raw");
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { markdown, metadata: { statusCode: 200 } } })));
  const { t, alice, bob, args } = await setup();
  const flightArgs = { ...args, flight: { origin: "DTW", destination: "LAX", departureDate: "2026-10-15" } };
  await expect(bob.mutation(api.flightJobs.start, flightArgs)).rejects.toThrow("TRIP_NOT_FOUND");
  await expect(t.query(api.flightJobs.latest, flightArgs)).rejects.toThrow("UNAUTHENTICATED");
  const { runId } = await alice.mutation(api.flightJobs.start, flightArgs);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const result = await alice.query(api.flightJobs.latest, flightArgs);
  expect(result?.run.status).toBe("completed");
  expect(result?.sources.map((source) => source.flight?.amount)).toEqual([169, 300, 389]);
  expect(result?.sources[0].sourceUrl).toContain("https://www.google.com/travel/flights?");
  expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({ maxAge: 0, onlyMainContent: false, waitFor: 5000 });
  expect(await alice.mutation(api.flightJobs.start, flightArgs)).toEqual({ runId, reused: true });
  expect(await alice.query(api.flightJobs.latest, { ...flightArgs, flight: { ...flightArgs.flight, destination: "JFK" } })).toBeNull();
  vi.setSystemTime(Date.now() + 16 * 60000);
  expect((await alice.mutation(api.flightJobs.start, flightArgs)).reused).toBe(false);
});

test("flight validation rejects past dates and missing route before charging credits", async () => {
  const { alice, args } = await setup();
  await expect(alice.mutation(api.flightJobs.start, { ...args, flight: { ...args.flight, origin: "Detroit" } })).rejects.toThrow("INVALID_FLIGHT_SEARCH");
  await expect(alice.mutation(api.flightJobs.start, { ...args, flight: {
    origin: "DTW", destination: "LAX", departureDate: "2020-01-01",
  } })).rejects.toThrow("INVALID_FLIGHT_SEARCH");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("unreadable flight pages fail without saving invented or mock fares", async () => {
  const { t, alice, args } = await setup();
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { markdown: "Consent required" } })));
  const flightArgs = { ...args, flight: { origin: "DTW", destination: "LAX", departureDate: "2026-10-15" } };
  const { runId } = await alice.mutation(api.flightJobs.start, flightArgs);
  await t.action(internal.flightJobs.execute, { runId });
  const result = await alice.query(api.flightJobs.latest, flightArgs);
  expect(result?.run.status).toBe("failed");
  expect(result?.run.error).toContain("could not be verified");
  expect(result?.sources).toEqual([]);
});
