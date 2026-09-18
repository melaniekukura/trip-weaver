import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import type { FeeResult } from "../convex/extraFeeResearch";
import { budgetCosts, formatCost } from "./budgetCosts";

export function BudgetCostSummary({ trip, fees }: { trip: Doc<"trips">; fees?: FeeResult[] }) {
  const costs = budgetCosts(trip, fees);
  const totals = Object.entries(costs.totals);
  return <div className="budget-cost-summary" aria-live="polite">
    <p><strong>Total Cost:</strong> {totals.length ? totals.map(([currency, amount]) => `${formatCost(amount, currency)} ${currency}`).join(" + ") : "--"}</p>
    {fees === undefined ? <p className="field-hint">Loading extra fees…</p> : costs.unknown > 0 &&
      <p className="field-hint">Partial total · {costs.unknown} {costs.unknown === 1 ? "price" : "prices"} not confirmed.</p>}
    {totals.length > 1 && <p className="field-hint">Currencies shown separately; no conversion applied.</p>}
  </div>;
}
export function TripCardCost({ trip }: { trip: Doc<"trips"> }) {
  const fees = useQuery(api.extraFees.latest, { tripId: trip._id });
  return <BudgetCostSummary trip={trip} fees={fees?.results} />;
}
