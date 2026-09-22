/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test";
import workpool from "@convex-dev/workpool/test";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { documentType } from "./requiredDocumentJobs";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const start = makeFunctionReference<"mutation", { tripId: Id<"trips">; destination: string; refresh?: boolean; sessionId?: string },
  { runId: Id<"requiredDocumentRuns">; reused: boolean }>("requiredDocumentJobs:start");
const latest = makeFunctionReference<"query", { tripId: Id<"trips">; destination: string; runId?: Id<"requiredDocumentRuns"> },
  Doc<"requiredDocumentRuns"> | null>("requiredDocumentJobs:latest");
const execute = makeFunctionReference<"action", { runId: Id<"requiredDocumentRuns">; sessionId?: string }, null>(
  "requiredDocumentJobs:execute");
const trip = { name: "Japan", origin: "Detroit — Detroit Metro (DTW)", destinations: ["Tokyo — Haneda (HND)"],
  startDate: "2027-04-10", endDate: "2027-04-20", budget: null, currency: "USD", travelers: 1, interests: [] };
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-21T12:00:00Z"));
  vi.stubEnv("FIRECRAWL_API_KEY", "test-key"); vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, creditsUsed: 1, data: { web: [
    { title: "Visa and passport requirements", description: "Official application information for travelers.",
      url: "https://entry.example.gov/apply", markdown: "Application details" },
    { title: "Arrival card", description: "Complete the official immigration form online.",
      url: "https://forms.example.gov/arrival", markdown: "Arrival form" },
  ] } })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

async function setup() {
  const t = convexTest(schema, modules); rateLimiter.register(t); workpool.register(t, "researchPool");
  const [ownerId, otherId] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const alice = t.withIdentity({ subject: `${ownerId}|session` });
  const bob = t.withIdentity({ subject: `${otherId}|session` });
  const tripId = await alice.mutation(api.trips.create, trip);
  return { t, alice, bob, tripId, args: { tripId, destination: trip.destinations[0] } };
}

test("document search uses the saved route and stores linked results", async () => {
  const { t, alice, args } = await setup();
  const sessionId = "document-session";
  const started = await alice.mutation(start, { ...args, sessionId });
  await t.action(execute, { runId: started.runId, sessionId });
  const run = await alice.query(latest, args);
  expect(run).toMatchObject({ status: "completed", origin: "Detroit", destination: trip.destinations[0], results: [
    { type: "visa", title: "Visa and passport requirements", url: "https://entry.example.gov/apply" },
    { type: "arrival-form", title: "Arrival card", url: "https://forms.example.gov/arrival" },
  ] });
  const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(body.query).toContain('departing from "Detroit"');
  expect(body.query).toContain('visiting "Tokyo"');
  expect(body.query).toContain("2027-04-10");
  expect(body).not.toHaveProperty("scrapeOptions");
  expect(await alice.query(api.firecrawl.budget, { sessionId })).toMatchObject({ projectUsed: 1, sessionUsed: 1 });
});

test("document searches require ownership and a destination on the trip", async () => {
  const { t, alice, bob, args } = await setup();
  for (const client of [t, bob]) {
    await expect(client.mutation(start, args)).rejects.toThrow("unavailable");
    await expect(client.query(latest, args)).rejects.toThrow("unavailable");
  }
  await expect(alice.mutation(start, { ...args, destination: "Osaka" })).rejects.toThrow("Choose a destination");
});

test("document categories distinguish common entry documents", () => {
  expect(documentType("Apply for an eVisa", "Official portal")).toBe("visa");
  expect(documentType("Electronic travel authorization", "Apply online")).toBe("travel-authorization");
  expect(documentType("Yellow fever certificate", "Health entry requirement")).toBe("health");
  expect(documentType("Passport validity", "Entry rules")).toBe("passport");
});
