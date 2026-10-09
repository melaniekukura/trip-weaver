import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";
import { ExpenseList, todayDate } from "./ExpenseList";
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));

test("expense list offers existing and custom categories, today, and editable saved rows", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 21, 23, 45));
  try {
    expect(todayDate()).toBe("2026-09-21");
    const trip = { _id: "trip", currency: "USD", expenses: [{ id: "gift", name: "Gift", category: "Shopping", amount: 12.34, currency: "USD", date: "2026-10-01", revision: 1 }] } as Doc<"trips">;
    const html = renderToStaticMarkup(createElement(ExpenseList, { trip }));
    for (const text of ["Miscellaneous", "Shopping", "Choose or create a category", "$12.34", 'value="2026-09-21"', 'aria-label="Edit Gift"', 'aria-label="Delete Gift"']) expect(html).toContain(text);
  } finally { vi.useRealTimers(); }
});

test("fixed expense lists show only their category without a category editor", () => {
  const trip = { _id: "trip", currency: "USD", expenses: [
    { id: "bus", name: "Coach ticket", category: "Transportation", amount: 25, currency: "USD", date: "2026-10-01", revision: 1 },
    { id: "metro", name: "Metro pass", category: "Local transportation", amount: 8, currency: "USD", date: "2026-10-01", revision: 1 },
    { id: "gift", name: "Gift", category: "Shopping", amount: 12, currency: "USD", date: "2026-10-01", revision: 1 },
  ] } as Doc<"trips">;
  const html = renderToStaticMarkup(createElement(ExpenseList, { trip, fixedCategory: "Transportation", embedded: true }));
  expect(html).toContain("Coach ticket");
  expect(html).toContain("Metro pass");
  expect(html).not.toContain("Gift");
  expect(html).not.toContain("Category");
  expect(html).not.toContain("<form");
});
