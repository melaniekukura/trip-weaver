import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { profileFlightFilters, useDefaultOrigin } from "./profileDefaults";
import { matchesFlightFilters } from "./flightFilters";
import { ProfileForm } from "./pages/ProfilePage";
const { auth, profile } = vi.hoisted(() => ({ auth: { value: true }, profile: { defaultAccessibility: "Step-free access", name: "Traveler", email: "traveler@example.test", defaultAirport: "Detroit — Detroit Metro (DTW)", maxConnections: 1, revision: 1 } }));
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: auth.value }),
  useQuery: (_reference: unknown, args: unknown) => args === "skip" ? undefined : profile, useMutation: () => vi.fn() }));
test("maximum connections includes nonstop and shorter itineraries and rejects unknown counts", () => {
  const flight = { departure: "10:00 AM", arrival: "1:00 PM", amount: 100, stops: "Nonstop" };
  for (const limit of [0, 1, 2, 3]) {
    const filters = profileFlightFilters(limit);
    expect(matchesFlightFilters(flight, filters)).toBe(true);
    for (const count of [1, 2, 3, 4]) expect(matchesFlightFilters({ ...flight, stops: `${count} stop${count === 1 ? "" : "s"}` }, filters)).toBe(count <= limit);
    expect(matchesFlightFilters({ ...flight, stops: "Unknown" }, filters)).toBe(false);
  }
  expect(profileFlightFilters(null).stops).toBe("any");
});
function Origin({ initial }: { initial?: string }) {
  const [origin] = useDefaultOrigin(initial);
  return createElement("span", null, origin);
}
test("defaults fill new origins while saved or explicitly selected origins take precedence", () => {
  expect(renderToStaticMarkup(createElement(Origin))).toContain("DTW");
  expect(renderToStaticMarkup(createElement(Origin, { initial: "Los Angeles (LAX)" }))).toContain("LAX");
  expect(renderToStaticMarkup(createElement(Origin, { initial: "" }))).toBe("<span></span>");
  auth.value = false;
  expect(renderToStaticMarkup(createElement(Origin))).toBe("<span></span>");
  auth.value = true;
});
test("profile shows account identity and optional airport and connection preferences", () => {
  const html = renderToStaticMarkup(createElement(ProfileForm, { profile }));
  for (const text of ["Personal information", "Travel settings", "Default airport (optional)", "Maximum connections", "traveler@example.test", "Traveler", "DTW", "Save profile"]) expect(html).toContain(text);
  expect(html).toContain('readOnly=""');
});
