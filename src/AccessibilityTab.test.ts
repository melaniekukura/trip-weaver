import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { AccessibilityTab, accessibilitySuggestions } from "./AccessibilityTab";

test("profile accessibility is a search bar and removable chips without browse dropdowns", () => {
  const html = renderToStaticMarkup(createElement(AccessibilityTab, { compact: true, initialValue: "Step-free access\nQuiet environments" }));
  expect(html).toContain('type="text"');
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-autocomplete="list"');
  expect(html.match(/class="accessibility-chip"/g)).toHaveLength(2);
  expect(html).toContain('aria-label="Remove Step-free access"');
  expect(html).toContain('aria-label="Remove Quiet environments"');
  expect(html).not.toContain("Browse by category");
  expect(html).not.toContain("<details");
  expect(html).not.toContain("<select");
});

test("accessibility suggestions use official chips and match words or categories", () => {
  expect(accessibilitySuggestions(" BRAILLE ")).toEqual([{ value: "Braille signage", category: "Vision" }]);
  expect(accessibilitySuggestions("vision").map(item => item.value)).toContain("Braille signage");
  expect(accessibilitySuggestions("transport wheelchair").map(item => item.value)).toEqual(["Wheelchair-accessible transportation"]);
  expect(accessibilitySuggestions("braille", ["Braille signage"])).toEqual([]);
  expect(accessibilitySuggestions("")).toEqual([]);
  expect(accessibilitySuggestions("My custom requirement")).toEqual([]);
});
test("trip accessibility retains category browsing and makes copied requirements removable", () => {
  const html = renderToStaticMarkup(createElement(AccessibilityTab, { initialValue: "Step-free access" }));
  expect(html).toContain("Browse by category");
  expect(html).toContain('class="accessibility-chip"');
  expect(html).toContain('aria-label="Remove Step-free access"');
  expect(html).toContain('name="accessibility" value="Step-free access"');
});
