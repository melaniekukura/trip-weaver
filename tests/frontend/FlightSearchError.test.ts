import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { FlightSearchError } from "./FlightSearchError";

test("shows a reference and actionable diagnostic, with a fallback for older searches", () => {
  const html = renderToStaticMarkup(createElement(FlightSearchError, { run: {
    _id: "search-reference", error: "Return search failed.", diagnostic: {
      stage: "outbound_match", reason: "outbound_missing", code: "FLIGHTS_UNAVAILABLE", labelCount: 12, matchCount: 0,
    },
  } }));
  for (const text of ["Search details", "search-reference", "Match selected outgoing flight", "not found", "Matching flights: 0"]) expect(html).toContain(text);
  expect(renderToStaticMarkup(createElement(FlightSearchError, { run: { _id: "old-search", error: "Failed" } })))
    .toContain("Retry to capture the failed step");
});
