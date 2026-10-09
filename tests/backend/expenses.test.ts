/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const trip = { name: "Paris", origin: "DTW", destinations: ["CDG"], startDate: "2026-10-01", endDate: "2026-10-05", budget: null, currency: "USD", travelers: 1, interests: [] };
const expense = { id: "expense-one", name: " Souvenirs ", category: " Shopping ", amount: 25.5, currency: "USD", date: "2026-09-21", revision: 0 };
async function setup() {
  const t = convexTest(schema, modules);
  const [ownerId, otherId] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const owner = t.withIdentity({ subject: `${ownerId}|session` });
  const other = t.withIdentity({ subject: `${otherId}|session` });
  const tripId = await owner.mutation(api.trips.create, trip);
  return { t, owner, other, tripId };
}

test("expenses persist, preserve other expenses, and reject unauthorized or stale changes", async () => {
  const { t, owner, other, tripId } = await setup();
  await expect(t.mutation(api.trips.saveExpense, { tripId, expense })).rejects.toThrow();
  await expect(other.mutation(api.trips.saveExpense, { tripId, expense })).rejects.toThrow();
  await owner.mutation(api.trips.saveExpense, { tripId, expense });
  await owner.mutation(api.trips.saveExpense, { tripId, expense: { ...expense, id: "second", category: "shopping" } });
  let saved = (await owner.query(api.trips.get, { tripId })).expenses!;
  expect(saved).toHaveLength(2);
  expect(saved[0]).toMatchObject({ name: "Souvenirs", category: "Shopping", revision: 1 });
  expect(saved[1].category).toBe("Shopping");
  await expect(owner.mutation(api.trips.saveExpense, { tripId, expense })).rejects.toThrow("changed");
  await owner.mutation(api.trips.saveExpense, { tripId, expense: { ...saved[0], amount: 30, date: "2026-10-02" } });
  await expect(other.mutation(api.trips.removeExpense, { tripId, id: expense.id, revision: 2 })).rejects.toThrow();
  await expect(owner.mutation(api.trips.removeExpense, { tripId, id: expense.id, revision: 1 })).rejects.toThrow("changed");
  saved = (await owner.query(api.trips.get, { tripId })).expenses!;
  expect(saved[0]).toMatchObject({ amount: 30, date: "2026-10-02", revision: 2 });
  await owner.mutation(api.trips.removeExpense, { tripId, id: expense.id, revision: 2 });
  expect((await owner.query(api.trips.get, { tripId })).expenses).toEqual([saved[1]]);
  await expect(owner.mutation(api.trips.saveExpense, { tripId, expense: saved[0] })).rejects.toThrow("changed");
});

test.each([{ name: " " }, { category: " " }, { amount: -1 }, { amount: 1.001 }, { amount: Infinity },
  { date: "2026-02-30" }, { date: "bad" }, { currency: "BTC" }, { currency: "JPY", amount: 1.5 }])("validates expense fields: %j", async changes => {
  const { owner, tripId } = await setup();
  await expect(owner.mutation(api.trips.saveExpense, { tripId, expense: { ...expense, ...changes } })).rejects.toThrow();
  expect((await owner.query(api.trips.get, { tripId })).expenses).toBeUndefined();
});

test("expense count is bounded without truncating existing costs", async () => {
  const { t, owner, tripId } = await setup();
  await t.run(ctx => ctx.db.patch("trips", tripId, { expenses: Array.from({ length: 300 }, (_, i) => ({ ...expense, id: `expense-${i}`, revision: 1 })) }));
  await expect(owner.mutation(api.trips.saveExpense, { tripId, expense })).rejects.toThrow("300");
  await owner.mutation(api.trips.saveExpense, { tripId, expense: { ...expense, id: "expense-0", revision: 1, amount: 0 } });
  expect((await owner.query(api.trips.get, { tripId })).expenses).toHaveLength(300);
});
