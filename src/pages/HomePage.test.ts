import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { HomePage } from "./HomePage";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("convex/react", () => ({
  useConvex: () => ({ query: vi.fn() }),
  useConvexAuth: () => ({ isAuthenticated: false }),
  useMutation: () => vi.fn(),
  useQuery: query,
}));

test("guests see the standard homepage without protected profile defaults", () => {
  const html = renderToStaticMarkup(createElement(HomePage, { onSignInRequired: vi.fn() }));
  expect(html).toContain("Trip-Weaver");
  expect(html).toContain('id="planner"');
  expect(html).toContain("Leaving from");
  expect(html).toContain("Going to");
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls.every(([, args]) => args === "skip")).toBe(true);
});
