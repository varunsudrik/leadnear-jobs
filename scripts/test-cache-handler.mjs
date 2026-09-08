import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "leadnear-cache-handler-"));

try {
  process.chdir(testRoot);
  const {
    default: CacheHandler,
    MAX_MEMORY_BYTES,
    MAX_MEMORY_ENTRIES,
  } = await import(`../cache-handler.mjs?test=${Date.now()}`);

  const handler = new CacheHandler();
  for (let index = 0; index < MAX_MEMORY_ENTRIES + 25; index += 1) {
    await handler.set(`entry-${index}`, { index }, { tags: ["jobs"] });
  }
  assert.equal(handler.memoryCache.size, MAX_MEMORY_ENTRIES);
  assert.equal(handler.memoryCache.has("entry-0"), false);
  assert.equal(handler.memoryCache.has(`entry-${MAX_MEMORY_ENTRIES + 24}`), true);

  const largeValue = "x".repeat(1024 * 1024);
  for (let index = 0; index < 40; index += 1) {
    await handler.set(`large-${index}`, { largeValue }, { tags: ["large"] });
  }
  assert.ok(handler.memoryCacheBytes <= MAX_MEMORY_BYTES);

  await handler.set("tagged-entry", { version: "before" }, { tags: ["site-metrics"] });
  await handler.revalidateTag("site-metrics");

  const restartedHandler = new CacheHandler();
  assert.equal(await restartedHandler.get("tagged-entry"), null);
  await restartedHandler.set("tagged-entry", { version: "after" }, { tags: ["site-metrics"] });
  assert.deepEqual((await restartedHandler.get("tagged-entry")).value, { version: "after" });

  // An APP_PAGE entry carries no ctx.tags -- Next exposes a page's tags only
  // through the x-next-cache-tags response header. Deriving staleness from
  // entry.tags alone silently made every page permanently uninvalidatable:
  // revalidateTag and revalidatePath were both no-ops for job pages.
  const pageEntry = {
    kind: "APP_PAGE",
    html: "<h1>before</h1>",
    headers: {
      "x-next-cache-tags":
        "_N_T_/layout,_N_T_/[slug]/page,_N_T_/my-job-1,jobs,job:my-job-1",
    },
  };

  const pageHandler = new CacheHandler();
  await pageHandler.set("/my-job-1", pageEntry, {});
  assert.ok(await pageHandler.get("/my-job-1"), "page should cache before revalidation");

  await pageHandler.revalidateTag("job:my-job-1");
  assert.equal(
    await pageHandler.get("/my-job-1"),
    null,
    "per-job tag must invalidate the page (read from the header, not ctx.tags)"
  );

  // revalidatePath rides on the _N_T_ prefixed tags in that same header.
  await pageHandler.set("/my-job-1", pageEntry, {});
  assert.ok(await pageHandler.get("/my-job-1"));
  await pageHandler.revalidateTag("_N_T_/my-job-1");
  assert.equal(
    await pageHandler.get("/my-job-1"),
    null,
    "revalidatePath must invalidate the page"
  );

  // A page must survive a tag it does not carry, or the publisher's aggregate
  // refresh would flush every job page on the site all over again.
  await pageHandler.set("/my-job-1", pageEntry, {});
  await pageHandler.revalidateTag("jobs-aggregates");
  assert.ok(
    await pageHandler.get("/my-job-1"),
    "an unrelated tag must not invalidate the page"
  );

  // The same derivation has to apply to the in-memory LRU, not just to disk.
  const memoryHandler = new CacheHandler();
  await memoryHandler.set("/my-job-2", pageEntry, {});
  assert.equal(memoryHandler.memoryCache.has("/my-job-2"), true);
  await memoryHandler.revalidateTag("jobs");
  assert.equal(
    memoryHandler.memoryCache.has("/my-job-2"),
    false,
    "revalidateTag must evict matching pages from memory too"
  );

  console.log("Cache handler memory and tag-invalidation checks passed.");
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
