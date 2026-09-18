import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { AccessibilityTab } from "./AccessibilityTab";

test("profile accessibility is a search bar and removable chips without browse dropdowns", () => {
  const html = renderToStaticMarkup(createElement(AccessibilityTab, { compact: true, initialValue: "Step-free access\nQuiet environments" }));
  expect(html).toContain('type="text"');
  expect(html.match(/class="accessibility-chip"/g)).toHaveLength(2);
  expect(html).toContain('aria-label="Remove Step-free access"');
  expect(html).toContain('aria-label="Remove Quiet environments"');
  expect(html).not.toContain("Browse by category");
  expect(html).not.toContain("<details");
  expect(html).not.toContain("<select");
});
test("trip accessibility retains category browsing and makes copied requirements removable", () => {
  const html = renderToStaticMarkup(createElement(AccessibilityTab, { initialValue: "Step-free access" }));
  expect(html).toContain("Browse by category");
  expect(html).toContain('class="accessibility-chip"');
  expect(html).toContain('aria-label="Remove Step-free access"');
  expect(html).toContain('name="accessibility" value="Step-free access"');
});
