"use client";

import { useEffect, useId, useRef, useState } from "react";

export default function AutocompleteInput({ value, onChange, kind, placeholder, label, className = "" }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const requestRef = useRef(0);
  const selectedQueryRef = useRef("");
  const listId = useId();
  const query = value.trim();

  useEffect(() => {
    if (selectedQueryRef.current === query) {
      selectedQueryRef.current = "";
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return undefined;
    }
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return undefined;
    }
    const requestId = ++requestRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/jobs/api/autocomplete?q=${encodeURIComponent(query)}&kind=${kind}`, { signal: AbortSignal.timeout(5000) });
        const payload = await response.json();
        if (requestId !== requestRef.current) return;
        setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
        setHighlighted(-1);
        setOpen(true);
      } catch {
        if (requestId === requestRef.current) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, kind]);

  const select = (suggestion) => {
    requestRef.current += 1;
    selectedQueryRef.current = suggestion.value;
    onChange(suggestion.value);
    setSuggestions([]);
    setLoading(false);
    setOpen(false);
    setHighlighted(-1);
  };

  const handleKeyDown = (event) => {
    if (!open || !suggestions.length) {
      if (event.key === "Escape") setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Enter" && highlighted >= 0) {
      event.preventDefault();
      select(suggestions[highlighted]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={`autocomplete-wrap ${className}`}>
      <input
        className="search-bar"
        type="search"
        role="combobox"
        placeholder={placeholder}
        aria-label={label}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => query.length >= 2 && suggestions.length > 0 && selectedQueryRef.current !== query && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && (
        <div className="autocomplete-menu" role="listbox" id={listId} aria-label={`${label} suggestions`}>
          {loading && <div className="autocomplete-status">Finding matches…</div>}
          {!loading && !suggestions.length && <div className="autocomplete-status">No matches found</div>}
          {!loading && suggestions.map((suggestion, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === highlighted}
              className={`autocomplete-option${index === highlighted ? " highlighted" : ""}`}
              key={`${suggestion.type}-${suggestion.value}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(suggestion)}
            >
              <span className="autocomplete-value">{suggestion.value}</span>
              <small className="autocomplete-kind">{suggestion.type === "remote" ? "Work style" : suggestion.type}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
