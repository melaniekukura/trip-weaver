export type GuestTripDraft = {
  draftId: string;
  name: string;
  origin: string;
  destinations: string[];
  startDate: string;
  endDate: string;
  travelers: number;
  interests: string[];
  accessibility: string;
  homeReturnNotNeededFor: string;
};

const storageKey = "trip-weaver-guest-trip";

export function createGuestTripDraft(values: Omit<GuestTripDraft, "draftId">): GuestTripDraft {
  return { draftId: crypto.randomUUID(), ...values };
}

export function readGuestTripDraft(): GuestTripDraft | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null");
    if (!value || typeof value !== "object") return null;
    const draft = value as Partial<GuestTripDraft>;
    if (typeof draft.draftId !== "string" || typeof draft.name !== "string" || typeof draft.origin !== "string" ||
      !Array.isArray(draft.destinations) || !draft.destinations.every(item => typeof item === "string") ||
      typeof draft.startDate !== "string" || typeof draft.endDate !== "string" || typeof draft.travelers !== "number" ||
      !Array.isArray(draft.interests) || !draft.interests.every(item => typeof item === "string") ||
      typeof draft.accessibility !== "string" || typeof draft.homeReturnNotNeededFor !== "string") return null;
    return draft as GuestTripDraft;
  } catch { return null; }
}

export function saveGuestTripDraft(draft: GuestTripDraft) {
  window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
}

export function clearGuestTripDraft(draftId: string) {
  if (readGuestTripDraft()?.draftId === draftId) window.sessionStorage.removeItem(storageKey);
}

export function guestDraftTripInput(draft: GuestTripDraft) {
  return { name: draft.name, origin: draft.origin, destinations: draft.destinations, startDate: draft.startDate,
    endDate: draft.endDate, travelers: draft.travelers, interests: draft.interests, accessibility: draft.accessibility,
    homeReturnNotNeededFor: draft.homeReturnNotNeededFor, budget: null, currency: "USD" };
}
