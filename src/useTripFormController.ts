import { useConvex, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { flushSync } from "react-dom";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { DestinationStop } from "./DestinationsEditor";
import { tripPreferences } from "./tripPreferences";

export function firstInvalidTripField(form: ParentNode) {
  return [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "[data-required-field]:invalid")][0];
}

export function useTripFormController({ trip, form, planning, origin, destinations, homeReturnNotNeededFor, setActive }: {
  trip?: Doc<"trips">;
  form: RefObject<HTMLFormElement | null>;
  planning: boolean;
  origin: string;
  destinations: DestinationStop[];
  homeReturnNotNeededFor: string;
  setActive: Dispatch<SetStateAction<number>>;
}) {
  const convex = useConvex();
  const create = useMutation(api.trips.create);
  const update = useMutation(api.trips.update);
  const [savedTrip, setSavedTrip] = useState(trip);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const createdId = useRef<Id<"trips"> | null>(null);
  const saveLock = useRef(false);

  async function saveTrip(homeChange?: { stops: DestinationStop[]; waiver: string }): Promise<Id<"trips"> | null> {
    if (saveLock.current || !form.current) return null;
    const invalid = firstInvalidTripField(form.current);
    if (invalid) {
      const panel = invalid.closest<HTMLElement>("[data-tab]");
      flushSync(() => setActive(Number(panel?.dataset.tab ?? 0)));
      invalid.focus();
      invalid.reportValidity();
      return null;
    }
    const data = new FormData(form.current);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const changes = {
      name: value("name"), origin,
      destinations: (homeChange?.stops ?? destinations).map(stop => stop.value),
      homeReturnNotNeededFor: homeChange?.waiver ?? homeReturnNotNeededFor,
      startDate: value("startDate"), endDate: value("endDate"), travelers: Number(value("travelers")),
      ...tripPreferences(data, savedTrip, planning),
    };
    saveLock.current = true;
    setPending(true); setError(""); setNotice("");
    try {
      let existing = savedTrip;
      if (!existing && createdId.current) existing = await convex.query(api.trips.get, { tripId: createdId.current });
      const tripId = existing?._id ?? await create(changes);
      if (!existing) createdId.current = tripId;
      else await update({ tripId, changes, expectedUpdatedAt: existing.updatedAt });
      const persisted = await convex.query(api.trips.get, { tripId });
      setSavedTrip(persisted);
      if (planning) setNotice("Trip changes saved.");
      return tripId;
    } catch (err) {
      setError(err instanceof ConvexError && typeof err.data === "object" && err.data !== null &&
        "message" in err.data && typeof err.data.message === "string" ? err.data.message : "Unable to save your trip. Please try again.");
      return null;
    } finally {
      saveLock.current = false;
      setPending(false);
    }
  }

  return { savedTrip, pending, error, notice, saveTrip };
}
