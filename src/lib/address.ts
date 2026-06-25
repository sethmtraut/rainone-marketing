// Address normalization for reliable matching across prospect lists, ServiceTitan
// customers, and prior mail runs. Match key = normalized street + 5-digit ZIP.

const WORD_MAP: Record<string, string> = {
  // Street suffixes
  street: "st", st: "st",
  avenue: "ave", ave: "ave", av: "ave",
  boulevard: "blvd", blvd: "blvd",
  drive: "dr", dr: "dr",
  road: "rd", rd: "rd",
  lane: "ln", ln: "ln",
  court: "ct", ct: "ct",
  place: "pl", pl: "pl",
  terrace: "ter", ter: "ter",
  circle: "cir", cir: "cir",
  trail: "trl", trl: "trl",
  parkway: "pkwy", pkwy: "pkwy",
  highway: "hwy", hwy: "hwy",
  square: "sq", sq: "sq",
  crossing: "xing", xing: "xing",
  point: "pt", pt: "pt",
  cove: "cv", cv: "cv",
  bend: "bnd", bnd: "bnd",
  loop: "loop",
  way: "way",
  run: "run",
  pass: "pass",
  pike: "pike",
  // Directionals
  north: "n", south: "s", east: "e", west: "w",
  northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
  // Unit designators (kept, standardized)
  apartment: "apt", apt: "apt",
  suite: "ste", ste: "ste",
  unit: "unit",
  building: "bldg", bldg: "bldg",
  floor: "fl", fl: "fl",
  room: "rm", rm: "rm",
};

export function zip5(z: unknown): string {
  const m = String(z ?? "").match(/\d{5}/);
  return m ? m[0] : "";
}

export function normalizeStreet(s: unknown): string {
  let t = String(s ?? "").toLowerCase().trim();
  t = t.replace(/[.,#]/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const words = t.split(" ").map((w) => WORD_MAP[w] ?? w);
  return words.join(" ").replace(/\s+/g, " ").trim();
}

/** Match key: normalized street + zip5. Empty string if either is missing. */
export function addressKey(street: unknown, zip: unknown): string {
  const s = normalizeStreet(street);
  const z = zip5(zip);
  if (!s || !z) return "";
  return `${s}|${z}`;
}
