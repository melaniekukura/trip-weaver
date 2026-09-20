/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const reserve = makeFunctionReference<"mutation">("firecrawl:reserveCredits");

test("reserves 500 credits per run and stops at the 24K team allocation", async () => {
  const t = convexTest(schema, modules);
  for (let run = 1; run <= 48; run++) expect(await t.mutation(reserve, {})).toBe(run * 500);
  await expect(t.mutation(reserve, {})).rejects.toThrow("FIRECRAWL_TEAM_BUDGET_EXCEEDED");
  expect(await t.run(ctx => ctx.db.query("firecrawlBudgets").withIndex("by_scope", q => q.eq("scope", "trip-weaver")).unique()))
    .toMatchObject({ reservedCredits: 24000 });
});

test("stops a browser session after one 500-credit run", async () => {
  const t = convexTest(schema, modules);
  expect(await t.mutation(reserve, { sessionId: "session-a" })).toBe(500);
  await expect(t.mutation(reserve, { sessionId: "session-a" })).rejects.toThrow("FIRECRAWL_SESSION_BUDGET_EXCEEDED");
  expect(await t.run(ctx => ctx.db.query("firecrawlBudgetSessions").withIndex("by_sessionId", q => q.eq("sessionId", "session-a")).unique()))
    .toMatchObject({ reservedCredits: 500 });
});
