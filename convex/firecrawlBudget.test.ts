/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test, vi } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const reserve = makeFunctionReference<"mutation">("firecrawl:reserveCredits");
const record = makeFunctionReference<"mutation">("firecrawl:recordCredits");
const budget = makeFunctionReference<"query">("firecrawl:budget");

test("reserves credits atomically for in-flight requests", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(reserve, { credits: 2, sessionId: "session-a" });
  await t.mutation(reserve, { credits: 5, sessionId: "session-a" });
  expect(await t.run(ctx => ctx.db.query("firecrawlBudgets").withIndex("by_scope", q => q.eq("scope", "trip-weaver")).unique()))
    .toMatchObject({ reservedCredits: 7, usedCredits: 0, trackingVersion: 1 });
  expect(await t.run(ctx => ctx.db.query("firecrawlBudgetSessions").withIndex("by_sessionId", q => q.eq("sessionId", "session-a")).unique()))
    .toMatchObject({ reservedCredits: 7, usedCredits: 0, trackingVersion: 1 });
});

test("stops a browser session only after 500 reported credits", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(reserve, { credits: 1, sessionId: "session-a" });
  await t.mutation(record, { reservedCredits: 1, sessionId: "session-a", creditsUsed: 499 });
  await t.mutation(reserve, { credits: 1, sessionId: "session-a" });
  await t.mutation(record, { reservedCredits: 1, sessionId: "session-a", creditsUsed: 1 });
  await expect(t.mutation(reserve, { credits: 1, sessionId: "session-a" })).rejects.toThrow("FIRECRAWL_SESSION_BUDGET_EXCEEDED");
  expect(await t.run(ctx => ctx.db.query("firecrawlBudgetSessions").withIndex("by_sessionId", q => q.eq("sessionId", "session-a")).unique()))
    .toMatchObject({ reservedCredits: 0, usedCredits: 500, trackingVersion: 1 });
});

test("reported search usage is the only amount deducted from limits", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(ctx => ctx.db.insert("users", {}));
  const user = t.withIdentity({ subject: `${userId}|session` });
  await t.mutation(reserve, { credits: 7, sessionId: "session-a" });
  await t.mutation(record, { reservedCredits: 7, sessionId: "session-a", creditsUsed: 2 });
  expect(await user.query(budget, { sessionId: "session-a" })).toEqual({
    projectUsed: 2, projectReserved: 0, projectLimit: 24000, projectRemaining: 23998,
    sessionUsed: 2, sessionReserved: 0, sessionLimit: 500, sessionRemaining: 498,
  });
});

test("fractional browser credits count toward actual usage", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(ctx => ctx.db.insert("users", {}));
  await t.mutation(reserve, { credits: 10, sessionId: "browser-session" });
  await t.mutation(record, { reservedCredits: 10, sessionId: "browser-session", creditsUsed: 1.5 });
  expect(await t.withIdentity({ subject: `${userId}|session` }).query(budget, { sessionId: "browser-session" })).toMatchObject({
    projectUsed: 1.5, sessionUsed: 1.5,
  });
});

test("in-flight reservations prevent concurrent requests from overspending a session", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(reserve, { credits: 1, sessionId: "session-a" });
  await t.mutation(record, { reservedCredits: 1, sessionId: "session-a", creditsUsed: 491 });
  await t.mutation(reserve, { credits: 5, sessionId: "session-a" });
  await expect(t.mutation(reserve, { credits: 5, sessionId: "session-a" }))
    .rejects.toThrow("FIRECRAWL_SESSION_BUDGET_EXCEEDED");
});

test("releases unused credits when a request fails", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(ctx => ctx.db.insert("users", {}));
  await t.mutation(reserve, { credits: 5, sessionId: "session-a" });
  await t.mutation(record, { reservedCredits: 5, sessionId: "session-a", creditsUsed: 0 });
  expect(await t.withIdentity({ subject: `${userId}|session` }).query(budget, { sessionId: "session-a" })).toMatchObject({
    projectUsed: 0, projectReserved: 0, sessionUsed: 0, sessionReserved: 0,
  });
});

test("recovers reservations left by an interrupted request", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-21T12:00:00Z"));
  try {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("firecrawlBudgets", { scope: "trip-weaver", reservedCredits: 10, usedCredits: 20,
        trackingVersion: 1, updatedAt: Date.now() - 3 * 60 * 1000 - 1 });
      await ctx.db.insert("firecrawlBudgetSessions", { sessionId: "session-a", reservedCredits: 10, usedCredits: 20,
        trackingVersion: 1, updatedAt: Date.now() - 3 * 60 * 1000 - 1 });
    });
    await t.mutation(reserve, { credits: 2, sessionId: "session-a" });
    expect(await t.run(ctx => ctx.db.query("firecrawlBudgets").withIndex("by_scope", q => q.eq("scope", "trip-weaver")).unique()))
      .toMatchObject({ reservedCredits: 2, usedCredits: 20 });
    expect(await t.run(ctx => ctx.db.query("firecrawlBudgetSessions").withIndex("by_sessionId", q => q.eq("sessionId", "session-a")).unique()))
      .toMatchObject({ reservedCredits: 2, usedCredits: 20 });
  } finally { vi.useRealTimers(); }
});

test("legacy reservations are not presented as reported usage", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async ctx => {
    await ctx.db.insert("firecrawlBudgets", { scope: "trip-weaver", reservedCredits: 500, updatedAt: 1 });
    await ctx.db.insert("firecrawlBudgetSessions", { sessionId: "legacy", reservedCredits: 500, updatedAt: 1 });
    return await ctx.db.insert("users", {});
  });
  expect(await t.withIdentity({ subject: `${userId}|session` }).query(budget, { sessionId: "legacy" })).toMatchObject({
    projectUsed: 0, projectReserved: 0, sessionUsed: 0, sessionReserved: 0,
  });
});
