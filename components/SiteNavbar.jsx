"use client";
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element -- navigation and logo are served by the Main app zone */

import { useState } from "react";
import AuthNav from "@/components/AuthNav";

const links = [
  ["Jobs", "/jobs"],
  ["Remote Jobs", "/jobs/remote"],
  ["Categories", "/jobs/categories"],
  ["Salary Explorer", "/jobs/salaries"],
];

const discoverLinks = [
  ["Company", "/company"],
  ["Blogs", "/blogs"],
  ["Tools", "/tools"],
];

function ChevronDown() {
  return <svg className="nav-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
}

function MenuIcon({ open }) {
  return open
    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
}

// A blank text input still submits its name, so the header search produced
// "/jobs/search?q=react&location=" — and below 768px the location field is
// CSS-hidden, so it could only ever be blank, permanently appending an empty
// param no one can fill. Disabling empty fields during the submit event drops
// them from the form data set (which the browser builds after listeners run),
// leaving "/jobs/search?q=react". They are re-enabled on the next tick so a
// bfcache back-navigation does not restore a dead form. Progressive, not
// required: with JS off the form still submits exactly as it does today.
function dropEmptyFields(event) {
  const emptied = [...event.currentTarget.elements].filter(
    (el) => el.name && typeof el.value === "string" && el.value.trim() === ""
  );
  emptied.forEach((el) => { el.disabled = true; });
  setTimeout(() => emptied.forEach((el) => { el.disabled = false; }), 0);
}

function SearchIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}

export default function SiteNavbar() {
  const [open, setOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const closeNavigation = () => {
    setOpen(false);
    setDiscoverOpen(false);
  };

  return (
    <header className="site-header">
      <div className="inner">
        <a href="/" className="logo" aria-label="LeadNear home">
          <img src={`${basePath}/images/LandingPage/leadnear-logo.svg`} alt="" width="24" height="24" />
          <span className="logo-word">LeadNear<span className="logo-word-sub"> Jobs</span></span>
        </a>

        {/* Keeps the header's own compact search distinct from the full
            autocomplete search on /search — same target route and param
            names (q, location) as SearchBox.jsx, plain inputs so this stays
            a lightweight, no-JS-required form.

            This form is the ONLY free-text search on a phone: app/page.jsx
            has no SearchBox (the header owns search) and the hamburger panel
            carries links only. Below 768px app/globals.css gives it the
            design's phone treatment (spec line 419) — its own full-width
            42px row under the logo, title field only, no location field, no
            divider, no visible "Search" button.

            The magnifier is a real submit button, not decoration. Implicit
            submission (the soft keyboard's Go/Enter, which enterKeyHint
            labels "search") should reach the CSS-hidden text button on its
            own — a form's default button is activated whatever its
            visibility — but that could not be verified here: this
            environment's automation dispatches untrusted key events, which
            never run a default action, and it failed the same way against a
            control form with a fully visible button. Rather than ship a
            phone form whose only submit path is unverified, the magnifier
            the design already draws in that pill does the job. It is the
            same glyph in the same place at every width, so nothing about the
            header moves; it just works when tapped. */}
        <form
          className="header-search"
          action={`${basePath}/search`}
          method="get"
          role="search"
          onSubmit={dropEmptyFields}
        >
          <button type="submit" className="header-search-go" aria-label="Search">
            <SearchIcon />
          </button>
          <input type="text" name="q" placeholder="Title, skill or company" aria-label="Job title, skill, or company" enterKeyHint="search" />
          <span className="header-search-divider" aria-hidden="true" />
          <input type="text" name="location" className="header-search-location" placeholder="Anywhere" aria-label="Location" enterKeyHint="search" />
          <button type="submit" className="header-search-submit">Search</button>
        </form>

        <nav className="nav-links" aria-label="Primary navigation">
          {links.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
          <details className="nav-discover" open={discoverOpen} onToggle={(event) => setDiscoverOpen(event.currentTarget.open)}>
            <summary>Discover <ChevronDown /></summary>
            <div className="discover-menu">
              {discoverLinks.map(([label, href]) => <a key={label} href={href} onClick={closeNavigation}>{label}</a>)}
            </div>
          </details>
          <a href="/services">Services</a>
        </nav>

        <div className="nav-actions"><AuthNav /></div>

        <button type="button" className="nav-menu-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="mobile-navigation" aria-label={open ? "Close navigation" : "Open navigation"}>
          <MenuIcon open={open} />
        </button>
      </div>

      {open && (
        <nav id="mobile-navigation" className="mobile-navigation" aria-label="Mobile navigation">
          <div>
            {links.map(([label, href]) => <a key={label} href={href} onClick={closeNavigation}>{label}</a>)}
            <section>
              <p>Discover</p>
              {discoverLinks.map(([label, href]) => <a key={label} href={href} onClick={closeNavigation}>{label}</a>)}
            </section>
            <a href="/services" onClick={closeNavigation}>Services</a>
            <AuthNav mobile />
          </div>
        </nav>
      )}
    </header>
  );
}
