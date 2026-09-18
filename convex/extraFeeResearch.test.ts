import { expect, test } from "vitest";
import type { Doc } from "./_generated/dataModel";
import { feeTargets, feeSearchKey, feeSubtotals, parseFeeQuote } from "./extraFeeResearch";
import type { FeeResult } from "./extraFeeResearch";

const trip = { origin: "DTW", destinations: ["Paris"], startDate: "2026-10-01", endDate: "2026-10-05", travelers: 2 } as Doc<"trips">;
const favorite = { _id: "favorite", item: { title: "Museum", destination: "Paris", url: "https://museum.example/tickets" }, itinerary: { date: "2026-10-02" } } as Doc<"interestFavorites">;
test("fee targets use itinerary activities, quantities and dates, not shortlisted ideas", async () => {
  expect(feeTargets(trip, [{ ...favorite, itinerary: undefined }])).toEqual([]);
  const targets = feeTargets(trip, [favorite]);
  expect(targets).toHaveLength(2);
  expect(targets[0]).toMatchObject({ quantity: 2, date: "2026-10-02", category: "activities" });
  expect(await feeSearchKey(targets)).not.toBe(await feeSearchKey(feeTargets({ ...trip, travelers: 3 }, [favorite])));
});

test("rental-car targets are opt-in and restaurant targets cannot become admission fees", () => {
  expect(feeTargets({ ...trip, extraFeeSettings: { rentalCar: true, rentalProvider: "Hertz", parkingLocation: "Museum car park", carDays: 3, bagsPerTraveler: 0 } }, [])).toHaveLength(2);
  const restaurant = { ...favorite, item: { ...favorite.item, title: "A restaurant" } };
  expect(feeTargets(trip, [restaurant])).toHaveLength(1);
  expect(feeTargets(trip, [restaurant])[0].category).toBe("restaurants");
});

test("only explicit, applicable, source-backed amounts are accepted", () => {
  const data = { official: true, applicable: true, amount: 25, currency: "EUR", evidence: "Adult admission EUR 25", note: "" };
  expect(parseFeeQuote(data, "Adult admission EUR 25", "https://museum.example/tickets")).toMatchObject({ amount: 25, currency: "EUR" });
  for (const changed of [{ ...data, amount: 20 }, { ...data, applicable: false }, { ...data, official: false },
    { ...data, currency: "USD" }, { ...data, evidence: "Invented EUR 25" }, { ...data, amount: -1 }]) {
    expect(parseFeeQuote(changed, "Adult admission EUR 25", "https://museum.example/tickets")).toBeNull();
  }
  expect(parseFeeQuote(data, "Adult admission EUR 25", "http://localhost/internal")).toBeNull();
});

test("unknown fees remain unknown, and subtotals never mix currencies", () => {
  const target = feeTargets(trip, [favorite])[0];
  const rows: FeeResult[] = [
    { target, status: "priced", amount: 25, currency: "EUR" },
    { target: { ...target, id: "usd" }, status: "priced", amount: 10, currency: "USD" },
    { target: { ...target, id: "unknown" }, status: "unknown" },
  ];
  expect(feeSubtotals(rows)[0]).toEqual({ category: "activities", unknown: 1, amounts: { EUR: 50, USD: 20 } });
});
