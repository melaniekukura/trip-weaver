import { useConvex } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { TripForm } from "../TripForm";

type TripState = { status: "loading" } | { status: "error" } | { status: "ready"; trip: Doc<"trips"> };

export function TripPlannerPage({ tripId }: { tripId: string }) {
  const convex = useConvex();
  const [state, setState] = useState<TripState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void convex.query(api.trips.get, { tripId: tripId as Id<"trips"> }).then((trip) => {
      if (!cancelled) {
        setState({ status: "ready", trip });
        document.title = `${trip.name} | Trip-Weaver`;
      }
    }).catch(() => { if (!cancelled) setState({ status: "error" }); });
    return () => { cancelled = true; };
  }, [convex, tripId, retry]);

  return <div className="trip-planner-page">
    <a className="planner-back" href="#/trips">← All trips</a>
    <h1 className="planner-page-title">Plan My Trip</h1>
    {state.status === "loading" && <p role="status">Loading your trip…</p>}
    {state.status === "error" && <div className="empty-state" role="alert">
      <p>This trip could not be opened. It may be unavailable, or you may not have access.</p>
      <button className="secondary-button" type="button" onClick={() => setRetry(retry + 1)}>Try again</button>
    </div>}
    {state.status === "ready" && <TripForm key={tripId} trip={state.trip} mode="page" onClose={() => { window.location.hash = "/trips"; }} />}
  </div>;
}
