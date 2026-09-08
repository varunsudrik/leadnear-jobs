# Job Slug Contract

Final public job URLs use:

```text
https://www.leadnear.com/jobs/{job_slug}
```

`job_slug` is generated from the real job `title` plus the database `db_id`:

```text
integration-and-test-engineer-354340
```

Rules:

- Use the raw job title, not `canonical_title`.
- Lowercase.
- Normalize accented Latin characters, for example `Développeur` -> `developpeur`.
- Replace non `a-z0-9` runs with `-`.
- Trim leading and trailing `-`.
- Keep total length at or below 150 characters.
- Always preserve the final `-{db_id}` suffix.
- If title cleanup is empty, use `job-{db_id}`.

The database `db_id` is required. If an integration feed does not know `db_id`
before inserting, let the application or database generate `job_slug` and read it
back after insert.

Use `job_slug.py` for Python integrations and `lib/job-slug.mjs` for Node/Next.js
code. Keep the test cases in both languages aligned.
