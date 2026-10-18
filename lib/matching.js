// DNA matching: a transparent, deterministic score so every match can be traced
// back to the client's DNA. Claude (when available) only writes the "why" text
// and the set-coherence note on top of these numbers.

import { tagTh, fitTh } from "./th.js";

export const CATEGORIES = [
  { key: "venue", label: "Venue", share: 0.32 },
  { key: "catering", label: "Catering", share: 0.3 },
  { key: "entertainment", label: "Entertainment", share: 0.08 },
  { key: "decor", label: "Decor & design", share: 0.14 },
  { key: "photography", label: "Photography", share: 0.06 },
  { key: "experience", label: "Experience", share: 0.03 },
  { key: "av", label: "AV & stage", share: 0.1 },
  { key: "transport", label: "Transport", share: 0.02 },
];

// Words that mean roughly the same thing to a client. Keeps "cozy" and "warm"
// or "party" and "lively" from missing each other.
const SYNONYMS = [
  ["elegant", "refined", "classy", "graceful"],
  ["romantic", "soft", "dreamy", "love"],
  ["warm", "cozy", "glowing", "inviting", "warm lighting", "candlelight"],
  ["lively", "energetic", "energy", "party", "fun", "joyful", "dance"],
  ["intimate", "personal", "close", "small"],
  ["modern", "contemporary", "minimal", "clean", "sleek"],
  ["formal", "ceremonial", "classic", "traditional", "grand", "ballroom"],
  ["luxurious", "luxury", "opulent", "gold", "crystal", "over-the-top"],
  ["relaxed", "casual", "laid-back", "breezy", "free-spirited"],
  ["natural", "garden", "greenery", "botanical", "tropical", "outdoor"],
  ["playful", "fun", "interactive", "quirky"],
  ["professional", "polished", "corporate", "organised"],
  ["inspiring", "bold", "creative"],
  ["tech", "led", "digital", "modern"],
  ["rustic", "wood", "natural wood", "teak"],
  ["boho", "beach", "rattan"],
];

const norm = (s) => String(s || "").toLowerCase().trim();

const STOP = new Set(["the", "and", "for", "with", "too", "not", "very", "top", "over"]);
function expand(term) {
  const t = norm(term);
  const out = new Set([t]);
  // single words count too ("modern romantic" meets "romantic"), but not filler words:
  // "behind the scenes" must not match "over-the-top"
  for (const w of t.split(/[\s/,&-]+/).filter((x) => x.length > 2 && !STOP.has(x))) out.add(w);
  for (const group of SYNONYMS) {
    if (group.some((g) => t.includes(g))) group.forEach((g) => out.add(g));
  }
  return out;
}

function overlap(clientTerms, vendorTerms) {
  const v = new Set();
  vendorTerms.forEach((t) => expand(t).forEach((x) => v.add(x)));
  const hits = [];
  for (const c of clientTerms) {
    const ex = expand(c);
    if ([...ex].some((x) => v.has(x))) hits.push(c);
  }
  return hits;
}

function vendorTerms(vendor) {
  const d = vendor.dna || {};
  return [...(d.mood || []), ...(d.feel || []), ...(d.look || []), ...(vendor.tags || [])];
}

export function categoryBudget(event, category) {
  const total = event.dna?.basics?.budget || event.budget;
  const cat = CATEGORIES.find((c) => c.key === category);
  // an event can carry its own split (a launch spends on stage and show, not on the venue)
  const share = event.dna?.creative?.shares?.[category] ?? cat?.share;
  return total && share ? Math.round(total * share) : null;
}

function estimateCost(vendor, guests) {
  const unit = vendor.priceUnit;
  const from = vendor.priceFrom ?? null;
  if (from == null) return null;
  if (unit === "per guest") return from * (guests || 100);
  return from;
}

// Score one vendor for one event. Returns 0-5 and the evidence behind it.
export function scoreVendor(event, vendor) {
  const dna = event.dna || {};
  const style = dna.style || {};
  const basics = dna.basics || {};
  const vt = vendorTerms(vendor);

  const moodHits = overlap(style.mood || [], vt);
  const feelHits = overlap(style.feel || [], vt);
  const lookHits = overlap(style.look || [], vt);
  const reqTexts = (dna.requirements || []).filter((r) => r.category === vendor.category).map((r) => r.text);
  const reqHits = overlap(reqTexts, vt);
  const avoidHits = overlap(style.avoid || [], vt);

  const ratio = (hits, all) => (all?.length ? hits.length / all.length : 0.5);
  let style01 =
    0.3 * ratio(moodHits, style.mood) +
    0.25 * ratio(feelHits, style.feel) +
    0.3 * ratio(lookHits, style.look) +
    0.15 * ratio(reqHits, reqTexts);

  // Learned reactions from the client (DEEPEN). +/- weights on tags.
  const learned = dna.learned || [];
  for (const l of learned) {
    const hit = overlap([l.term], vt).length > 0;
    if (hit) style01 += l.weight > 0 ? 0.08 : -0.12;
  }
  style01 -= 0.18 * avoidHits.length;

  // Practical fit
  const fits = [];
  const issues = [];
  const needsConfirmation = [...(vendor.missing || [])];
  let practical = 1;

  // specialists (a launch crew) rank lower for other kinds of event
  const type = event.dna?.eventType || event.type;
  if (vendor.forTypes && type && !vendor.forTypes.includes(type)) { practical -= 0.6; issues.push(`Specialises in ${vendor.forTypes[0]} events`); }

  const guests = basics.guests;
  if (guests && vendor.capacity) {
    if (guests > vendor.capacity.max) { practical -= 0.6; issues.push(`Max ${vendor.capacity.max} guests`); }
    else if (guests < vendor.capacity.min * 0.7) { practical -= 0.15; issues.push(`Built for ${vendor.capacity.min}+ guests`); }
    else fits.push(`${guests} guests`);
  }
  const loc = norm(basics.location);
  if (loc) {
    const area = [vendor.location, ...(vendor.serviceArea || [])].map(norm);
    if (area.some((a) => a && (loc.includes(a) || a.includes(loc)))) fits.push(vendor.location);
    else { practical -= 0.35; issues.push(`Based in ${vendor.location}`); }
  }
  if (basics.setting && vendor.setting) {
    const want = norm(basics.setting);
    const has = norm(vendor.setting);
    if (want.includes("outdoor") && !has.includes("outdoor")) { practical -= 0.15; issues.push("Indoor only"); }
    else if (want.includes("indoor") && !has.includes("indoor")) { practical -= 0.15; issues.push("Outdoor only"); }
    else fits.push(vendor.setting);
  }
  const date = basics.date;
  let availability = "unknown";
  if (date) {
    availability = vendor.availability?.[date] || "unknown";
    if (availability === "booked") { practical -= 0.7; issues.push(`Booked on ${date}`); }
    else if (availability === "unknown") needsConfirmation.unshift(`Availability on ${date}`);
  }
  const est = estimateCost(vendor, guests);
  const allowance = categoryBudget(event, vendor.category);
  if (est != null && allowance) {
    if (est > allowance * 1.35) { practical -= 0.25; issues.push("Above budget share"); }
    else fits.push("Within budget");
  }
  if (vendor.priceFrom == null) needsConfirmation.push("Price");

  const raw = Math.max(0, Math.min(1, style01)) * 0.65 + Math.max(0, practical) * 0.35;
  const score = Math.round(raw * 50) / 10; // 0.0 - 5.0

  return {
    vendorId: vendor.id,
    category: vendor.category,
    score,
    dots: Math.max(1, Math.round(score)),
    evidence: {
      mood: moodHits, feel: feelHits, look: lookHits, requirements: reqHits,
      avoid: avoidHits, fits, issues,
    },
    availability,
    estimate: est,
    allowance,
    needsConfirmation: [...new Set(needsConfirmation)],
  };
}

export function categoriesFor(event) {
  const used = new Set((event.dna?.requirements || []).map((r) => r.category));
  return CATEGORIES.filter((c) => used.has(c.key));
}

export function rankVendors(event, vendors, { perCategory = 4 } = {}) {
  const cats = categoriesFor(event);
  const result = {};
  for (const c of cats) {
    result[c.key] = vendors
      .filter((v) => v.category === c.key)
      .map((v) => scoreVendor(event, v))
      .sort((a, b) => b.score - a.score)
      .slice(0, perCategory);
  }
  return result;
}

// Template "why" when Claude isn't available.
export function templateWhy(match, vendor) {
  const e = match.evidence;
  const clientHits = [...e.look, ...e.mood, ...e.feel];
  // name the vendor's own style that meets the client's words, so each line is specific
  const own = [...(vendor.dna?.look || []), ...(vendor.dna?.mood || []), ...(vendor.dna?.feel || [])];
  const theirs = own.filter((t) => overlap(clientHits, [t]).length > 0).slice(0, 3);
  const bits = [];
  if (theirs.length) bits.push(`${theirs.join(", ")} fits “${clientHits.slice(0, 2).join(", ")}”`);
  if (e.fits.length) bits.push(e.fits.slice(0, 2).join(", "));
  let why = bits.length ? bits.join(" · ") : `Closest available ${vendor.category} option`;
  if (e.avoid.length) why += `. Leans ${e.avoid.join(", ")}, which the client wants to avoid`;
  if (e.issues.length) why += `. Watch: ${e.issues.join(", ")}`;
  return why;
}

// The same reason in plain Thai, for the customer site.
export function templateWhyTh(match, vendor) {
  const e = match.evidence;
  const clientHits = [...e.look, ...e.mood, ...e.feel];
  const own = [...(vendor.dna?.look || []), ...(vendor.dna?.mood || []), ...(vendor.dna?.feel || [])];
  const theirs = own.filter((t) => overlap(clientHits, [t]).length > 0).slice(0, 2);
  const bits = [];
  if (theirs.length) bits.push(`สไตล์${theirs.map(tagTh).join(" ")} ตรงกับที่อยากได้`);
  if (e.fits.length) bits.push(e.fits.slice(0, 2).map(fitTh).join(" · "));
  let why = bits.length ? bits.join(" · ") : "ร้านที่ใกล้เคียงที่สุดในหมวดนี้";
  if (e.avoid.length) why += ` · แต่ออกแนว${e.avoid.map(tagTh).join(", ")} ซึ่งคุณไม่อยากได้`;
  if (e.issues.length) why += ` · ข้อควรรู้: ${e.issues.map(fitTh).join(", ")}`;
  return why;
}
