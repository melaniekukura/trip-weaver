import { isValidElement } from "react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import { TransportationTab } from "./TransportationTab";
import { ReturnFlightPicker } from "./ReturnFlightPicker";
import { flightPlanItinerary } from "../convex/flightPlanFields";

const mocks = vi.hoisted(() => ({ query: vi.fn(), mutate: vi.fn(), states: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: mocks.query, useMutation: () => mocks.mutate, useAction: () => vi.fn() }));
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, mocks.states],
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => effect(),
  useRef: (initial: unknown) => ({ current: initial }), useId: () => "test",
}));

function find(node: ReactNode, predicate: (type: unknown, props: Record<string, unknown>) => boolean): React.ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) { const found = find(child, predicate); if (found) return found; }
  }
  if (!isValidElement<Record<string, unknown>>(node)) return;
  if (predicate(node.type, node.props)) return node;
  return find(node.props.children as ReactNode, predicate);
}
const request = { origin: "DTW", destination: "LAX", departureDate: "2026-10-15", returnDate: "2026-10-22", tripType: "round-trip" as const };
const outbound = { _id: "outgoing", tripId: "trip", flight: { airline: "Delta", departure: "8:00 AM", arrival: "10:00 AM", duration: "2 hr", stops: "Nonstop", amount: 400, currency: "USD" } };

test("a rejected return refresh does not clear the persisted selection", async () => {
  mocks.mutate.mockReset().mockRejectedValue(new Error("Rate limited"));
  mocks.query.mockReturnValue({ run: { status: "completed", finishedAt: 0 }, sources: [] });
  const select = vi.fn();
  const tree = ReturnFlightPicker({ tripId: "trip" as Id<"trips">, request,
    outbound: outbound as never, selectedReturn: outbound as never, onSelectReturn: select, onClose: vi.fn() });
  const button = find(tree, (type, props) => type === "button" && props.className === "primary-button")!;
  (button.props.onClick as () => void)();
  await vi.waitFor(() => expect(mocks.states).toHaveBeenCalledWith("Unable to search for return flights."));
  expect(select).not.toHaveBeenCalled();
});

test.each([false, true])("outgoing refresh preserves selection and saves dates before searching (stale booked: %s)", async staleBooked => {
  mocks.states.mockClear();
  const events: string[] = [];
  mocks.mutate.mockReset().mockImplementation(async () => { events.push("search"); throw new Error("Rate limited"); });
  const itinerary = flightPlanItinerary({ origin: "DTW", destinations: ["LAX"], startDate: request.departureDate, endDate: request.returnDate });
  const trip = { origin: "DTW", destinations: ["LAX"], startDate: "2026-10-15", endDate: "2026-10-22", flightPlan: { revision: 1, legs: [{ index: 0, itinerary, request, outbound, booked: staleBooked }] } };
  mocks.query.mockImplementation((_ref, args) => args === "skip" ? undefined : args?.flight ? { run: { status: "completed" }, sources: [] } : trip);
  const tree = TransportationTab({ tripId: "trip" as Id<"trips">, origin: "DTW", destinations: [{ id: "la", value: "LAX" }],
    departureDate: request.departureDate, returnDate: staleBooked ? "2026-10-23" : request.returnDate,
    onEditDetails: vi.fn(), onSaveTrip: async () => { events.push("save"); return "trip" as Id<"trips">; } });
  const leg = find(tree, type => typeof type === "function" && type.name === "TransportationLeg")!;
  const body = (leg.type as (props: unknown) => ReactNode)(leg.props);
  const button = find(body, (type, props) => type === "button" && props.className === "primary-button")!;
  expect(button.props.disabled).toBe(false);
  (button.props.onClick as () => void)();
  await vi.waitFor(() => expect(mocks.states).toHaveBeenCalledWith("Rate limited"));
  expect(events).toEqual(["save", "search"]);
  expect(mocks.mutate).toHaveBeenCalledTimes(1);
  expect(mocks.mutate.mock.calls[0][0]).not.toHaveProperty("action");
});

test.each([true, false])("home prompt receives effective round-trip intent (single leg: %s)", single => {
  const itinerary = flightPlanItinerary({ origin: "DTW", destinations: ["LAX"], startDate: request.departureDate, endDate: request.returnDate });
  mocks.query.mockImplementation((_ref, args) => args === "skip" ? undefined : args?.flight ? { run: { status: "completed" }, sources: [] } :
    { origin: "DTW", destinations: single ? ["LAX"] : ["LAX", "DTW"], startDate: request.departureDate, endDate: request.returnDate,
      flightPlan: { revision: 1, legs: [{ index: 0, itinerary, request, outbound }] } });
  const onRoundTripChange = vi.fn();
  const tree = TransportationTab({ tripId: "trip" as Id<"trips">, origin: "DTW",
    destinations: single ? [{ id: "la", value: "LAX" }] : [{ id: "la", value: "LAX" }, { id: "home", value: "DTW" }],
    departureDate: request.departureDate, returnDate: request.returnDate,
    onRoundTripChange, onEditDetails: vi.fn(), onSaveTrip: vi.fn() });
  const leg = find(tree, type => typeof type === "function" && type.name === "TransportationLeg")!;
  (leg.type as (props: unknown) => ReactNode)(leg.props);
  expect(onRoundTripChange).toHaveBeenCalledWith(single);
  const confirm = find(tree, (type, props) => type === "button" && props.children === "Confirm flight plan")!;
  expect(confirm.props.disabled).toBe(true);
});
