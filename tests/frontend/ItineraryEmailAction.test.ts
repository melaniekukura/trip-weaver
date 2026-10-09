import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { expect, test, vi } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import { ItineraryEmailAction } from "./ItineraryEmailAction";

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: (reference: unknown) => getFunctionName(reference as never) === "itineraryEmails:account"
    ? { email: "traveler@example.test", verified: true }
    : null,
}));

test("itinerary email defaults the editable recipient to the account email", () => {
  const html = renderToStaticMarkup(createElement(ItineraryEmailAction, {
    tripId: "trip" as Id<"trips">,
    onSaveTrip: vi.fn(),
  }));
  expect(html).toContain("Recipient email");
  expect(html).toContain('type="email"');
  expect(html).toContain('value="traveler@example.test"');
  expect(html).toContain("Email my itinerary");
});
