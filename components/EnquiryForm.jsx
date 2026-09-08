"use client";

// Shared form used by /contact-us and /opt-out.
//
// leadnear-main's versions depend on sweetalert2, react-google-recaptcha-v3 and
// a shadcn-style ui/ component tree, none of which exist in this project. This
// is a self-contained equivalent: same fields, same endpoints' shape, plain
// markup, and it reports the server's message rather than assuming success.

import { useState } from "react";

export default function EnquiryForm({ endpoint, fields, submitLabel, successLabel }) {
  const initial = Object.fromEntries(fields.map((f) => [f.name, ""]));
  const [values, setValues] = useState({ ...initial, website: "" });
  const [status, setStatus] = useState(null); // { ok: boolean, message: string }
  const [submitting, setSubmitting] = useState(false);

  function update(name) {
    return (event) => setValues((prev) => ({ ...prev, [name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);
    setSubmitting(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json().catch(() => ({}));

      if (response.ok) {
        setStatus({ ok: true, message: payload.message || successLabel });
        setValues({ ...initial, website: "" });
      } else {
        // Surface the server's reason verbatim — a 503 here means mail is not
        // configured, which the user needs to be told rather than shown a
        // generic failure.
        setStatus({ ok: false, message: payload.message || "Something went wrong." });
      }
    } catch {
      setStatus({ ok: false, message: "Could not reach the server. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      {status && (
        <p className={status.ok ? "form-success" : "auth-error"} role="alert">
          {status.message}
        </p>
      )}

      {fields.map((field) => (
        <div key={field.name} className="form-field">
          <label htmlFor={field.name}>
            {field.label}
            {field.required ? "" : " (optional)"}
          </label>
          {field.type === "textarea" ? (
            <textarea
              id={field.name}
              rows={6}
              required={field.required}
              placeholder={field.placeholder}
              value={values[field.name]}
              onChange={update(field.name)}
            />
          ) : (
            <input
              id={field.name}
              type={field.type || "text"}
              required={field.required}
              placeholder={field.placeholder}
              value={values[field.name]}
              onChange={update(field.name)}
            />
          )}
        </div>
      ))}

      {/* Honeypot — hidden from users, filled by naive bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px" }}
        value={values.website}
        onChange={update("website")}
      />

      <button type="submit" disabled={submitting}>
        {submitting ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
