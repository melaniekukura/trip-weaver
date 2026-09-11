import { useEffect, useId, useRef, useState } from "react";
import { locationSearchTerm, locationValue, searchLocations } from "./locations";
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
  const search = query === value ? locationSearchTerm(query) : query;
  const [lookup, setLookup] = useState<{ term: string; options: LocationOption[]; error: string; loading: boolean }>({
    term: "", options: [], error: "", loading: false,
  });
  const [retry, setRetry] = useState(0);
  const options = lookup.term === search ? lookup.options : [];
  const loading = open && search.trim().length >= 2 && (lookup.term !== search || lookup.loading);

  useEffect(() => {
    if (!open || disabled || search.trim().length < 2) return;
    const controller = new AbortController();
    setLookup({ term: search, options: [], error: "", loading: true });
    const timer = setTimeout(() => {
      const timeout = setTimeout(() => controller.abort(new Error("Location search timed out.")), 10_000);
      void searchLocations(search, controller.signal).then((options) => {
        if (!controller.signal.aborted) { setLookup({ term: search, options, error: "", loading: false }); setActive(0); }
      }).catch(() => {
        if (!disposed) setLookup({ term: search, options: [], error: "Unable to load locations. Please try again.", loading: false });
      }).finally(() => clearTimeout(timeout));
    }, 300);
    let disposed = false;
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [search, open, disabled, retry]);

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
        aria-expanded={open} aria-busy={loading} aria-controls={`${id}-options`} aria-describedby={`${id}-hint`}
        aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
        required={required} disabled={disabled} maxLength={90} value={query}
        placeholder="Search city, airport, or airport code" onFocus={() => { setOpen(true); setActive(0); }}
        onChange={(event) => { setQuery(event.target.value); onClear?.(); setOpen(true); setActive(0); }}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && options.length > 0) {
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
      <p className="field-hint" id={`${id}-hint`}>Type at least two characters to search cities and airports live.</p>
      {open && <ul className="location-options" id={`${id}-options`} role="listbox" aria-label={`${label} suggestions`}>
        {loading && <li role="presentation">Searching locations…</li>}
        {!loading && search.trim().length < 2 && <li role="presentation">Type a city or airport name to start.</li>}
        {!loading && lookup.term === search && lookup.error && <li role="presentation">
          <span role="alert">{lookup.error}</span>
          <button type="button" className="secondary-button" onClick={() => setRetry(retry + 1)}>Retry</button>
        </li>}
        {!loading && lookup.term === search && !lookup.error && search.trim().length >= 2 && options.length === 0 &&
          <li role="presentation">No matching locations. Try another name or an airport code.</li>}
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
