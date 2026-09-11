import { useEffect, useId, useRef, useState } from "react";
import { locationValue, searchLocations } from "./locations";
import type { LocationOption } from "./locations";

type LocationPickerProps = {
  label: string;
  value?: string;
  required?: boolean;
  disabled?: boolean;
  clearOnSelect?: boolean;
  onSelect: (value: string) => void;
  onClear?: () => void;
};

export function LocationPicker({ label, value = "", required = false, disabled = false, clearOnSelect = false, onSelect, onClear }: LocationPickerProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = query === value ? query.split(" — ")[0].replace(/ \(all airports\)$/, "") : query;
  const matches = searchLocations(search);
  const options: LocationOption[] = matches.length || !query.trim() ? matches : [
    { id: "custom-city", city: search.trim(), country: "Add as a city" },
  ];

  useEffect(() => {
    input.current?.setCustomValidity(required && query && !value ? "Select a city or airport from the suggestions." : "");
  }, [query, required, value]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);

  function choose(option: LocationOption) {
    onSelect(locationValue(option));
    setQuery(clearOnSelect ? "" : locationValue(option));
    setOpen(false);
    setActive(0);
    input.current?.focus();
  }

  return (
    <div className="location-picker" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <label htmlFor={id}>{label}</label>
      <input id={id} ref={input} role="combobox" autoComplete="off" aria-autocomplete="list"
        aria-expanded={open} aria-controls={`${id}-options`} aria-describedby={`${id}-hint`}
        aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
        required={required} disabled={disabled} maxLength={90} value={query}
        placeholder="Search city, airport, or airport code" onFocus={() => { setOpen(true); setActive(0); }}
        onChange={(event) => { setQuery(event.target.value); onClear?.(); setOpen(true); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive(open ? (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length : 0);
          } else if (event.key === "Enter" && open && options[active]) {
            event.preventDefault();
            choose(options[active]);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }} />
      <p className="field-hint" id={`${id}-hint`}>Choose a city for all airports, or select an individual airport.</p>
      {open && <ul className="location-options" id={`${id}-options`} role="listbox" aria-label={`${label} suggestions`}>
        {options.map((option, index) => (
          <li id={`${id}-option-${index}`} key={option.id} role="option" aria-selected={index === active}
            className={option.code ? "location-airport" : "location-city"}
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
            <span className="location-symbol" aria-hidden="true">{option.code ? "✈" : "◎"}</span>
            <span><strong>{option.airport ?? option.city}</strong>
              <small>{option.code ? `${option.city}, ${option.country}` : `${option.country} · All airports`}</small></span>
            <span className="location-code">{option.code ?? "City"}</span>
          </li>
        ))}
      </ul>}
    </div>
  );
}
