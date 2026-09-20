"use client";
import { useState } from "react";

// A control the design draws but the product cannot perform yet. It looks and
// measures exactly like a live button and answers on activation, because a
// `title` alone is invisible on touch and these are often the only call to
// action on a phone. The note sits in a live region so it is announced once,
// on press, rather than on every render.
export default function InertButton({ className, note, children }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <button type="button" className={className} title={note} onClick={() => setShown(true)}>
        {children}
      </button>
      <span className="inert-note" role="status" aria-live="polite">{shown ? note : ""}</span>
    </>
  );
}
