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
            a lightweight, no-JS-required form. */}
        <form className="header-search" action={`${basePath}/search`} method="get" role="search">
          <SearchIcon />
          <input type="text" name="q" placeholder="Title, skill or company" aria-label="Job title, skill, or company" />
          <span className="header-search-divider" aria-hidden="true" />
          <input type="text" name="location" placeholder="Anywhere" aria-label="Location" />
          <button type="submit">Search</button>
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
