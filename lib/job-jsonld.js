const NON_VALUES = new Set([
  "",
  "n/a",
  "na",
  "null",
  "none",
  "undefined",
  "not available",
  "unknown",
  "worldwide",
]);

const LOCATION_NON_VALUES = /^(remote|hybrid|telecommute|anywhere|global|worldwide|on[- ]?site|multiple locations|\d+ locations?)$/i;

const US_STATE_NAMES = new Map([
  ["alabama", "AL"], ["alaska", "AK"], ["arizona", "AZ"], ["arkansas", "AR"],
  ["california", "CA"], ["colorado", "CO"], ["connecticut", "CT"], ["delaware", "DE"],
  ["florida", "FL"], ["georgia", "GA"], ["hawaii", "HI"], ["idaho", "ID"],
  ["illinois", "IL"], ["indiana", "IN"], ["iowa", "IA"], ["kansas", "KS"],
  ["kentucky", "KY"], ["louisiana", "LA"], ["maine", "ME"], ["maryland", "MD"],
  ["massachusetts", "MA"], ["michigan", "MI"], ["minnesota", "MN"], ["mississippi", "MS"],
  ["missouri", "MO"], ["montana", "MT"], ["nebraska", "NE"], ["nevada", "NV"],
  ["new hampshire", "NH"], ["new jersey", "NJ"], ["new mexico", "NM"], ["new york", "NY"],
  ["north carolina", "NC"], ["north dakota", "ND"], ["ohio", "OH"], ["oklahoma", "OK"],
  ["oregon", "OR"], ["pennsylvania", "PA"], ["rhode island", "RI"],
  ["south carolina", "SC"], ["south dakota", "SD"], ["tennessee", "TN"], ["texas", "TX"],
  ["utah", "UT"], ["vermont", "VT"], ["virginia", "VA"], ["washington", "WA"],
  ["west virginia", "WV"], ["wisconsin", "WI"], ["wyoming", "WY"],
  ["district of columbia", "DC"],
]);
const US_STATES = new Set(US_STATE_NAMES.values());

const COUNTRY_DEFINITIONS = [
  ["US", "United States", ["usa", "u.s.a.", "united-states"]],
  ["GB", "United Kingdom", ["uk", "united-kingdom", "england", "scotland", "wales"]],
  ["CA", "Canada", []],
  ["IN", "India", []],
  ["AU", "Australia", []],
  ["SG", "Singapore", []],
  ["DE", "Germany", []],
  ["NL", "Netherlands", []],
  ["FR", "France", []],
  ["IE", "Ireland", []],
  ["HK", "Hong Kong", ["hong-kong"]],
  ["SE", "Sweden", []],
  ["CH", "Switzerland", []],
  ["ES", "Spain", []],
  ["RS", "Serbia", []],
  ["BR", "Brazil", []],
  ["MX", "Mexico", []],
  ["JP", "Japan", []],
  ["IL", "Israel", []],
  ["NZ", "New Zealand", ["new-zealand"]],
  ["PL", "Poland", []],
  ["PT", "Portugal", []],
  ["AE", "United Arab Emirates", ["uae", "united-arab-emirates"]],
  ["CN", "China", []],
  ["NG", "Nigeria", []],
  ["PH", "Philippines", []],
  ["MY", "Malaysia", []],
  ["GR", "Greece", []],
  ["ID", "Indonesia", []],
  ["IT", "Italy", []],
  ["BE", "Belgium", []],
  ["CO", "Colombia", []],
  ["AT", "Austria", []],
  ["SA", "Saudi Arabia", ["saudi-arabia"]],
  ["ZA", "South Africa", ["south-africa"]],
  ["AR", "Argentina", []],
  ["TH", "Thailand", []],
  ["RO", "Romania", []],
  ["HU", "Hungary", []],
  ["VN", "Vietnam", []],
  ["EG", "Egypt", []],
  ["TW", "Taiwan", []],
  ["CZ", "Czech Republic", ["czechia", "czech-republic"]],
  ["DK", "Denmark", []],
  ["FI", "Finland", []],
  ["NO", "Norway", []],
  ["KR", "South Korea", ["korea", "south-korea"]],
  ["CL", "Chile", []],
  ["PE", "Peru", []],
];

function normalizedKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const COUNTRY_LOOKUP = new Map();
for (const [code, name, aliases] of COUNTRY_DEFINITIONS) {
  const country = { code, name };
  COUNTRY_LOOKUP.set(code.toLowerCase(), country);
  COUNTRY_LOOKUP.set(normalizedKey(name), country);
  for (const alias of aliases) COUNTRY_LOOKUP.set(normalizedKey(alias), country);
}

export function cleanValue(value) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  return NON_VALUES.has(text.toLowerCase()) ? undefined : text;
}

export function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function normalizeCountry(value, { allowCode = true } = {}) {
  const text = cleanValue(value);
  if (!text) return undefined;
  const key = normalizedKey(text);
  if (!allowCode && /^[a-z]{2}$/.test(key)) return undefined;
  return COUNTRY_LOOKUP.get(key);
}

function countryList(value, options) {
  const text = cleanValue(value);
  if (!text) return [];

  const parts = text.split(/\|\||,/).map(cleanValue).filter(Boolean);
  const countries = [];
  for (const part of parts) {
    const exact = normalizeCountry(part, options);
    if (exact) {
      countries.push(exact);
      continue;
    }

    const partKey = normalizedKey(part);
    for (const [key, country] of COUNTRY_LOOKUP) {
      if (key.length > 2 && (partKey === key || partKey.endsWith(`-${key}`))) {
        countries.push(country);
        break;
      }
    }
  }
  return countries;
}

function uniqueCountries(countries) {
  return [...new Map(countries.map((country) => [country.code, country])).values()];
}

function countriesFromJob(job) {
  const explicit = uniqueCountries([
    ...countryList(job?.address_country),
    ...countryList(job?.country_labels),
    ...countryList(job?.country_slugs),
  ]);
  if (explicit.length) return explicit;

  return uniqueCountries(
    (Array.isArray(job?.locations) ? job.locations : [])
      .flatMap((location) => countryList(location, { allowCode: false }))
  );
}

function stripCountryAffixes(raw, country) {
  let text = raw.trim();
  if (!country) return text;

  const labels = [country.name, country.code]
    .map((value) => value.replace(/[.*+?^${\}()|[\]\\]/g, "\\$&"));

  for (const label of labels) {
    text = text
      .replace(new RegExp(`^\\s*${label}\\s*[-–—|:]\\s*`, "i"), "")
      .replace(new RegExp(`[,|]\\s*${label}\\s*$`, "i"), "")
      .trim();
  }
  return text;
}

function stateCode(value) {
  const text = cleanValue(value);
  if (!text) return undefined;
  const upper = text.toUpperCase();
  if (US_STATES.has(upper)) return upper;
  return US_STATE_NAMES.get(text.toLowerCase());
}

function parseUsLocation(raw, country) {
  const text = stripCountryAffixes(raw, country);
  const candidates = text
    .split(/\s+[|;]\s+|\s+-\s+/)
    .map(cleanValue)
    .filter(Boolean);

  for (const candidate of [...candidates].reverse()) {
    const streetFirst = candidate.match(
      /^(\d{1,6}\s+[^,]+),\s*([^,]+),\s*([A-Za-z ]+?)(?:\s+(\d{5}(?:-\d{4})?))?$/
    );
    const streetRegion = stateCode(streetFirst?.[3]);
    if (streetFirst && streetRegion) {
      return compactObject({
        streetAddress: streetFirst[1],
        addressLocality: streetFirst[2],
        addressRegion: streetRegion,
        postalCode: streetFirst[4],
      });
    }

    const cityStateStreet = candidate.match(
      /^([A-Za-z][A-Za-z .'-]*?)\s*,?\s+([A-Z]{2})\s+(\d{1,6}\s+.+)$/
    );
    if (cityStateStreet && US_STATES.has(cityStateStreet[2])) {
      return {
        streetAddress: cityStateStreet[3],
        addressLocality: cityStateStreet[1],
        addressRegion: cityStateStreet[2],
      };
    }

    const cityState = candidate.match(
      /^([A-Za-z][A-Za-z .'-]*?)\s*,?\s+([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/
    );
    if (cityState && US_STATES.has(cityState[2])) {
      return compactObject({
        addressLocality: cityState[1],
        addressRegion: cityState[2],
        postalCode: cityState[3],
      });
    }
  }

  const parts = text.split(",").map(cleanValue).filter(Boolean);
  const lastState = stateCode(parts.at(-1));
  if (parts.length >= 2 && lastState) {
    return {
      addressLocality: parts.at(-2),
      addressRegion: lastState,
    };
  }
  if (parts.length === 1 && stateCode(parts[0])) {
    return { addressRegion: stateCode(parts[0]) };
  }
  return {};
}

function parseGenericLocation(raw, country, structuredRegion) {
  const text = stripCountryAffixes(raw, country);
  if (!cleanValue(text) || LOCATION_NON_VALUES.test(text)) return {};

  const cityStreet = text.match(/^([^,|]+?)\s+-\s+(\d{1,6}\s+.+)$/);
  if (cityStreet) {
    return {
      streetAddress: cleanValue(cityStreet[2]),
      addressLocality: cleanValue(cityStreet[1]),
    };
  }

  const parts = text.split(",").map(cleanValue).filter(Boolean);
  if (!parts.length) return {};

  const region = cleanValue(structuredRegion);
  if (parts.length === 1) {
    const value = parts[0];
    if (region && normalizedKey(value) === normalizedKey(region)) return {};
    if (country && normalizedKey(value) === normalizedKey(country.name)) return {};
    if (country && normalizedKey(value) === country.code.toLowerCase()) return {};
    return { addressLocality: value };
  }

  if (/^\d{1,6}\s+/.test(parts[0])) {
    return compactObject({
      streetAddress: parts[0],
      addressLocality: parts[1],
      addressRegion: region || parts[2],
    });
  }

  return compactObject({
    addressLocality: parts[0],
    addressRegion: region || parts[1],
  });
}

function isUsCountry(country) {
  return country?.code === "US";
}

export function postalAddressFromLocation(rawLocation, countryHint, structured = {}) {
  const raw = cleanValue(rawLocation);
  const country =
    normalizeCountry(structured.addressCountry) ||
    normalizeCountry(countryHint) ||
    normalizeCountry(raw, { allowCode: false });

  const parsed = raw && !LOCATION_NON_VALUES.test(raw)
    ? {
        ...parseGenericLocation(raw, country, structured.addressRegion),
        ...(isUsCountry(country) ? parseUsLocation(raw, country) : {}),
      }
    : {};

  const postalCode = cleanValue(structured.postalCode);
  const safePostalCode = postalCode === "00000" ? undefined : postalCode;
  const addressCountry = country?.code || cleanValue(structured.addressCountry);

  const address = compactObject({
    "@type": "PostalAddress",
    streetAddress: cleanValue(structured.streetAddress) || cleanValue(parsed.streetAddress),
    addressLocality: cleanValue(structured.addressLocality) || cleanValue(parsed.addressLocality),
    addressRegion: cleanValue(structured.addressRegion) || cleanValue(parsed.addressRegion),
    postalCode: safePostalCode || cleanValue(parsed.postalCode),
    addressCountry,
  });

  return Object.keys(address).length > 1 ? address : undefined;
}

export function countryRequirementFromJob(job) {
  const requirements = countriesFromJob(job).map((country) => ({
    "@type": "Country",
    "name": country.name,
  }));

  if (!requirements.length) return undefined;
  return requirements.length === 1 ? requirements[0] : requirements;
}

export function jobLocationsForJsonLd(job) {
  if (Number(job?.remote) === 1) return undefined;

  const rawLocations = Array.isArray(job?.locations)
    ? job.locations.map(cleanValue).filter(Boolean)
    : [];
  const countryHints = String(job?.country_labels || job?.country_slugs || "")
    .split(",")
    .map(cleanValue)
    .filter(Boolean);

  const structured = {
    streetAddress: job?.street_address,
    addressRegion: job?.address_region,
    postalCode: job?.postal_code,
    addressCountry: job?.address_country,
  };
  const hasStructured = Object.values(structured).some((value) => cleanValue(value));

  if (hasStructured) {
    const address = postalAddressFromLocation(
      rawLocations.find((location) => !LOCATION_NON_VALUES.test(location)),
      structured.addressCountry || countryHints[0],
      structured
    );
    return address ? { "@type": "Place", address } : undefined;
  }

  const places = rawLocations
    .map((location, index) =>
      postalAddressFromLocation(location, countryHints[index] || countryHints[0])
    )
    .filter(Boolean)
    .map((address) => ({ "@type": "Place", address }));

  const unique = [...new Map(places.map((place) => [JSON.stringify(place), place])).values()];
  if (!unique.length) return undefined;
  return unique.length === 1 ? unique[0] : unique;
}

function isoDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().split("T")[0];
}

function plainDescription(value) {
  const text = cleanValue(value);
  if (!text) return undefined;
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

function employmentType(value) {
  const text = cleanValue(value);
  if (!text) return undefined;
  const key = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const known = {
    fulltime: "FULL_TIME",
    parttime: "PART_TIME",
    contract: "CONTRACTOR",
    contractor: "CONTRACTOR",
    temporary: "TEMPORARY",
    temp: "TEMPORARY",
    internship: "INTERN",
    intern: "INTERN",
    volunteer: "VOLUNTEER",
    perdiem: "PER_DIEM",
    other: "OTHER",
  };
  return known[key] || text.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function salaryUnit(value) {
  const key = cleanValue(value)?.toLowerCase().replace(/[^a-z]/g, "");
  return {
    year: "YEAR",
    yearly: "YEAR",
    annual: "YEAR",
    annually: "YEAR",
    month: "MONTH",
    monthly: "MONTH",
    week: "WEEK",
    weekly: "WEEK",
    day: "DAY",
    daily: "DAY",
    hour: "HOUR",
    hourly: "HOUR",
  }[key];
}

function baseSalaryFromJob(job) {
  const min = positiveNumber(job?.salary_min);
  const max = positiveNumber(job?.salary_max);
  const currency = cleanValue(job?.salary_currency)?.toUpperCase();
  const unitText = salaryUnit(job?.salary_period);

  if ((!min && !max) || !/^[A-Z]{3}$/.test(currency || "") || !unitText) {
    return undefined;
  }

  const value = {
    "@type": "QuantitativeValue",
    "unitText": unitText,
  };
  if (min && max && min !== max) {
    value.minValue = min;
    value.maxValue = max;
  } else {
    value.value = min || max;
  }

  return {
    "@type": "MonetaryAmount",
    "currency": currency,
    "value": value,
  };
}

function optionalText(value) {
  const text = cleanValue(value);
  return text || undefined;
}

export function buildJobPostingJsonLd(job, url) {
  const title = cleanValue(job?.title);
  const description = plainDescription(job?.description);
  const canonicalUrl = cleanValue(url);
  const organizationName = cleanValue(job?.company);
  const datePosted = isoDate(job?.posted_at);
  const validThrough = isoDate(job?.valid_through);

  if (!title || !description || !canonicalUrl || !organizationName || !datePosted || !validThrough) {
    return undefined;
  }

  const identifierValue = cleanValue(job?.db_id ?? job?.id ?? job?.job_slug);
  const schema = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": title,
    "description": description,
    "datePosted": datePosted,
    "validThrough": validThrough,
    "url": canonicalUrl,
    "identifier": identifierValue
      ? {
          "@type": "PropertyValue",
          "name": "LeadNear",
          "value": identifierValue,
        }
      : undefined,
    "hiringOrganization": {
      "@type": "Organization",
      "name": organizationName,
    },
  };

  const type = employmentType(job?.employment_type);
  if (type) schema.employmentType = type;

  if (Number(job?.remote) === 1) {
    schema.jobLocationType = "TELECOMMUTE";
    const requirements = countryRequirementFromJob(job);
    if (requirements) schema.applicantLocationRequirements = requirements;
  } else {
    const locations = jobLocationsForJsonLd(job);
    if (locations) schema.jobLocation = locations;
  }

  const baseSalary = baseSalaryFromJob(job);
  if (baseSalary) schema.baseSalary = baseSalary;

  const optionalFields = {
    industry: job?.industry,
    occupationalCategory: job?.occupationalCategory || job?.canonical_title,
    experienceRequirements: job?.experienceRequirements || job?.experience_requirements,
    educationRequirements: job?.educationRequirements || job?.education_requirements,
    skills: Array.isArray(job?.skills) ? job.skills.filter(Boolean).join(", ") : job?.skills,
    qualifications: job?.qualifications,
    responsibilities: job?.responsibilities,
    benefits: job?.benefits,
  };
  for (const [key, value] of Object.entries(optionalFields)) {
    const text = optionalText(value);
    if (text) schema[key] = text;
  }

  if (typeof job?.directApply === "boolean") schema.directApply = job.directApply;
  if (typeof job?.direct_apply === "boolean") schema.directApply = job.direct_apply;

  return compactObject(schema);
}
