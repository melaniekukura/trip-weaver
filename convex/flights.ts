import { ConvexError, v } from "convex/values";

import { action } from "./_generated/server";

const flightValidator = v.object({
  airline: v.string(),
  arrivalAt: v.string(),
  arrivalLocation: v.string(),
  bookingUrl: v.union(v.string(), v.null()),
  departureAt: v.string(),
  departureLocation: v.string(),
  durationMinutes: v.number(),
  flightNumber: v.string(),
  price: v.object({
    amount: v.number(),
    currency: v.string(),
  }),
  stops: v.number(),
});

export const search = action({
  args: {
    source: v.string(),
    destination: v.string(),
  },
  returns: v.object({
    dataSource: v.union(v.literal("mock"), v.literal("firecrawl")),
    destination: v.string(),
    flights: v.array(flightValidator),
    source: v.string(),
  }),
  handler: async (_ctx, args) => {
    const source = args.source.trim();
    const destination = args.destination.trim();

    if (!source || !destination) {
      throw new ConvexError({
        code: "INVALID_LOCATION",
        message: "Source and destination are required.",
      });
    }

    if (source.toLocaleLowerCase() === destination.toLocaleLowerCase()) {
      throw new ConvexError({
        code: "INVALID_ROUTE",
        message: "Source and destination must be different.",
      });
    }

    const departureAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    const arrivalAt = new Date(departureAt.getTime() + 3 * 60 * 60 * 1_000);

    return {
      dataSource: "mock" as const,
      source,
      destination,
      flights: [
        {
          airline: "Trip Weaver Demo Air",
          arrivalAt: arrivalAt.toISOString(),
          arrivalLocation: destination,
          bookingUrl: null,
          departureAt: departureAt.toISOString(),
          departureLocation: source,
          durationMinutes: 180,
          flightNumber: "TW100",
          price: {
            amount: 299,
            currency: "USD",
          },
          stops: 0,
        },
      ],
    };
  },
});
