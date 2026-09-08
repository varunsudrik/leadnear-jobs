import { createHash, randomUUID } from "node:crypto";
import pool from "@/lib/db";
import { hasValidAdminAuth } from "@/lib/admin-auth";
import { generateJobSlug, slugBase } from "@/lib/job-slug.mjs";

export const dynamic = "force-dynamic";

const EMPLOYMENT_TYPES = new Set([
  "FullTime",
  "PartTime",
  "Contract",
  "Temporary",
  "Internship",
  "Other",
]);
const SALARY_PERIODS = new Set(["year", "month", "hour"]);

function text(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function optionalNumber(value) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN;
}

function descriptionHtml(value) {
  return text(value, 100000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function calculateAnnualSalary(min, max, period, currency) {
  if (currency !== "USD" || (min == null && max == null)) return null;
  const midpoint = ((min ?? max) + (max ?? min)) / 2;
  const multiplier = { year: 1, month: 12, hour: 2080 }[period] || 1;
  return Math.round(midpoint * multiplier * 100) / 100;
}

function validate(body) {
  const applyUrl = text(body.applyUrl, 65534);
  const title = text(body.title, 499);
  const canonicalTitle = text(body.canonicalTitle, 299);
  const company = text(body.company, 299);
  const description = text(body.description, 100000);
  const employmentType = text(body.employmentType, 99);
  const salaryPeriod = text(body.salaryPeriod || "year", 19);
  const salaryCurrency = text(body.salaryCurrency || "USD", 9).toUpperCase();
  const salaryMin = optionalNumber(body.salaryMin);
  const salaryMax = optionalNumber(body.salaryMax);

  const errors = [];
  let parsedUrl;
  try {
    parsedUrl = new URL(applyUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) errors.push("Apply URL must use HTTP or HTTPS.");
  } catch {
    errors.push("A valid apply URL is required.");
  }
  if (!title) errors.push("Job title is required.");
  if (!canonicalTitle) errors.push("Canonical title is required.");
  if (!company) errors.push("Company is required.");
  if (description.length < 20) errors.push("Description must contain at least 20 characters.");
  if (!EMPLOYMENT_TYPES.has(employmentType)) errors.push("Employment type is invalid.");
  if (!SALARY_PERIODS.has(salaryPeriod)) errors.push("Salary period is invalid.");
  if (Number.isNaN(salaryMin) || Number.isNaN(salaryMax)) errors.push("Salary values must be positive numbers.");
  if (salaryMin != null && salaryMax != null && salaryMin > salaryMax) {
    errors.push("Minimum salary cannot exceed maximum salary.");
  }

  return {
    errors,
    value: {
      id: text(body.sourceId, 254) || randomUUID(),
      applyUrl: parsedUrl?.toString() || applyUrl,
      title,
      canonicalTitle,
      company,
      companySlug: slugBase(company),
      description: descriptionHtml(description),
      employmentType,
      department: text(body.department, 199) || null,
      remote: body.remote === true,
      salaryMin,
      salaryMax,
      salaryCurrency,
      salaryPeriod,
      salaryAnnualUsd: calculateAnnualSalary(
        salaryMin,
        salaryMax,
        salaryPeriod,
        salaryCurrency
      ),
      postedAt: body.postedAt ? new Date(body.postedAt) : new Date(),
      source: text(body.source, 99) || "manual",
      sourceSlug: text(body.sourceSlug, 199) || null,
      categorySlugs: String(body.categorySlugs ?? "")
        .split(",")
        .map(slugBase)
        .filter(Boolean)
        .join(",")
        .slice(0, 999),
      tags: String(body.tags ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 30),
      locationRaw: text(body.locationRaw, 499),
      locationSlug: slugBase(body.locationRaw),
      countryLabel: text(body.countryLabel, 99),
      countrySlug: slugBase(body.countryLabel),
    },
  };
}

function renderHash(job) {
  return createHash("sha256")
    .update(JSON.stringify(job, Object.keys(job).sort()))
    .digest("hex");
}

export async function POST(request) {
  if (!hasValidAdminAuth(request)) {
    return Response.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="LeadNear Jobs Admin"' },
      }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });

  const { errors, value: job } = validate(body);
  if (errors.length) return Response.json({ errors }, { status: 400 });
  if (Number.isNaN(job.postedAt.getTime())) {
    return Response.json({ errors: ["Posted date is invalid."] }, { status: 400 });
  }

  const applyUrlMd5 = createHash("md5").update(job.applyUrl).digest("hex");
  const hash = renderHash({ ...job, applyUrlMd5 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO jobs (
        id, apply_url, apply_url_md5, title, canonical_title, company,
        company_slug, description, employment_type, department, remote,
        salary_min, salary_max, salary_currency, salary_period,
        salary_annual_usd, posted_at, source, source_slug, category_slugs,
        tags, status, render_hash
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21::jsonb,'success',$22
      )
      RETURNING db_id, job_slug`,
      [
        job.id,
        job.applyUrl,
        applyUrlMd5,
        job.title,
        job.canonicalTitle,
        job.company,
        job.companySlug,
        job.description,
        job.employmentType,
        job.department,
        job.remote ? 1 : 0,
        job.salaryMin,
        job.salaryMax,
        job.salaryCurrency,
        job.salaryPeriod,
        job.salaryAnnualUsd,
        job.postedAt,
        job.source,
        job.sourceSlug,
        job.categorySlugs,
        JSON.stringify(job.tags),
        hash,
      ]
    );

    const id = inserted.rows[0].db_id;
    const generatedSlug = generateJobSlug(job.title, id);
    const slugResult = await client.query(
      `UPDATE jobs
       SET job_slug = $1
       WHERE db_id = $2
       RETURNING job_slug`,
      [generatedSlug, id]
    );
    const jobSlug = slugResult.rows[0]?.job_slug || inserted.rows[0].job_slug || generatedSlug;

    await client.query(
      `INSERT INTO job_locations (
        job_md5, location_raw, location_slug, country_slug, country_label
      ) VALUES ($1,$2,$3,$4,$5)`,
      [
        applyUrlMd5,
        job.locationRaw,
        job.locationSlug,
        job.countrySlug,
        job.countryLabel,
      ]
    );
    await client.query("COMMIT");

    return Response.json(
      {
        created: true,
        id,
        jobSlug,
        path: `/${jobSlug}`,
        publication: "pending",
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      return Response.json(
        { error: "A job with this apply URL already exists." },
        { status: 409 }
      );
    }
    console.error("Admin job creation failed", error);
    return Response.json({ error: "Could not create the job." }, { status: 500 });
  } finally {
    client.release();
  }
}
