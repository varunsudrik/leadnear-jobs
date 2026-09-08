"use client";

import Link from "next/link";
import { useState } from "react";

const initialForm = {
  applyUrl: "",
  sourceId: "",
  title: "",
  canonicalTitle: "",
  company: "",
  description: "",
  employmentType: "FullTime",
  department: "",
  remote: false,
  locationRaw: "",
  countryLabel: "",
  salaryMin: "",
  salaryMax: "",
  salaryCurrency: "USD",
  salaryPeriod: "year",
  postedAt: new Date().toISOString().slice(0, 10),
  source: "manual",
  sourceSlug: "",
  categorySlugs: "",
  tags: "",
};

export default function JobForm() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);
  const [created, setCreated] = useState(null);

  function update(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setCreated(null);

    try {
      const response = await fetch("/jobs/api/backoffice/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) {
        setErrors(result.errors || [result.error || "Could not create the job."]);
        return;
      }
      setCreated(result);
      setForm(initialForm);
    } catch {
      setErrors(["The server could not be reached."]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="admin-job-form" onSubmit={submit}>
      {errors.length > 0 && (
        <div className="admin-alert error" role="alert">
          {errors.map((error) => <div key={error}>{error}</div>)}
        </div>
      )}

      {created && (
        <div className="admin-alert success" role="status">
          <strong>Job #{created.id} was added.</strong>
          <span> It is pending the next four-hour publisher or a manual publish.</span>
          <div>
            <Link href={created.path}>Preview job page</Link>
          </div>
        </div>
      )}

      <section className="admin-form-section">
        <h2>Required details</h2>
        <div className="admin-form-grid">
          <label className="admin-field full">
            <span>Apply URL *</span>
            <input name="applyUrl" type="url" value={form.applyUrl} onChange={update} required placeholder="https://company.com/jobs/123" />
          </label>
          <label className="admin-field">
            <span>Job title *</span>
            <input name="title" value={form.title} onChange={update} required placeholder="Senior Software Engineer" />
          </label>
          <label className="admin-field">
            <span>Canonical title *</span>
            <input name="canonicalTitle" value={form.canonicalTitle} onChange={update} required placeholder="Software Engineer" />
          </label>
          <label className="admin-field">
            <span>Company *</span>
            <input name="company" value={form.company} onChange={update} required placeholder="Acme Inc." />
          </label>
          <label className="admin-field">
            <span>Employment type *</span>
            <select name="employmentType" value={form.employmentType} onChange={update}>
              <option value="FullTime">Full time</option>
              <option value="PartTime">Part time</option>
              <option value="Contract">Contract</option>
              <option value="Temporary">Temporary</option>
              <option value="Internship">Internship</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label className="admin-field full">
            <span>Description *</span>
            <textarea name="description" value={form.description} onChange={update} required minLength={20} rows={12} placeholder="Enter the job description as plain text. Blank lines create separate paragraphs." />
            <small>Plain text only. It is safely converted to HTML when saved.</small>
          </label>
        </div>
      </section>

      <section className="admin-form-section">
        <h2>Location and compensation</h2>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>Location</span>
            <input name="locationRaw" value={form.locationRaw} onChange={update} placeholder="San Francisco, CA" />
          </label>
          <label className="admin-field">
            <span>Country</span>
            <input name="countryLabel" value={form.countryLabel} onChange={update} placeholder="United States" />
          </label>
          <label className="admin-check">
            <input name="remote" type="checkbox" checked={form.remote} onChange={update} />
            <span>This is a remote job</span>
          </label>
          <div />
          <label className="admin-field">
            <span>Minimum salary</span>
            <input name="salaryMin" type="number" min="0" step="0.01" value={form.salaryMin} onChange={update} placeholder="100000" />
          </label>
          <label className="admin-field">
            <span>Maximum salary</span>
            <input name="salaryMax" type="number" min="0" step="0.01" value={form.salaryMax} onChange={update} placeholder="150000" />
          </label>
          <label className="admin-field">
            <span>Currency</span>
            <input name="salaryCurrency" value={form.salaryCurrency} onChange={update} maxLength={9} placeholder="USD" />
          </label>
          <label className="admin-field">
            <span>Salary period</span>
            <select name="salaryPeriod" value={form.salaryPeriod} onChange={update}>
              <option value="year">Per year</option>
              <option value="month">Per month</option>
              <option value="hour">Per hour</option>
            </select>
          </label>
        </div>
      </section>

      <section className="admin-form-section">
        <h2>Classification</h2>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>Department</span>
            <input name="department" value={form.department} onChange={update} placeholder="Engineering" />
          </label>
          <label className="admin-field">
            <span>Posted date</span>
            <input
              name="postedAt"
              type="date"
              value={form.postedAt}
              onChange={update}
              onInput={update}
            />
          </label>
          <label className="admin-field full">
            <span>Category slugs</span>
            <input name="categorySlugs" value={form.categorySlugs} onChange={update} placeholder="software-engineering-jobs, data-ai-jobs" />
            <small>Comma-separated. Values are normalized to URL-safe slugs.</small>
          </label>
          <label className="admin-field full">
            <span>Tags</span>
            <input name="tags" value={form.tags} onChange={update} placeholder="javascript, react, postgres" />
          </label>
          <label className="admin-field">
            <span>Source</span>
            <input name="source" value={form.source} onChange={update} placeholder="manual" />
          </label>
          <label className="admin-field">
            <span>Source ID</span>
            <input name="sourceId" value={form.sourceId} onChange={update} placeholder="Optional external ID" />
          </label>
          <label className="admin-field full">
            <span>Source slug</span>
            <input name="sourceSlug" value={form.sourceSlug} onChange={update} placeholder="Optional ATS/company slug" />
          </label>
        </div>
      </section>

      <button className="admin-submit" type="submit" disabled={submitting}>
        {submitting ? "Adding job..." : "Add job"}
      </button>
    </form>
  );
}
