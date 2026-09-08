"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AutocompleteInput from "./AutocompleteInput";

export default function SearchBox({ initialQuery = "", initialLocation = "" }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [location, setLocation] = useState(initialLocation);

  const handleSubmit = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (location.trim().toLowerCase() === "remote") params.set("remote", "1");
    else if (location.trim()) params.set("location", location.trim());
    router.push(`/search${params.toString() ? `?${params}` : ""}`);
  };

  return (
    <form className="search-wrap search-wrap-two" onSubmit={handleSubmit} role="search">
      <label className="search-field">
        <span aria-hidden="true">⌕</span>
        <span className="sr-only">Job title, skill, or company</span>
        <AutocompleteInput value={q} onChange={setQ} kind="query" label="Job title, skill, or company" placeholder="Job title, skill, or company" />
      </label>
      <label className="search-field location-field">
        <span aria-hidden="true">⌖</span>
        <span className="sr-only">Location or remote</span>
        <AutocompleteInput value={location} onChange={setLocation} kind="location" label="Location or remote" placeholder="Location or Remote" />
      </label>
      <button type="submit" className="search-bar-btn">Search Jobs</button>
    </form>
  );
}
