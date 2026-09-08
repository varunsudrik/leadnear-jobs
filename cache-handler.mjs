// Custom Next.js Cache Handler: https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandler
//
// The container rootfs is read-only except for /app/.next/cache,
// /app/.runtime, and /tmp (see compose/jobs/compose.yml). Next's default
// cache handler persists ISR entries under .next/server/, which is part of
// the read-only image layer, so every revalidation write fails with EROFS.
// The render still succeeds and is served, but nothing survives a restart:
// on the next start, statically-built routes revert to whatever was baked
// into the image at build time -- and the image is built without a live
// database, so that snapshot is empty or stale.
//
// This handler persists entries as files under the already-writable
// .next/cache/custom-handler directory, which is bind-mounted to host
// storage. A bounded in-memory LRU handles the hot path without retaining
// every job page a crawler has ever requested. Tag invalidations use small
// persistent marker files so they do not need to read the entire cache.
//
// Entries live under a per-build-ID subdirectory of that path. A statically
// cached page embeds <script> tags for its build's hashed chunk filenames,
// and a freshly deployed image only ships chunks for its own build -- so a
// page cached by a previous build cites chunks that 404 under the new image
// and crashes the client on hydration. Namespacing by build ID means a new
// image can only ever read cache entries it wrote itself; stale sibling
// directories left by prior builds are removed on startup.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { readFile, readdir, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

const NEXT_DIR = path.join(process.cwd(), ".next");
const BUILD_ID = (() => {
  try {
    return readFileSync(path.join(NEXT_DIR, "BUILD_ID"), "utf8").trim();
  } catch {
    return "dev";
  }
})();

const CACHE_ROOT = path.join(NEXT_DIR, "cache", "custom-handler");
const CACHE_DIR = path.join(CACHE_ROOT, BUILD_ID);
const TAG_DIR = path.join(CACHE_DIR, "tag-markers");
export const MAX_MEMORY_ENTRIES = 256;
export const MAX_MEMORY_BYTES = 32 * 1024 * 1024;
// Do not retain every cache filename in a handler instance to enforce this
// cap. Next may construct cache handlers repeatedly; a Set of a large cache
// directory per instance retains tens of thousands of strings and can exhaust
// the server heap. Count the directory once per module process instead.
export const MAX_DISK_ENTRIES = 100_000;
const TAG_WRITE_CONCURRENCY = 16;

let prunedStaleBuilds = false;
let diskEntryCountPromise;
let diskEntryCount = 0;

// Without this, the mounted cache volume would keep a full copy of every
// past build's entries forever, since only the current BUILD_ID's directory
// is ever read again.
function pruneStaleBuildCaches() {
  if (prunedStaleBuilds) return;
  prunedStaleBuilds = true;
  let entries;
  try {
    entries = readdirSync(CACHE_ROOT, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== BUILD_ID) {
      rmSync(path.join(CACHE_ROOT, entry.name), { recursive: true, force: true });
    }
  }
}

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (!existsSync(TAG_DIR)) {
    mkdirSync(TAG_DIR, { recursive: true });
  }
  pruneStaleBuildCaches();
}

function fileForKey(key) {
  const hash = createHash("sha256").update(key).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}

function markerForTag(tag) {
  const hash = createHash("sha256").update(tag).digest("hex");
  return path.join(TAG_DIR, `${hash}.txt`);
}

async function currentDiskEntryCount() {
  if (!diskEntryCountPromise) {
    diskEntryCountPromise = (async () => {
      try {
        const entries = await readdir(CACHE_DIR);
        diskEntryCount = entries.reduce(
          (count, entry) => count + Number(entry.endsWith(".json")),
          0,
        );
      } catch {
        diskEntryCount = 0;
      }
      return diskEntryCount;
    })();
  }
  return diskEntryCountPromise;
}

function normalizeTags(tags) {
  const values = Array.isArray(tags) ? tags : [tags];
  return [...new Set(values.filter((tag) => typeof tag === "string" && tag.length))];
}

// Next never hands a page's tags to this handler through the arguments you
// would expect. set() receives ctx.tags only for kind FETCH, so APP_PAGE
// entries persist with tags: [], and get() is called with just
// {kind, isRoutePPREnabled, isFallback} -- no tags, no softTags. Next core
// compensates by checking tags itself, but only for kind FETCH (see the
// combinedTags block in next/dist/server/lib/incremental-cache/index.js); for
// every other kind this handler is the only thing that can honor a tag.
//
// The tags are still available: Next writes them into the cached response
// headers, and its own FileSystemCache reads them back from there. Deriving
// staleness from entry.tags alone therefore meant unstable_cache entries were
// invalidated correctly while *pages were never invalidated by anything* --
// not revalidateTag("jobs"), not revalidateTag("job:<slug>"), not
// revalidatePath("/<slug>"), which rides on the _N_T_ tags in the same header.
// A cached job page kept serving its first render until the next deploy
// changed BUILD_ID, so edited jobs never updated and deleted jobs stayed live.
const NEXT_CACHE_TAGS_HEADER = "x-next-cache-tags";

function entryTags(entry) {
  const header = entry?.value?.headers?.[NEXT_CACHE_TAGS_HEADER];
  return normalizeTags([
    ...(entry?.tags ?? []),
    ...(typeof header === "string" ? header.split(",") : []),
  ]);
}

async function runWithConcurrency(items, limit, worker) {
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

// JSON.stringify turns a Buffer into {type:"Buffer",data:[...]}. Plain
// JSON.parse does NOT reverse that -- it stays a plain object. Next.js route
// handlers (e.g. sitemap.js, kind APP_ROUTE) store their body as a real
// Buffer, so reading one back without reviving it hands Next a plain object
// where it expects a Buffer, which gets stringified into the literal text
// "[object Object]" when written to the response. This reviver restores any
// Buffer-shaped value anywhere in the parsed tree, not just known fields,
// since Next's cache entry shape varies by kind (FETCH/APP_ROUTE/APP_PAGE/...).
function reviveBuffers(_key, value) {
  if (value && typeof value === "object" && value.type === "Buffer" && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  return value;
}

export default class CacheHandler {
  constructor() {
    this.memoryCache = new Map();
    this.memoryCacheBytes = 0;
    this.tagRevalidations = new Map();
    ensureCacheDir();
  }

  async canPersist(target) {
    const count = await currentDiskEntryCount();
    return existsSync(target) || count < MAX_DISK_ENTRIES;
  }

  removeFromMemory(key) {
    const cached = this.memoryCache.get(key);
    if (!cached) return;
    this.memoryCache.delete(key);
    this.memoryCacheBytes -= cached.size;
  }

  remember(key, entry, size) {
    this.removeFromMemory(key);
    if (size > MAX_MEMORY_BYTES) return;

    this.memoryCache.set(key, { entry, size });
    this.memoryCacheBytes += size;
    while (
      this.memoryCache.size > MAX_MEMORY_ENTRIES ||
      this.memoryCacheBytes > MAX_MEMORY_BYTES
    ) {
      const oldestKey = this.memoryCache.keys().next().value;
      this.removeFromMemory(oldestKey);
    }
  }

  async tagRevalidatedAt(tag) {
    if (this.tagRevalidations.has(tag)) {
      return this.tagRevalidations.get(tag);
    }

    let timestamp = 0;
    try {
      const parsed = Number.parseInt(await readFile(markerForTag(tag), "utf8"), 10);
      if (Number.isFinite(parsed) && parsed > 0) timestamp = parsed;
    } catch {}
    this.tagRevalidations.set(tag, timestamp);
    return timestamp;
  }

  async isStale(entry) {
    const tags = entryTags(entry);
    for (const tag of tags) {
      if (await this.tagRevalidatedAt(tag) >= entry.lastModified) return true;
    }
    return false;
  }

  async discard(key) {
    this.removeFromMemory(key);
    await unlink(fileForKey(key)).catch(() => {});
  }

  async get(key) {
    const cached = this.memoryCache.get(key);
    if (cached) {
      if (await this.isStale(cached.entry)) {
        await this.discard(key);
        return null;
      }
      // Refresh insertion order so the Map behaves as an LRU.
      this.memoryCache.delete(key);
      this.memoryCache.set(key, cached);
      return cached.entry;
    }

    try {
      const raw = await readFile(fileForKey(key), "utf8");
      const entry = JSON.parse(raw, reviveBuffers);
      if (await this.isStale(entry)) {
        await this.discard(key);
        return null;
      }
      this.remember(key, entry, Buffer.byteLength(raw));
      return entry;
    } catch {
      return null;
    }
  }

  async set(key, data, ctx) {
    const tags = normalizeTags(ctx?.tags ?? []);
    // Bump past every tag get() will later test, which for a page means the
    // ones in its response header rather than ctx.tags. Using ctx.tags alone
    // left a page re-rendered in the same millisecond as its own invalidation
    // stamped at the marker's timestamp, so isStale's >= comparison discarded
    // it immediately and the render could never be cached.
    let lastModified = Date.now();
    for (const tag of entryTags({ value: data, tags })) {
      lastModified = Math.max(lastModified, (await this.tagRevalidatedAt(tag)) + 1);
    }
    const entry = {
      value: data,
      lastModified,
      tags,
    };
    const serialized = JSON.stringify(entry);
    this.remember(key, entry, Buffer.byteLength(serialized));

    ensureCacheDir();
    const target = fileForKey(key);
    const existedBeforeWrite = existsSync(target);
    if (!(await this.canPersist(target))) return;
    // pid alone is not unique enough: two concurrent set() calls for the SAME
    // key within this one process share a pid and would collide on the same
    // temp path, corrupting whichever write loses the race. Add randomness
    // per call so concurrent writes never share a temp file.
    const tmp = `${target}.${process.pid}-${randomBytes(6).toString("hex")}.tmp`;
    try {
      await writeFile(tmp, serialized);
      await rename(tmp, target);
      if (!existedBeforeWrite) diskEntryCount += 1;
    } catch (error) {
      // Never let a persistence failure break the response that already
      // rendered successfully -- log and keep serving from memory.
      console.error(`Cache handler failed to persist key to disk: ${error.message}`);
      await unlink(tmp).catch(() => {});
    }
  }

  async revalidateTag(tags) {
    const tagList = normalizeTags(tags);
    if (!tagList.length) return;
    // A newly rendered entry is stamped one millisecond after the newest tag
    // marker it carries. Keep all markers monotonic so a different tag
    // invalidated in the same millisecond cannot be older than that entry.
    const newestKnownMarker = Math.max(0, ...this.tagRevalidations.values());
    const timestamp = Math.max(Date.now(), newestKnownMarker + 1);
    for (const tag of tagList) {
      this.tagRevalidations.set(tag, timestamp);
    }

    // entryTags, not entry.tags: a page's tags live in its response headers,
    // so matching on entry.tags alone left every page in memory untouched.
    for (const [key, cached] of this.memoryCache) {
      if (entryTags(cached.entry).some((tag) => tagList.includes(tag))) {
        this.removeFromMemory(key);
      }
    }

    ensureCacheDir();
    await runWithConcurrency(tagList, TAG_WRITE_CONCURRENCY, async (tag) => {
      const target = markerForTag(tag);
      const tmp = `${target}.${process.pid}-${randomBytes(6).toString("hex")}.tmp`;
      try {
        await writeFile(tmp, String(timestamp));
        await rename(tmp, target);
      } catch (error) {
        console.error(`Cache handler failed to persist tag marker: ${error.message}`);
        await unlink(tmp).catch(() => {});
      }
    });
  }

  resetRequestCache() {}
}
