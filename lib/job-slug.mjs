const DEFAULT_MAX_LENGTH = 150;

export function slugBase(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateJobSlug(title, dbId, maxLength = DEFAULT_MAX_LENGTH) {
  const id = String(dbId ?? "").trim();
  if (!/^\d+$/.test(id)) {
    throw new Error("generateJobSlug requires a numeric dbId");
  }

  const suffix = `-${id}`;
  const limit = Math.max(suffix.length + 3, Number(maxLength) || DEFAULT_MAX_LENGTH);
  const titleLimit = limit - suffix.length;
  let base = slugBase(title);

  if (!base) return `job${suffix}`;
  if (base.length > titleLimit) {
    base = base.slice(0, titleLimit).replace(/-+$/g, "");
  }

  return `${base || "job"}${suffix}`;
}
