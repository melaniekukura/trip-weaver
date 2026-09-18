import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { AirlineBookingLink } from "./AirlineBookingLink";
import { airlineSearchLinks } from "./airlineSearchLinks";
import type { Doc } from "../convex/_generated/dataModel";

vi.mock("convex/react", () => ({ useAction: () => vi.fn() }));

test("manual airline backup is available before the browser lookup, with honest selection labels", () => {
  const outbound = { _id: "outbound", tripId: "trip", flight: { airline: "Delta, Air EuropaOperated by Air Europa Express",
    departure: "6:05 PM on Fri, Sep 25", arrival: "2:55 PM on Sat, Sep 26", originAirport: "DTW", destinationAirport: "MXP", stops: "2 stops", duration: "14 hr 50 min" } } as Doc<"researchSources">;
  const html = renderToStaticMarkup(createElement(AirlineBookingLink, { tripId: outbound.tripId, outboundId: outbound._id, outbound }));
  expect(html).toContain("Find booking options on Google Flights");
  expect(html).toContain("https://www.delta.com/flightsearch/book-a-flight");
  expect(html).toContain("https://www.aireuropa.com/us/en/home");
  expect(html).toContain("your selection is not prefilled");
  expect(html).toContain("Flight numbers are not available here");
  expect(html).toContain("DTW");
  expect(html).not.toContain("Get airline booking link");
  expect(airlineSearchLinks(["Unknown Airline"])).toEqual([]);
  expect(airlineSearchLinks(["LufthansaUnited", "United Airlines"])).toHaveLength(2);
});
