/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const reserve = makeFunctionReference<"mutation">("firecrawl:reserveCredits");
const record = makeFunctionReference<"mutation">("firecrawl:recordCredits");
const budget = makeFunctionReference<"query">("firecrawl:budget");

test("budget checks do not consume or reserve credits", async () => {
  const t = convexTest(schema, modules);
  for (let run = 0; run < 10; run++) expect(await t.mutation(reserve, { sessionId: "session-a" })).toBe(0);
  expect(await t.run(ctx => ctx.db.query("firecrawlBudgets").withIndex("by_scope", q => q.eq("scope", "trip-weaver")).unique()))
    .toMatchObject({ reservedCredits: 0, usedCredits: 0, trackingVersion: 1 });
  expect(await t.run(ctx => ctx.db.query("firecrawlBudgetSessions").withIndex("by_sessionId", q => q.eq("sessionId", "session-a")).unique()))
    .toMatchObject({ reservedCredits: 0, usedCredits: 0, trackingVersion: 1 });
});

test("stops a browser session only after 500 reported credits", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(reserve, { sessionId: "session-a" });
  await t.mutation(record, { sessionId: "session-a", creditsUsed: 499 });
  expect(await t.mutation(reserve, { sessionId: "session-a" })).toBe(499);
  await t.mutation(record, { sessionId: "session-a", creditsUsed: 1 });
  await expect(t.mutation(reserve, { sessionId: "session-a" })).rejects.toThrow("FIRECRAWL_SESSION_BUDGET_EXCEEDED");
  expect(await t.run(ctx => ctx.db.query("firecrawlBudgetSessions").withIndex("by_sessionId", q => q.eq("sessionId", "session-a")).unique()))
    .toMatchObject({ reservedCredits: 0, usedCredits: 500, trackingVersion: 1 });
});

test("reported search usage is the only amount deducted from limits", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(ctx => ctx.db.insert("users", {}));
  const user = t.withIdentity({ subject: `${userId}|session` });
  await t.mutation(record, { sessionId: "session-a", creditsUsed: 2 });
  expect(await user.query(budget, { sessionId: "session-a" })).toEqual({
    projectUsed: 2, projectReserved: 0, projectLimit: 24000, projectRemaining: 23998,
    sessionUsed: 2, sessionReserved: 0, sessionLimit: 500, sessionRemaining: 498,
  });
});

test("fractional browser credits count toward actual usage", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(ctx => ctx.db.insert("users", {}));
  await t.mutation(record, { sessionId: "browser-session", creditsUsed: 1.5 });
  expect(await t.withIdentity({ subject: `${userId}|session` }).query(budget, { sessionId: "browser-session" })).toMatchObject({
    projectUsed: 1.5, sessionUsed: 1.5,
  });
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
