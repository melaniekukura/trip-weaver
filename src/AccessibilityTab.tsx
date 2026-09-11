import { useId, useRef, useState } from "react";

const categories = [
  { name: "Activity level", suggestions: ["No strenuous activity", "Short walking distances", "Seating available", "Flexible itinerary pace", "Extra time for transfers"] },
  { name: "Mobility & physical access", suggestions: ["Wheelchair-accessible spaces", "Step-free access", "Level walking routes", "Elevator access", "Mobility equipment rental", "Accessible bathrooms", "Accessible changing facilities"] },
  { name: "Vision", suggestions: ["Audio-described experiences", "Braille signage", "Large-print information", "Screen-reader-accessible information"] },
  { name: "Hearing & communication", suggestions: ["Captioned experiences", "Sign language interpretation", "Hearing loop availability", "Written communication options", "Visual emergency alerts", "Clear step-by-step directions"] },
  { name: "Sensory comfort", suggestions: ["Quiet environments", "Low-crowd experiences", "Sensory-friendly experiences", "No flashing lights", "Adjustable room lighting", "Fragrance-free accommodations", "Quiet spaces available"] },
  { name: "Transportation & assistance", suggestions: ["Wheelchair-accessible transportation", "Accessible airport transfers", "Airport assistance", "Accessible parking", "Companion seating", "Service animal accommodations"] },
  { name: "Accommodation", suggestions: ["Accessible hotel rooms", "Roll-in showers", "Bathroom grab bars"] },
  { name: "Dietary & health needs", suggestions: ["Allergy-aware dining", "Gluten-free dining", "Dietary accommodations", "Medication refrigeration", "Nearby medical facilities"] },
];

function categoryFor(value: string) {
  return categories.find(category => category.suggestions.some(suggestion => suggestion.toLowerCase() === value.toLowerCase()))?.name ?? "Custom requirements";
}

export function AccessibilityTab({ initialValue = "", onChange }: { initialValue?: string; onChange?: (value: string) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [requirements, setRequirements] = useState(() => initialValue.split("\n").map(value => value.trim()).filter(Boolean));
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");

  function addRequirement(suggestion = draft) {
    const value = suggestion.trim();
    if (!value) return;
    if (requirements.some(requirement => requirement.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      setMessage("This requirement is already added.");
      return;
    }
    if ([...requirements, value].join("\n").length > 2000) {
      setMessage("Requirements can contain up to 2,000 characters in total. Shorten or remove a requirement to add more.");
      return;
    }
    setRequirements([...requirements, value]);
    onChange?.([...requirements, value].join("\n"));
    setDraft("");
    setMessage(`Added ${value}.`);
    input.current?.focus();
  }

  return <div className="accessibility-editor">
    <label htmlFor={`${id}-requirement`}>Accessibility requirements</label>
    <div className="accessibility-search">
      <input ref={input} id={`${id}-requirement`} type="text"
        value={draft} maxLength={2000} placeholder="Try step-free access, quiet environments, or no strenuous activity"
        aria-describedby={`${id}-hint ${id}-status`} onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addRequirement(); }
        }} />
      <button type="button" className="primary-button" disabled={!draft.trim()} onClick={() => addRequirement()}>Add requirement</button>
    </div>
    <p id={`${id}-hint`} className="field-hint">Choose a suggestion or enter your own requirement and press Enter to add it. Save changes to keep your requirements with this trip.</p>
    <input type="hidden" name="accessibility" value={requirements.join("\n")} />
    <p id={`${id}-status`} className="accessibility-status" role="status">{message}</p>
    {requirements.length ? <div className="accessibility-selected" aria-label="Trip accessibility requirements">
      {[...categories.map(category => category.name), "Custom requirements"].map(category => {
        const selected = requirements.filter(requirement => categoryFor(requirement) === category);
        return selected.length > 0 && <section key={category}>
          <h3>{category}</h3>
          <ul className="accessibility-cards">
            {selected.map((requirement, index) => <li className="accessibility-card" key={`${index}-${requirement}`}>
              <span>{requirement}</span>
              <button type="button" aria-label={`Remove ${requirement}`} onClick={() => {
                setRequirements(requirements.filter(value => value !== requirement));
                onChange?.(requirements.filter(value => value !== requirement).join("\n"));
                setMessage(`Removed ${requirement}.`);
                input.current?.focus();
              }}>×</button>
            </li>)}
          </ul>
        </section>;
      })}
    </div> : <p className="accessibility-empty">Add the access needs and comforts that matter for your trip. Your requirements will appear here.</p>}
    <section className="accessibility-browse" aria-label="Browse requirements by category">
      <h3>Browse by category</h3>
      <div className="accessibility-category-grid">
        {categories.map(category => {
          const matches = category.suggestions.filter(value =>
            `${category.name} ${value}`.toLowerCase().includes(draft.trim().toLowerCase()));
          return matches.length > 0 && <details key={category.name} open={draft.trim() ? true : undefined}>
            <summary>{category.name}</summary>
            <ul>{matches.map(value => {
              const added = requirements.some(requirement => requirement.toLowerCase() === value.toLowerCase());
              return <li key={value}><button type="button" disabled={added} onClick={() => addRequirement(value)}>
                <span>{value}</span><span aria-hidden="true">{added ? "✓" : "+"}</span>
                {added && <span className="accessibility-added">Added</span>}
              </button></li>;
            })}</ul>
          </details>;
        })}
      </div>
      {draft.trim() && !categories.some(category => category.suggestions.some(value =>
        `${category.name} ${value}`.toLowerCase().includes(draft.trim().toLowerCase()))) &&
        <p className="field-hint">No matching suggestions. Use Add requirement to save your own wording.</p>}
    </section>
  </div>;
}
