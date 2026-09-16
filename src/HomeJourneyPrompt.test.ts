import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { HomeJourneyPrompt } from "./HomeJourneyPrompt";

const props = { origin: "Detroit — Metropolitan (DTW)", destination: "Rome, Italy (ROM; all airports)", onAdd: vi.fn(), onNotNeeded: vi.fn(), onReset: vi.fn() };
test("home prompt identifies the endpoint and offers explicit choices", () => {
  const html = renderToStaticMarkup(createElement(HomeJourneyPrompt, { ...props, status: "missing" }));
  expect(html).toContain("This trip ends in Rome, not Detroit");
  expect(html).toContain("Add flight home");
  expect(html).toContain("Not needed");
  for (const button of html.match(/<button[^>]*>/g)!) expect(button).toContain('type="button"');
  expect(renderToStaticMarkup(createElement(HomeJourneyPrompt, { ...props, status: "covered" }))).toBe("");
});
test("waivers can be changed and full itineraries cannot append another stop", () => {
  const waived = renderToStaticMarkup(createElement(HomeJourneyPrompt, { ...props, status: "not-needed" }));
  expect(waived).toContain("Flight home marked as not needed");
  expect(waived).toContain("Change");
  const full = renderToStaticMarkup(createElement(HomeJourneyPrompt, { ...props, status: "missing", full: true }));
  expect(full).toMatch(/<button[^>]*disabled[^>]*>Add flight home/);
  expect(full).toContain("20-stop limit");
});
