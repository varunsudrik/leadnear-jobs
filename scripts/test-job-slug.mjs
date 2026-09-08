import assert from "node:assert/strict";
import { generateJobSlug } from "../lib/job-slug.mjs";

const repeated = Array.from({ length: 40 }, () => "Principal").join(" ");
const cases = [
  ["Integration and Test Engineer", 354340, "integration-and-test-engineer-354340"],
  ["Développeur Full-Stack / API", 42, "developpeur-full-stack-api-42"],
  ["工程師", 99, "job-99"],
  ["", 100, "job-100"],
  [null, 101, "job-101"],
  ["Senior $$$ Data Engineer!!!", 777, "senior-data-engineer-777"],
];

for (const [title, dbId, expected] of cases) {
  assert.equal(generateJobSlug(title, dbId), expected);
}

const longSlug = generateJobSlug(repeated, 123456, 80);
assert.equal(longSlug.length <= 80, true);
assert.equal(longSlug.endsWith("-123456"), true);

assert.throws(() => generateJobSlug("Engineer", null), /numeric dbId/);
assert.throws(() => generateJobSlug("Engineer", "abc"), /numeric dbId/);

console.log("job slug JS tests passed");
