import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { isSupportedCurrency } from "./currencies";

export const expenseFields = v.object({
  id: v.string(), name: v.string(), category: v.string(), amount: v.number(), currency: v.string(), date: v.string(), revision: v.number(),
});
export type Expense = Infer<typeof expenseFields>;
export const maxExpenses = 300;

export function validateExpense(expense: Expense): Expense {
  const name = expense.name.trim(), category = expense.category.trim().replace(/\s+/g, " ");
  const date = new Date(`${expense.date}T00:00:00Z`);
  if (!name || name.length > 120) throw new ConvexError({ message: "Enter an expense name of up to 120 characters." });
  if (!category || category.length > 80) throw new ConvexError({ message: "Enter a category of up to 80 characters." });
  if (!/^[\w-]{1,80}$/.test(expense.id) || !Number.isInteger(expense.revision) || expense.revision < 0) {
    throw new ConvexError({ message: "Invalid expense identifier or revision." });
  }
  if (!isSupportedCurrency(expense.currency)) throw new ConvexError({ message: "Choose a supported currency." });
  const scale = expense.currency === "JPY" ? 1 : 100;
  if (!Number.isFinite(expense.amount) || expense.amount < 0 || expense.amount > 1_000_000_000 ||
    Math.abs(expense.amount * scale - Math.round(expense.amount * scale)) > 0.0001) {
    throw new ConvexError({ message: `Enter an amount between 0 and 1,000,000,000 with ${scale === 1 ? "no" : "at most two"} decimal places.` });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.date) || !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== expense.date || expense.date < "1900-01-01") {
    throw new ConvexError({ message: "Enter a valid expense date from 1900 onward." });
  }
  return { ...expense, name, category };
}
