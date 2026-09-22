import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { BudgetWorkflow } from "./pages/TripBudgetPage";

test("budget workflow starts on Overview with budget-specific tabs and return navigation", () => {
  const html = renderToStaticMarkup(createElement(BudgetWorkflow, { tripName: "Japan" }));
  const tabs = [...html.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map(match => match[1]);
  expect(tabs).toEqual(["Overview", "Transportation", "Extra Fees", "Expense List", "Graphs"]);
  expect(html).toMatch(/id="budget-tab-0"[^>]*aria-selected="true"/);
  expect(html).toMatch(/id="budget-panel-1"[^>]*hidden/);
  expect(html).toContain('href="#/budget"');
  expect(html).toContain("Japan");
  expect(html).toContain("Total Cost:");
  expect(html).not.toContain("Save trip");
});
