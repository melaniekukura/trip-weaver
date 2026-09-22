import { useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import type { Expense } from "../convex/expenseFields";
import { supportedCurrencies } from "../convex/currencies";
import { costCategories, formatCost, totalCosts } from "./budgetCosts";

export function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ExpenseList({ trip }: { trip: Doc<"trips"> }) {
  const save = useMutation(api.trips.saveExpense);
  const remove = useMutation(api.trips.removeExpense);
  const categoryId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Miscellaneous");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(trip.currency);
  const [date, setDate] = useState(todayDate);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const expenses = trip.expenses ?? [];
  const categories = [...new Set([...costCategories.map(item => item.label), ...expenses.map(item => item.category)])];
  const totals = totalCosts(expenses.map(item => ({ id: item.id, title: item.name, category: "miscellaneous", currency: item.currency, cents: Math.round(item.amount * 100) })));

  function reset() {
    setEditing(null); setName(""); setCategory("Miscellaneous"); setAmount(""); setCurrency(trip.currency); setDate(todayDate());
  }
  async function change(action: () => Promise<unknown>, message: string, after: () => void) {
    if (lock.current) return;
    lock.current = true; setPending(true); setError(""); setNotice("");
    try { await action(); after(); setNotice(message); }
    catch (failure) {
      const data = failure instanceof ConvexError ? failure.data : null;
      setError(data && typeof data === "object" && "message" in data ? String(data.message) : "Unable to save expense changes. Please try again.");
    } finally { lock.current = false; setPending(false); }
  }
  return <div className="expense-list">
    <form className="expense-form" onSubmit={event => {
      event.preventDefault();
      const official = categories.find(value => value.toLowerCase() === category.trim().toLowerCase());
      void change(() => save({ tripId: trip._id, expense: { id: editing?.id ?? crypto.randomUUID(), revision: editing?.revision ?? 0,
        name, category: official ?? category, amount: Number(amount), currency, date } }), editing ? "Expense updated." : "Expense added.", reset);
    }}>
      <fieldset disabled={pending}>
        <legend>{editing ? "Edit expense" : "Add expense"}</legend>
        <div className="expense-fields">
          <label>Name<input ref={nameInput} required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>
          <label>Category<input required maxLength={80} list={categoryId} value={category} placeholder="Choose or create a category" onChange={event => setCategory(event.target.value)} />
            <datalist id={categoryId}>{categories.map(value => <option key={value} value={value} />)}</datalist></label>
          <label>Amount<input required type="number" min="0" max="1000000000" step={currency === "JPY" ? "1" : "0.01"} value={amount} onChange={event => setAmount(event.target.value)} /></label>
          <label>Currency<select value={currency} onChange={event => setCurrency(event.target.value)}>{supportedCurrencies.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Day<input required type="date" min="1900-01-01" max="9999-12-31" value={date} onChange={event => setDate(event.target.value)} /></label>
        </div>
        <div className="button-row">
          <button className="primary-button" disabled={!name.trim() || !category.trim() || !amount || !date}>{pending ? "Saving…" : editing ? "Save expense" : "Add expense"}</button>
          {editing && <button className="text-button" type="button" onClick={reset}>Cancel</button>}
        </div>
      </fieldset>
    </form>
    {error && <p className="search-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {expenses.length ? <>
      <p><strong>Expense list subtotal:</strong> {Object.entries(totals).map(([code, total]) => formatCost(total, code)).join(" + ")}</p>
      <div className="expense-table-scroll"><table className="expense-table">
        <thead><tr><th scope="col">Name</th><th scope="col">Category</th><th scope="col">Amount</th><th scope="col">Day</th><th scope="col">Actions</th></tr></thead>
        <tbody>{[...expenses].sort((a, b) => a.date.localeCompare(b.date)).map(expense => <tr key={expense.id}>
          <td>{expense.name}</td><td>{expense.category}</td><td>{formatCost(expense.amount, expense.currency)} <small>{expense.currency}</small></td><td>{expense.date}</td>
          <td><div className="button-row">
            <button type="button" className="text-button" disabled={pending} aria-label={`Edit ${expense.name}`} onClick={() => {
              setEditing(expense); setName(expense.name); setCategory(expense.category); setAmount(String(expense.amount));
              setCurrency(expense.currency); setDate(expense.date); setError(""); setNotice(""); nameInput.current?.focus();
            }}>Edit</button>
            <button type="button" className="text-button" disabled={pending} aria-label={`Delete ${expense.name}`}
              onClick={() => void change(() => remove({ tripId: trip._id, id: expense.id, revision: expense.revision }), "Expense deleted.", () => { if (editing?.id === expense.id) reset(); })}>Delete</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>
    </> : <p>No expenses added yet.</p>}
  </div>;
}
