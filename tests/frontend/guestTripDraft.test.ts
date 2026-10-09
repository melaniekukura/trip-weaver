import { beforeEach, expect, test, vi } from "vitest";
import { clearGuestTripDraft, createGuestTripDraft, guestDraftTripInput, readGuestTripDraft, saveGuestTripDraft } from "./guestTripDraft";

const values = { name: "California", origin: "DTW", destinations: ["LAX"], startDate: "2026-10-15",
  endDate: "2026-10-22", travelers: 1, interests: ["Museums"], accessibility: "Step-free access",
  homeReturnNotNeededFor: "" };

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", { sessionStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  vi.stubGlobal("crypto", { randomUUID: () => "draft-id" });
});

test("guest drafts survive sign-in navigation and convert to trip input", () => {
  const draft = createGuestTripDraft(values);
  saveGuestTripDraft(draft);
  expect(readGuestTripDraft()).toEqual(draft);
  expect(guestDraftTripInput(draft)).toMatchObject({ ...values, budget: null, currency: "USD" });
  clearGuestTripDraft(draft.draftId);
  expect(readGuestTripDraft()).toBeNull();
});
