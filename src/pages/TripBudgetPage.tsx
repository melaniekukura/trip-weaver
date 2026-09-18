import { TransportationBudget } from "../TransportationBudget";
import { BudgetGraphs } from "../BudgetGraphs";
import { BudgetCostSummary } from "../BudgetCostSummary";
import { ExtraFees } from "../ExtraFees";
import type { ExtraFeeData } from "../ExtraFees";
import { useConvex, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { tripPlannerPath } from "../tripRoutes";

const tabs = ["Overview", "Transportation", "Extra Fees", "Graphs"];
type BudgetState = { status: "loading" } | { status: "error" } | { status: "ready"; trip: Doc<"trips"> };

export function BudgetWorkflow({ tripName, trip, fees }: { tripName: string; trip?: Doc<"trips">; fees?: ExtraFeeData }) {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  }

  return <section className="trip-planner-editor trip-budget-editor" aria-label={`${tripName} budget`}>
    <div className="trip-modal-form">
      <div className="trip-tabs" role="tablist" aria-label="Budget details">
        {tabs.map((tab, index) => <button key={tab} type="button" role="tab"
          ref={button => { buttons.current[index] = button; }} id={`budget-tab-${index}`}
          aria-controls={`budget-panel-${index}`} aria-selected={active === index} tabIndex={active === index ? 0 : -1}
          onClick={() => setActive(index)} onKeyDown={event => navigateTabs(event, index)}>{tab}</button>)}
      </div>
      <div className="trip-modal-body">
        {tabs.map((tab, index) => <section key={tab} className="trip-tab-panel" role="tabpanel" tabIndex={0}
          id={`budget-panel-${index}`} aria-labelledby={`budget-tab-${index}`} hidden={active !== index}>
          <h3>{tab === "Overview" ? "Budget overview" : tab}</h3>
          {index === 0 && (trip ? <BudgetCostSummary trip={trip} fees={fees?.results} breakdown /> : <p><strong>Total Cost:</strong> --</p>)}
          {index === 1 && trip && <TransportationBudget trip={trip} />}
          {index === 2 && trip && <ExtraFees trip={trip} data={fees} />}
          {index === 3 && trip && <BudgetGraphs trip={trip} fees={fees?.results} />}
        </section>)}
      </div>
      <footer className="trip-modal-footer">
        <div className="modal-footer-actions">
          <a className="secondary-button" href="#/budget">Back to budgets</a>
          <div className="button-row">
            {active > 0 && <button type="button" className="secondary-button" onClick={() => setActive(active - 1)}>Back</button>}
            {active < tabs.length - 1 && <button type="button" className="secondary-button" onClick={() => setActive(active + 1)}>Next</button>}
          </div>
        </div>
      </footer>
    </div>
  </section>;
}

function LiveBudgetWorkflow({ initialTrip }: { initialTrip: Doc<"trips"> }) {
  const liveTrip = useQuery(api.trips.get, { tripId: initialTrip._id });
  const trip = liveTrip ?? initialTrip;
  const fees = useQuery(api.extraFees.latest, { tripId: trip._id });
  return <BudgetWorkflow tripName={trip.name} trip={trip} fees={fees} />;
}

export function TripBudgetPage({ tripId }: { tripId: string }) {
  const convex = useConvex();
  const [state, setState] = useState<BudgetState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void convex.query(api.trips.get, { tripId: tripId as Id<"trips"> }).then(trip => {
      if (!cancelled) {
        setState({ status: "ready", trip });
        document.title = `Budget: ${trip.name} | Trip-Weaver`;
      }
    }).catch(() => { if (!cancelled) setState({ status: "error" }); });
    return () => { cancelled = true; };
  }, [convex, tripId, retry]);

  return <div className="trip-planner-page">
    <a className="planner-back" href="#/budget">← All budgets</a>
    <div className="planner-page-heading">
      <h1 className="planner-page-title">{state.status === "ready" ? `Budget: ${state.trip.name}` : "Budget"}</h1>
      <a className="primary-button" href={`#${tripPlannerPath(tripId)}`}>Plan My Trip</a>
    </div>
    {state.status === "loading" && <p role="status">Loading your trip budget…</p>}
    {state.status === "error" && <div className="empty-state" role="alert">
      <p>This trip budget could not be opened. The trip may be unavailable, or you may not have access.</p>
      <button type="button" className="secondary-button" onClick={() => setRetry(retry + 1)}>Try again</button>
    </div>}
    {state.status === "ready" && <LiveBudgetWorkflow key={tripId} initialTrip={state.trip} />}
  </div>;
}
