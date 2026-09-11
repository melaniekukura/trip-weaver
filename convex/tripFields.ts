import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";

export const tripFields = v.object({
  name: v.string(),
  origin: v.string(),
  destinations: v.array(v.string()),
  startDate: v.string(),
  endDate: v.string(),
  budget: v.union(v.number(), v.null()),
  currency: v.string(),
  travelers: v.number(),
  interests: v.array(v.string()),
  accessibility: v.optional(v.string()),
});

function invalid(message: string): never {
  throw new ConvexError({ code: "INVALID_TRIP", message });
}

function text(value: string, label: string, max: number) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) {
    invalid(`${label} must contain between 1 and ${max} characters.`);
  }
  return trimmed;
}

function date(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value || value < "1900-01-01") {
    invalid("Enter a valid calendar date from 1900 onward.");
  }
  return value;
}

export function validateTrip(input: Infer<typeof tripFields>) {
  const startDate = date(input.startDate);
  const endDate = date(input.endDate);
  if (endDate < startDate) invalid("The end date must be on or after the start date.");
  if (input.destinations.length < 1 || input.destinations.length > 20) {
    invalid("Add between 1 and 20 destinations.");
  }
  if (input.interests.length > 20) invalid("Add at most 20 interests.");
  const accessibility = input.accessibility?.trim();
  if (accessibility !== undefined && accessibility.length > 2000) {
    invalid("Accessibility notes must contain at most 2,000 characters.");
  }
  if (!Number.isInteger(input.travelers) || input.travelers < 1 || input.travelers > 100) {
    invalid("Travelers must be a whole number between 1 and 100.");
  }
  if (input.budget !== null && (!Number.isFinite(input.budget) || input.budget < 0 ||
      input.budget > 1_000_000_000 || Math.abs(input.budget * 100 - Math.round(input.budget * 100)) > 0.0001)) {
    invalid("Budget must be between 0 and 1,000,000,000 with at most two decimal places.");
  }
  const currency = input.currency.trim().toUpperCase();
  if (!["USD", "EUR", "GBP", "CAD", "AUD", "JPY"].includes(currency)) {
    invalid("Choose a supported currency.");
  }
  return {
    name: text(input.name, "Trip name", 120),
    origin: text(input.origin, "Origin", 120),
    destinations: input.destinations.map((value) => text(value, "Destination", 120)),
    startDate,
    endDate,
    budget: input.budget,
    currency,
    travelers: input.travelers,
    interests: [...new Set(input.interests.map((value) => text(value, "Interest", 80)))],
    ...(accessibility !== undefined ? { accessibility } : {}),
  };
}
