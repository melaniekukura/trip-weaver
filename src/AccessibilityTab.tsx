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

export function accessibilitySuggestions(query: string, selected: string[] = []) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const added = new Set(selected.map(value => value.toLowerCase()));
  return words.length ? categories.flatMap(category => category.suggestions
    .filter(value => !added.has(value.toLowerCase()) && words.every(word => `${category.name} ${value}`.toLowerCase().includes(word)))
    .map(value => ({ value, category: category.name }))) : [];
}

export function AccessibilityTab({ initialValue = "", onChange, compact = false }: { initialValue?: string; onChange?: (value: string) => void; compact?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [requirements, setRequirements] = useState(() => initialValue.split("\n").map(value => value.trim()).filter(Boolean));
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = accessibilitySuggestions(draft, requirements);
  const showSuggestions = compact && open && suggestions.length > 0;

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
    setOpen(false);
    setActive(0);
    setMessage(`Added ${value}.`);
    input.current?.focus();
  }

  const renderChip = (requirement: string) => <li className="accessibility-chip" key={requirement}>
    <span>{requirement}</span>
    <button type="button" aria-label={`Remove ${requirement}`} onClick={() => {
      const remaining = requirements.filter(value => value !== requirement);
      setRequirements(remaining); onChange?.(remaining.join("\n"));
      setMessage(`Removed ${requirement}.`); input.current?.focus();
    }}>×</button>
  </li>;
  return <div className="accessibility-editor">
    <label className={compact ? "interest-sr-only" : undefined} htmlFor={`${id}-requirement`}>Accessibility requirements</label>
    <div className="accessibility-search">
      <div className="accessibility-input" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}>
      <input ref={input} id={`${id}-requirement`} type="text"
        role={compact ? "combobox" : undefined} autoComplete="off"
        aria-autocomplete={compact ? "list" : undefined} aria-expanded={compact ? showSuggestions : undefined}
        aria-controls={showSuggestions ? `${id}-suggestions` : undefined}
        aria-activedescendant={showSuggestions && suggestions[active] ? `${id}-suggestion-${active}` : undefined}
        value={draft} maxLength={2000} placeholder="Try step-free access, quiet environments, or no strenuous activity"
        aria-describedby={`${id}-status`} onFocus={() => { setOpen(true); setActive(0); }}
        onChange={event => { setDraft(event.target.value); setOpen(true); setActive(0); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (compact && suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault(); setOpen(true);
            setActive(showSuggestions ? (active + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length : 0);
          } else if (event.key === "Escape" && showSuggestions) {
            event.preventDefault(); event.stopPropagation(); setOpen(false);
          } else if (event.key === "Enter") {
            event.preventDefault(); addRequirement(showSuggestions ? suggestions[active]?.value : draft);
          }
        }} />
      {showSuggestions && <ul id={`${id}-suggestions`} className="accessibility-suggestions" role="listbox" aria-label="Accessibility suggestions">
        {suggestions.map((suggestion, index) => <li key={suggestion.value} id={`${id}-suggestion-${index}`}
          role="option" aria-selected={active === index} onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => setActive(index)} onClick={() => addRequirement(suggestion.value)}>
          <span>{suggestion.value}</span><small>{suggestion.category}</small>
        </li>)}
      </ul>}
      </div>
      <button type="button" className="primary-button" disabled={!draft.trim()} onClick={() => addRequirement()}>Add requirement</button>
    </div>
    <input type="hidden" name="accessibility" value={requirements.join("\n")} />
    <p id={`${id}-status`} className="accessibility-status" role="status">{message}</p>
    {requirements.length > 0 && <div className="accessibility-selected" aria-label="Accessibility requirements">
      {compact ? <ul className="accessibility-chips">{requirements.map(renderChip)}</ul> :
        [...categories.map(category => category.name), "Custom requirements"].map(category => {
          const selected = requirements.filter(requirement => categoryFor(requirement) === category);
          return selected.length > 0 && <section key={category}><h3>{category}</h3>
            <ul className="accessibility-chips">{selected.map(renderChip)}</ul>
          </section>;
        })}
    </div>}
    {!compact && <section className="accessibility-browse" aria-label="Browse requirements by category">
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
    </section>}
  </div>;
}
