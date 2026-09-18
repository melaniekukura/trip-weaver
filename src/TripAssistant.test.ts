import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import AssistantMessageContent from "./AssistantMessageContent";

test("assistant messages render sanitized Markdown and HTML", () => {
  const text = "<strong>Confirmed</strong>\n\n1. **Flight selected**\n2. <script>alert('no')</script>Hotel missing";
  const html = renderToStaticMarkup(createElement(AssistantMessageContent, { text }));
  expect(html).toContain("<strong>Confirmed</strong>");
  expect(html).toContain("<ol>");
  expect(html).toContain("<strong>Flight selected</strong>");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("alert(&#x27;no&#x27;)");
});
