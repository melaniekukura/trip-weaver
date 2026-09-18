import { expect, test } from "vitest";
import { airlineNames, rankReturnFlights } from "./airlineNames";

test("normalizes joined and delimited carriers, ignoring operating-airline notes", () => {
  expect(airlineNames("LufthansaUnited")).toEqual(airlineNames("United and Lufthansa"));
  expect(airlineNames("American, British AirwaysOperated by Envoy Air")).toEqual(["american", "british airways"]);
  expect(airlineNames("SWISSUnited")).toEqual(["swiss", "united"]);
});

test("ranks shared airlines first by price and retains cheaper unrelated returns", () => {
  const options = [
    { flight: { airline: "Delta", amount: 400 } },
    { flight: { airline: "United", amount: 800 } },
    { flight: { airline: "Lufthansa", amount: 700 } },
    { flight: { airline: "British Airways", amount: 500 } },
  ];
  expect(rankReturnFlights(options, "LufthansaUnited").map(option => option.flight.amount)).toEqual([700, 800, 400, 500]);
  expect(options[0].flight.airline).toBe("Delta");
  expect(rankReturnFlights(options, "Frontier").map(option => option.flight.amount)).toEqual([400, 500, 700, 800]);
});

test("airline aliases do not match similarly named travel sellers", () => {
  expect(airlineNames("Delta Air Lines")).toEqual(airlineNames("Delta"));
  expect(airlineNames("United Airlines")).toEqual(airlineNames("United"));
  expect(airlineNames("Delta Travel Agency")).not.toEqual(airlineNames("Delta"));
});
