import assert from "node:assert/strict";
import { fmtSalary, initials } from "../lib/format.mjs";

// Absent salary stays null — the em-dash is applied by the card, not here,
// because other callers depend on null to omit the field entirely.
assert.equal(fmtSalary({ salary_min: null, salary_max: null }), null);

// Shapes taken verbatim from the spec's job fixtures. The design abbreviates
// once at the end of a range and drops the unit for annual pay.
assert.equal(
  fmtSalary({ salary_min: 150000, salary_max: 190000, salary_currency: "USD", salary_period: "year" }),
  "USD 150–190K"
);
assert.equal(
  fmtSalary({ salary_min: 120000, salary_max: 145000, salary_currency: "EUR", salary_period: "year" }),
  "EUR 120–145K"
);
// Non-annual pay keeps its unit, spaced as the spec shows it.
assert.equal(
  fmtSalary({ salary_min: 95, salary_max: null, salary_currency: "USD", salary_period: "hour" }),
  "USD 95+ /hr"
);

// Unchanged behaviour, asserted so a later edit cannot quietly regress it.
assert.equal(initials("Northwind Labs"), "NL");
assert.equal(initials(""), "JB");

console.log("format ok");
