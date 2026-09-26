"use client";

// Ported from leadnear-main/lib/components/jobs/AutocompleteInput.jsx.
// This is the Tailwind-styled variant the marketing homepage uses; the job
// board keeps its own CSS-styled copy at app/AutocompleteInput.jsx. The fetch
// URL deliberately keeps the /jobs prefix -- basePath is applied to Link and
// router navigation, never to fetch().

import { useEffect, useId, useRef, useState } from "react";

export default function AutocompleteInput({ value, onChange, kind, label, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const requestRef = useRef(0);
  const selectedQueryRef = useRef("");
  // Suggestions are for what the viewer is typing. A value that arrives
  // pre-filled (the results page seeds this box from ?q=) must not fetch and
  // open the menu on load: the box was never focused, so no blur ever closes it.
  const editedRef = useRef(false);
  const inputRef = useRef(null);
  const listId = useId();
  const query = value.trim();

  useEffect(() => {
    if (!editedRef.current) return undefined;
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
        const response = await fetch(`/jobs/api/autocomplete?q=${encodeURIComponent(query)}&kind=${kind}`);
        const payload = await response.json();
        if (requestId !== requestRef.current) return;
        setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
        setHighlighted(-1);
        // Only while the box still has focus: a response landing after the
        // viewer clicked away or submitted must not reopen the menu.
        setOpen(document.activeElement === inputRef.current);
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
    <div className="marketing-field relative min-w-0 flex-1">
      <input
        value={value}
        ref={inputRef}
        onChange={(event) => {
          editedRef.current = true;
          onChange(event.target.value);
        }}
        onFocus={() => query.length >= 2 && suggestions.length > 0 && selectedQueryRef.current !== query && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        type="search"
        role="combobox"
        placeholder={placeholder}
        aria-label={label}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        autoComplete="off"
        className="min-w-0 w-full bg-transparent py-4 text-base text-slate-900 outline-none placeholder:text-slate-400"
      />
      {open && (
        <div className="jobs-autocomplete-menu" role="listbox" id={listId} aria-label={`${label} suggestions`}>
          {loading && <div className="jobs-autocomplete-status">Finding matches…</div>}
          {!loading && !suggestions.length && <div className="jobs-autocomplete-status">No matches found</div>}
          {!loading && suggestions.map((suggestion, index) => (
            <button type="button" role="option" aria-selected={index === highlighted} key={`${suggestion.type}-${suggestion.value}`} onMouseDown={(event) => event.preventDefault()} onClick={() => select(suggestion)} className={`jobs-autocomplete-option ${index === highlighted ? "highlighted" : ""}`}>
              <span className="jobs-autocomplete-value">{suggestion.value}</span><small className="jobs-autocomplete-kind">{suggestion.type === "remote" ? "Work style" : suggestion.type}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
