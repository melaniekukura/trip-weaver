import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { defaultFeeSettings, feeSubtotals } from "../convex/extraFeeResearch";
import { costCategories, formatCost } from "./budgetCosts";

export type ExtraFeeData = FunctionReturnType<typeof api.extraFees.latest>;

export function ExtraFees({ trip, data }: { trip: Doc<"trips">; data?: ExtraFeeData }) {
  const [settings, setSettings] = useState(trip.extraFeeSettings ?? defaultFeeSettings);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const save = useMutation(api.extraFees.saveSettings);
  const start = useMutation(api.extraFees.start);
  const running = data?.run?.status === "running";
  const dirty = JSON.stringify(settings) !== JSON.stringify(trip.extraFeeSettings ?? defaultFeeSettings);
  const results = data?.results ?? [];
  const subtotals = feeSubtotals(results);
  async function search() {
    if (lock.current) return;
    lock.current = true; setSaving(true); setError("");
    try {
      await save({ tripId: trip._id, settings });
      await start({ tripId: trip._id, refresh: true });
    } catch (cause) {
      const detail = cause instanceof ConvexError ? cause.data : null;
      setError(detail && typeof detail === "object" && "message" in detail ? String(detail.message) : "Unable to research fees. Please try again.");
    } finally { lock.current = false; setSaving(false); }
  }
  return <div className="extra-fees">
    <div className="fee-subtotals">{subtotals.map(subtotal => <article key={subtotal.category}>
      <h4>{costCategories.find(category => category.id === subtotal.category)!.label}</h4>
      <strong>{Object.entries(subtotal.amounts).map(([currency, amount]) => `${formatCost(amount, currency)} ${currency}`).join(" + ") || "--"}</strong>
      {subtotal.unknown > 0 && <span>{subtotal.unknown} prices not confirmed</span>}
    </article>)}</div>
    <fieldset className="fee-settings" disabled={saving || running}>
      <label>Checked bags per traveler, per flight<select value={settings.bagsPerTraveler}
        onChange={event => setSettings({ ...settings, bagsPerTraveler: Number(event.target.value) })}>
        {[0, 1, 2].map(count => <option key={count} value={count}>{count}</option>)}
      </select></label>
      <label className="fee-rental-toggle"><input type="checkbox" checked={settings.rentalCar}
        onChange={event => setSettings({ ...settings, rentalCar: event.target.checked })} />I have a rental car</label>
      {settings.rentalCar && <>
        <label>Rental provider<input value={settings.rentalProvider} maxLength={150} placeholder="Company and pickup location"
          onChange={event => setSettings({ ...settings, rentalProvider: event.target.value })} /></label>
        <label>Parking location<input value={settings.parkingLocation} maxLength={200} placeholder="Hotel, car park, or address"
          onChange={event => setSettings({ ...settings, parkingLocation: event.target.value })} /></label>
        <label>Car / parking days<input type="number" min={1} max={366} value={settings.carDays}
          onChange={event => setSettings({ ...settings, carDays: Number(event.target.value) })} /></label>
      </>}
    </fieldset>
    {dirty && <p role="status" className="field-hint">Search to save and apply these fee settings.</p>}
    <div className="button-row"><button type="button" className="primary-button" disabled={saving || running || !data}
      onClick={() => void search()}>{saving ? "Starting…" : running ? "Researching fees…" : data?.run ? "Refresh fee prices" : "Search fee prices"}</button></div>
    <p className="field-hint">Search uses Firecrawl credits. Prices are estimates for all travelers; unknown fees are not included in subtotals. Rental fees exclude the base rental price. Currencies are kept separate.</p>
    {error && <p className="search-error" role="alert">{error}</p>}
    {!data && <p role="status">Loading extra fees…</p>}
    {data && !results.length && <p>No itinerary activities or selected flights yet. Add them in Plan My Trip, or enable rental-car fees.</p>}
    {!!results.length && <div className="budget-rides-table-wrap"><table className="budget-rides-table fee-table">
      <thead><tr><th scope="col">Item</th><th scope="col">Category</th><th scope="col">Price</th><th scope="col">Quantity</th><th scope="col">Total</th><th scope="col">Source</th></tr></thead>
      <tbody>{results.map(row => <tr key={row.target.id}>
        <th scope="row">{row.target.title}<small>{row.note}</small></th>
        <td>{costCategories.find(category => category.id === row.target.category)!.label}</td>
        <td>{row.status === "priced" ? `${formatCost(row.amount!, row.currency!)} ${row.currency}` : row.status === "pending" ? "Searching…" : "Not confirmed"}<small>{row.target.unit}</small></td>
        <td>{row.target.quantity}</td>
        <td>{row.status === "priced" ? `${formatCost(Math.round(row.amount! * 100) * row.target.quantity / 100, row.currency!)} ${row.currency}` : "--"}</td>
        <td>{row.sourceUrl && <a className="text-button" href={row.sourceUrl} target="_blank" rel="noopener noreferrer">{row.status === "priced" ? "Price source ↗" : "Check source ↗"}</a>}
          {row.retrievedAt && <small>Checked {new Date(row.retrievedAt).toLocaleDateString()}</small>}
          {row.evidence && <details><summary>Price details</summary><p>{row.evidence}</p></details>}</td>
      </tr>)}</tbody>
    </table></div>}
  </div>;
}
