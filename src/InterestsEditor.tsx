import { useId, useRef, useState } from "react";

export function InterestsEditor({ interests, onChange }: { interests: string[]; onChange: (values: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  function add() {
    const interest = draft.trim();
    if (!interest) return;
    if (interests.some(value => value.toLocaleLowerCase() === interest.toLocaleLowerCase())) {
      setError("That interest is already in your list."); return;
    }
    if (interests.length >= 20) { setError("You can add up to 20 interests."); return; }
    onChange([...interests, interest]); setDraft(""); setError(""); input.current?.focus();
  }
  return <div className="interests-editor">
    <h4>Your interests</h4>
    <ul className="interest-pills" aria-label="Your interests">
      {interests.map(interest => <li key={interest} className="interest-pill">
        <input type="hidden" name="interests" value={interest} />
        <span>{interest}</span>
        <button type="button" aria-label={`Remove ${interest}`} onClick={() => {
          onChange(interests.filter(value => value !== interest)); setError(""); input.current?.focus();
        }}>×</button>
      </li>)}
      <li className="interest-add">
        <label><span className="interest-sr-only">Add an interest</span>
          <input ref={input} value={draft} maxLength={80} placeholder="Add an interest" aria-describedby={hintId}
            onChange={event => { setDraft(event.target.value); setError(""); }}
            onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(); } }} />
        </label>
        {draft.trim() && <button type="button" className="secondary-button" disabled={interests.length >= 20} onClick={add}>Add</button>}
      </li>
    </ul>
    <span id={hintId} className="interest-sr-only">Press Enter or Add to add one interest. Up to 20 interests. Saved when you save your trip or search.</span>
    {error && <p role="alert" className="search-error">{error}</p>}
  </div>;
}
