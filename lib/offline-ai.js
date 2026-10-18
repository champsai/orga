// Offline engine: keyword rules that imitate what Claude does, so the demo runs
// with no API key or no internet. Claude replaces every function here when
// ANTHROPIC_API_KEY is set (see ai.js).

const TODAY = new Date();

const STYLE_LEXICON = [
  // [pattern, dimension, tag]
  [/elegan|หรูหรา|ดูแพง|มีรสนิยม|classy|sophisticat|tasteful/, "mood", "elegant"],
  [/romantic|โรแมนติก/, "mood", "romantic"],
  [/\bwarm\b|อบอุ่น/, "mood", "warm"],
  [/cozy|cosy/, "mood", "cozy"],
  [/playful|quirky/, "mood", "playful"],
  [/\bfun\b|สนุก/, "mood", "fun"],
  [/luxur|opulent/, "mood", "luxurious"],
  [/professional|polished/, "mood", "professional"],
  [/inspir/, "mood", "inspiring"],
  [/calm|serene|peaceful/, "mood", "calm"],
  [/ลึกลับ|mysterious|น่าค้นหา/, "mood", "mysterious"],
  [/joyful|happy/, "mood", "joyful"],
  [/formal|ทางการ|พิธีการ/, "mood", "formal"],
  [/personal|very ['‘’"]?us|เป็นกันเอง|ความเป็นเรา|เป็นตัวเรา/, "feel", "personal"],
  [/intimate/, "feel", "intimate"],
  [/energ|lively|party|dance|มันส์|มีชีวิตชีวา/, "feel", "lively"],
  [/relax|chill|laid.back|สบายๆ/, "feel", "relaxed"],
  [/social|mingle|networking/, "feel", "social"],
  [/immersive|โลกของ/, "feel", "immersive"],
  [/ว้าว|reveal|dramatic/, "feel", "dramatic"],
  [/spacious|enough space|room for|ไม่อึดอัด|มีพื้นที่/, "feel", "spacious"],
  [/memorable|special|unique|ไม่เหมือนใคร|เอกลักษณ์|น่าจดจำ|ไม่เหมือนงาน/, "feel", "memorable"],
  [/organi[sz]ed|on time|smooth/, "feel", "organised"],
  [/modern|contemporary|โมเดิร์น/, "look", "modern"],
  [/minimal|มินิมอล|เรียบ ?ๆ? ?แต่ดูแพง|understated/, "look", "minimal"],
  [/high.?fashion|ไฮแฟชั่น|แฟชั่นสูง|ความแฟชั่น|editorial/, "look", "high fashion"],
  [/garden|สวน/, "look", "garden"],
  [/rooftop|ดาดฟ้า/, "look", "rooftop"],
  [/rustic/, "look", "rustic"],
  [/boho/, "look", "boho"],
  [/beach|ทะเล|ชายหาด/, "look", "beach"],
  [/industrial|warehouse|loft/, "look", "industrial"],
  [/vintage|retro/, "look", "vintage"],
  [/y2k/, "look", "Y2K retro"],
  [/\btech\b|digital/, "look", "tech"],
  [/futur|ล้ำสมัย/, "look", "futuristic"],
  [/ไซไฟ|sci.?fi/, "look", "sci-fi"],
  [/floral|flower|ดอกไม้/, "look", "floral"],
  [/soft colou?r|pastel|muted/, "look", "soft muted palette"],
  [/\bgold\b|ทอง/, "look", "gold"],
  [/candle|warm light|fairy light|festoon/, "look", "warm lighting"],
  [/natural|organic|ธรรมชาติ/, "look", "natural"],
  [/classic|คลาสสิก/, "look", "classic"],
  [/traditional|ประเพณี/, "look", "traditional"],
  [/old.fashioned|outdated|dated|เชย/, "look", "old-fashioned"],
  [/over.the.top|too much|เยอะเกิน|จัดเต็ม|อลังการ/, "look", "over-the-top"],
  [/too simple|too plain|เรียบจน|ธรรมดาเกิน/, "look", "too simple"],
  [/stuffy|boring|นิ่ง/, "look", "stuffy"],
];

const NEGATORS = /\b(not|no|nothing|never|avoid|without|don'?t|isn'?t|less|definitely nothing)\b|ไม่|ไม่เอา/;

const REQ_TRIGGERS = [
  [/live band|\bband\b|วงดนตรี/, "entertainment", "Live band"],
  [/\bdj\b/, "entertainment", "DJ"],
  [/\bmc\b|host|พิธีกร/, "entertainment", "MC / host"],
  [/string|quartet|classical music/, "entertainment", "String quartet"],
  [/photo ?booth/, "experience", "Photo booth"],
  [/guest ?book|message (wall|station)/, "experience", "Guestbook / message station"],
  [/photograph|photos|ช่างภาพ|ถ่ายรูป/, "photography", "Event photography"],
  [/headshot/, "photography", "Headshot corner"],
  [/cocktail|\bbar\b|drinks|ค็อกเทล/, "catering", "Cocktail bar with signature drinks"],
  [/long table|shared table|sharing|family.style/, "catering", "Long shared table, sharing menu"],
  [/dinner|food|menu|buffet|อาหาร/, "catering", "Dinner service"],
  [/coffee|break/, "catering", "Coffee breaks"],
  [/lunch/, "catering", "Lunch"],
  [/\bled\b|screen|projector/, "av", "LED wall / screens"],
  [/stream|livestream|ไลฟ์/, "av", "Live stream"],
  [/sound|speaker|mic/, "av", "Sound system + mics"],
  [/shuttle|transport|\bbus\b|\bvan\b|รถรับส่ง/, "transport", "Guest shuttle"],
  [/flower|floral|ดอกไม้/, "decor", "Floral design"],
  [/lighting|candle|festoon|ไฟ/, "decor", "Warm lighting"],
  [/breakout|tracks?\b|workshop/, "venue", "Breakout rooms"],
];

// What ORCA reads between the lines: a phrase in the brief → a concrete suggestion.
// These are "interpreted" (not said outright) and keep the client's words as the source.
const INTERPRET = [
  [/intimate|อบอุ่น|cozy|garden|rooftop|ดาดฟ้า|สวน/, "venue", "Garden / rooftop / modern event space"],
  [/spacious|enough space|ไม่อึดอัด|มีพื้นที่|room to/, "venue", "Spacious seating, room to mingle"],
  [/enough space|มีพื้นที่|outdoor/, "venue", "Indoor + outdoor areas"],
  [/dinner|wedding|งานแต่ง|reception/, "catering", "Dinner reception"],
  [/elegan|หรูหรา|ดูแพง|มีรสนิยม|celebrat|energy|มีชีวิตชีวา/, "catering", "Cocktail bar + signature drinks"],
  [/mingle|social|พูดคุย|intimate|personal|เป็นกันเอง/, "catering", "Social dining setup"],
  [/energy|lively|มีชีวิตชีวา|สนุก|celebrat|dance/, "entertainment", "Live band / DJ"],
  [/สนุก|\bfun\b|interactive|engag|ทางการ|พิธีการ|formal/, "entertainment", "Interactive moments"],
  [/energy|มีชีวิตชีวา|นิ่ง|พิธีการ|formal/, "entertainment", "Entertaining MC"],
  [/memorable|special|unique|เอกลักษณ์|น่าจดจำ|ไม่เหมือน/, "experience", "Photo booth"],
  [/personal|very ['‘’"]?us|ความเป็นเรา|เป็นตัวเรา|เป็นกันเอง/, "experience", "Guestbook / message station"],
  [/very ['‘’"]?us|ความเป็นเรา|เป็นตัวเรา|personal/, "experience", "Personalized guest activities"],
  [/romantic|โรแมนติก/, "decor", "Modern romantic styling"],
  [/minimal|เรียบ ?ๆ? ?แต่ดูแพง|not too over|ไม่ต้องจัดเต็ม|อลังการ|understated/, "decor", "Minimal floral"],
  [/warm|อบอุ่น|candle/, "decor", "Warm lighting"],
  [/photo|รูป|memorable|น่าจดจำ|wedding|งานแต่ง/, "photography", "Candid photography"],
];

const TEMPLATES = {
  wedding: [
    ["catering", "Dinner reception"],
    ["entertainment", "Live band"],
    ["entertainment", "Entertaining MC"],
    ["decor", "Ceremony + reception decor"],
    ["photography", "Candid photography"],
    ["experience", "Photo booth"],
  ],
  conference: [
    ["av", "Stage, LED wall and sound"],
    ["catering", "Coffee breaks + lunch"],
    ["photography", "Event photography"],
    ["entertainment", "Bilingual MC"],
  ],
  birthday: [
    ["catering", "Dinner, sharing style"],
    ["decor", "Warm lighting"],
    ["experience", "Something interactive (photo booth?)"],
  ],
  launch: [
    ["av", "Stage, LED wall and sound"],
    ["catering", "Canapés + cocktail bar"],
    ["entertainment", "DJ"],
    ["photography", "Event photography"],
  ],
  event: [
    ["catering", "Food & drinks"],
    ["decor", "Decor"],
    ["entertainment", "Entertainment"],
  ],
};

const CITIES = [
  [/bangkok|bkk|กรุงเทพ/, "Bangkok"],
  [/chiang ?mai|เชียงใหม่/, "Chiang Mai"],
  [/phuket|ภูเก็ต/, "Phuket"],
  [/hua ?hin|หัวหิน/, "Hua Hin"],
  [/pattaya|พัทยา/, "Pattaya"],
  [/khao ?yai|เขาใหญ่/, "Khao Yai"],
  [/krabi|กระบี่/, "Krabi"],
  [/samui|สมุย/, "Koh Samui"],
];

const MONTHS = [
  ["jan", "ม.ค", "มกรา"], ["feb", "ก.พ", "กุมภา"], ["mar", "มี.ค", "มีนา"], ["apr", "เม.ย", "เมษา"],
  ["may", "พ.ค", "พฤษภา"], ["jun", "มิ.ย", "มิถุนา"], ["jul", "ก.ค", "กรกฎา"], ["aug", "ส.ค", "สิงหา"],
  ["sep", "ก.ย", "กันยา"], ["oct", "ต.ค", "ตุลา"], ["nov", "พ.ย", "พฤศจิกา"], ["dec", "ธ.ค", "ธันวา"],
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const chipWord = (t) => (!t ? null : t === "lively" ? "Energetic" : cap(t));
const uniq = (a) => [...new Set(a.filter(Boolean))];

function sentences(text) {
  return text.split(/(?<=[.!?。\n])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function quoteFor(text, re) {
  for (const s of sentences(text)) {
    const m = s.toLowerCase().match(re);
    if (m) {
      // trim to a readable fragment around the match
      const i = Math.max(0, m.index - 40);
      let frag = s.slice(i, m.index + m[0].length + 45).trim();
      if (i > 0) frag = "…" + frag;
      if (m.index + m[0].length + 45 < s.length) frag += "…";
      return frag;
    }
  }
  return null;
}

function isNegated(lower, index) {
  const before = lower.slice(Math.max(0, index - 32), index);
  // stop at a clause break so "not formal, but modern" doesn't negate "modern"
  // Thai has no commas: a space before Thai text starts a new clause
  // a space right before a Thai word also ends the clause ("ไม่อึดอัด มีพื้นที่" → "มีพื้นที่" is positive)
  const tail = /[฀-๿]/.test(lower[index] || "") ? "ก" : "";
  const clause = (before + tail).split(/[,.;!?]| but | yet |\s+(?=[฀-๿])/).pop();
  return NEGATORS.test(clause);
}

function parseGuests(lower) {
  const m = lower.match(/(\d{2,4})\s*(guests|pax|people|persons|attendees|คน|ท่าน)/);
  return m ? Number(m[1]) : null;
}

function parseBudget(lower) {
  const re = /(?:budget|งบ|around|about|approx\.?|ประมาณ)?\s*฿?\s*([\d][\d,.]*)\s*(k|m|mb|million|ล้าน|แสน|หมื่น)?\s*(baht|thb|บาท)?/g;
  let best = null;
  for (const m of lower.matchAll(re)) {
    const num = parseFloat(m[1].replace(/,/g, ""));
    if (!num) continue;
    const unit = m[2];
    const ctx = lower.slice(Math.max(0, m.index - 20), m.index + m[0].length + 6);
    const mentionsMoney = /budget|งบ|baht|thb|บาท|฿/.test(ctx) || unit;
    if (!mentionsMoney) continue;
    if (/guest|pax|people|คน/.test(lower.slice(m.index + m[0].length, m.index + m[0].length + 8))) continue;
    let v = num;
    if (unit === "k") v = num * 1000;
    else if (unit === "m" || unit === "mb" || unit === "million" || unit === "ล้าน") v = num * 1_000_000;
    else if (unit === "แสน") v = num * 100_000;
    else if (unit === "หมื่น") v = num * 10_000;
    if (v >= 10000) best = Math.round(v);
  }
  return best;
}

function parseDate(lower) {
  for (let mi = 0; mi < 12; mi++) {
    for (const name of MONTHS[mi]) {
      const esc = name.replace(/\./g, "\\.");
      const re1 = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s*)?${esc}[a-zก-๙.]*\\s*(\\d{4})?`);
      const re2 = new RegExp(`${esc}[a-z.]*\\s*(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?`);
      const m = lower.match(re1) || lower.match(re2);
      if (m) {
        const day = Number(m[1]);
        if (day < 1 || day > 31) continue;
        let year = m[2] ? Number(m[2]) : TODAY.getFullYear();
        if (year > 2500) year -= 543; // Thai Buddhist year
        const d = new Date(Date.UTC(year, mi, day));
        if (!m[2] && d < TODAY) d.setUTCFullYear(year + 1);
        return d.toISOString().slice(0, 10);
      }
    }
  }
  const iso = lower.match(/(20\d{2})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

function detectType(lower, fallback) {
  if (/wedding|แต่งงาน|งานแต่ง|bride|groom|couple/.test(lower)) return "wedding";
  if (/conference|summit|seminar|forum|keynote|สัมมนา/.test(lower)) return "conference";
  if (/birthday|วันเกิด|turning \d+|\b\d{2}th\b/.test(lower)) return "birthday";
  if (/launch|เปิดตัว/.test(lower)) return "launch";
  if (/gala|award|dinner party/.test(lower)) return "gala";
  return fallback || "event";
}

export function decode({ texts, previous }) {
  const text = texts.join("\n");
  const lower = text.toLowerCase();
  const latest = (texts[texts.length - 1] || "").toLowerCase();
  const prev = previous || null;
  const locked = new Set(prev?.locked || []);
  const rejected = (prev?.rejected || []).map((r) => r.toLowerCase());
  const isRejected = (t) => rejected.some((r) => t.toLowerCase().includes(r) || r.includes(t.toLowerCase()));

  const eventType = detectType(lower, prev?.eventType);

  // ---- style
  const style = { mood: [], feel: [], look: [], avoid: [] };
  for (const [re, dim, tag] of STYLE_LEXICON) {
    const g = new RegExp(re.source, "g");
    for (const m of lower.matchAll(g)) {
      if (isNegated(lower, m.index)) {
        const tooBefore = /too\s*$/.test(lower.slice(Math.max(0, m.index - 6), m.index));
        style.avoid.push(tooBefore && !tag.startsWith("too ") ? `too ${tag}` : tag);
      } else if (!["formal", "traditional", "old-fashioned", "over-the-top", "stuffy", "too simple"].includes(tag)) {
        style[dim].push(tag);
      }
    }
  }
  // the latest message wins: things negated now are pulled out of the positive lists
  const avoidRoots = style.avoid.map((a) => a.replace(/^too /, ""));
  for (const dim of ["mood", "feel", "look"]) {
    const prevTags = (prev?.style?.[dim] || []).filter((t) => {
      if (locked.has(`${dim}:${t}`)) return true;
      return !avoidRoots.includes(t);
    });
    style[dim] = uniq([...prevTags, ...style[dim]]).filter((t) => !avoidRoots.includes(t) || locked.has(`${dim}:${t}`)).filter((t) => !isRejected(t) || locked.has(`${dim}:${t}`));
  }
  style.avoid = uniq([...(prev?.style?.avoid || []), ...style.avoid]).filter((t) => !isRejected(t));

  // ---- basics (new info overrides)
  const basics = { ...(prev?.basics || { guests: null, date: null, location: null, budget: null, setting: null }) };
  const g = parseGuests(latest) ?? parseGuests(lower);
  if (g) basics.guests = g;
  const b = parseBudget(latest) ?? (basics.budget ? null : parseBudget(lower));
  if (b) basics.budget = b;
  const d = parseDate(latest) ?? (basics.date ? null : parseDate(lower));
  if (d) basics.date = d;
  for (const [re, city] of CITIES) if (re.test(latest) || (!basics.location && re.test(lower))) basics.location = city;
  const outdoor = /garden|outdoor|rooftop|beach|lawn|สวน|กลางแจ้ง/.test(lower);
  const indoor = /indoor|ballroom|hall|ในร่ม|hotel/.test(lower);
  if (outdoor && indoor) basics.setting = "indoor + outdoor";
  else if (outdoor) basics.setting = "outdoor";
  else if (indoor) basics.setting = "indoor";

  // ---- requirements
  let reqs = (prev?.requirements || []).map((r) => ({ ...r }));
  const removedByText = [];
  for (const [re, category, label] of REQ_TRIGGERS) {
    const g2 = new RegExp(re.source, "g");
    for (const m of latest.matchAll(g2)) {
      if (isNegated(latest, m.index)) removedByText.push(label.toLowerCase());
    }
  }
  const removedKey = (x) => (x.split(" ")[0] === "live" ? "band" : x.split(" ")[0]);
  reqs = reqs.filter((r) => locked.has(`req:${r.id}`) || (!removedByText.some((x) => r.text.toLowerCase().includes(removedKey(x))) && !isRejected(r.text)));
  // things the client just said no to stay out on every later decode
  const newlyRejected = removedByText.map((x) => REQ_TRIGGERS.find(([, , l]) => l.toLowerCase() === x)?.[2]).filter(Boolean);
  rejected.push(...newlyRejected.map((x) => x.toLowerCase()));
  // a new guest count rewrites the capacity line unless it is locked
  for (const r of reqs) {
    if (r.category === "venue" && /^\d+ (seated guests|attendees)/.test(r.text) && basics.guests && !locked.has(`req:${r.id}`)) {
      r.text = r.text.replace(/^\d+/, String(basics.guests));
    }
  }

  const has = (cat, label) => reqs.some((r) => r.category === cat && r.text.toLowerCase().includes(label.toLowerCase().split(" ")[0]));
  let n = reqs.reduce((mx, r) => Math.max(mx, Number(String(r.id).replace(/\D/g, "")) || 0), 0);
  const add = (r) => {
    if (isRejected(r.text) || has(r.category, r.text)) return;
    reqs.push({ id: `r${++n}`, ...r });
  };

  // venue first
  if (basics.guests && !reqs.some((r) => r.category === "venue" && /guest|seat|pax/.test(r.text))) {
    add({ category: "venue", text: `${basics.guests} ${eventType === "conference" ? "attendees" : "seated guests"}`, kind: "requirement", source: "client", quote: quoteFor(text, /\d{2,4}\s*(guests|pax|people|persons|attendees|คน|ท่าน)/) });
  }
  // read between the lines (event types where these suggestions make sense)
  if (["wedding", "birthday", "event", "gala"].includes(eventType)) {
    for (const [re, category, label] of INTERPRET) {
      const m = lower.match(re);
      if (m && !newlyRejected.includes(label)) add({ category, text: label, kind: "preference", source: "interpreted", quote: quoteFor(text, re) });
    }
  }
  const venueLooks = style.look.filter((l) => ["garden", "rooftop", "beach", "industrial", "rustic", "boho"].includes(l));
  if (venueLooks.length) add({ category: "venue", text: `${venueLooks.map(cap).join(" / ")} venue`, kind: "preference", source: "interpreted", quote: quoteFor(text, new RegExp(venueLooks.join("|"))) });
  else if (!reqs.some((r) => r.category === "venue" && !/guest|seat|attendee/.test(r.text))) add({ category: "venue", text: eventType === "conference" ? "Main hall with stage" : "Modern event space", kind: "preference", source: "suggested", quote: null });
  if (basics.setting === "indoor + outdoor") add({ category: "venue", text: "Indoor + outdoor areas", kind: "preference", source: "interpreted", quote: quoteFor(text, /space|outdoor|indoor/) });

  for (const [re, category, label] of REQ_TRIGGERS) {
    const m = lower.match(re);
    if (m && !isNegated(lower, m.index) && !newlyRejected.includes(label)) add({ category, text: label, kind: /must|need|ต้อง|required/.test(lower) ? "requirement" : "preference", source: "client", quote: quoteFor(text, re) });
  }
  // style-driven decor
  const decorLooks = style.look.filter((l) => ["minimal", "floral", "soft muted palette", "warm lighting", "modern", "gold", "natural"].includes(l));
  if (decorLooks.length && !reqs.some((r) => r.category === "decor")) {
    add({ category: "decor", text: decorLooks.slice(0, 3).map(cap).join(", "), kind: "preference", source: "interpreted", quote: quoteFor(text, new RegExp(decorLooks.map((x) => x.split(" ")[0]).join("|"))) });
  }
  for (const [category, label] of TEMPLATES[eventType] || TEMPLATES.event) {
    if (!reqs.some((r) => r.category === category)) add({ category, text: label, kind: "preference", source: "suggested", quote: null });
  }

  // ---- chips, summary, questions
  const chips = uniq([
    basics.guests ? `${basics.guests} PAX` : null,
    style.mood.length ? style.mood.slice(0, 2).map(cap).join(" · ") : null,
    style.feel[0] ? chipWord(style.feel[0]) : null,
    style.look[0] ? chipWord(style.look[0]) : null,
    chipWord(style.feel.find((f) => f === "lively") || style.feel[1]),
  ]).slice(0, 5);

  const openQuestions = [];
  if (!basics.date) openQuestions.push({ field: "date", question: "What is the event date?" });
  if (!basics.guests) openQuestions.push({ field: "guests", question: "Roughly how many guests?" });
  if (!basics.location) openQuestions.push({ field: "location", question: "Which city or area?" });
  if (!basics.budget) openQuestions.push({ field: "budget", question: "What is the total budget (THB)?" });

  const moodTxt = style.mood.slice(0, 3).join(", ") || "well-run";
  const avoidTxt = style.avoid.length ? ` Avoid: ${style.avoid.slice(0, 3).join(", ")}.` : "";
  const summary = `${/^[aeiou]/i.test(moodTxt) ? "An" : "A"} ${moodTxt} ${eventType}${basics.guests ? ` for about ${basics.guests} guests` : ""}${basics.location ? ` in ${basics.location}` : ""}${style.feel.length ? ` that feels ${style.feel.slice(0, 2).join(" and ")}` : ""}.${avoidTxt}`;

  return {
    summary, eventType, chips, basics, style,
    requirements: reqs,
    openQuestions,
    locked: [...locked],
    rejected: uniq([...(prev?.rejected || []), ...newlyRejected]),
  };
}

export function learnFromFeedback({ text }) {
  const lower = text.toLowerCase();
  const terms = [];
  const addAvoid = [];
  const addLook = [];
  const tooM = [...lower.matchAll(/too\s+([a-z-]+)/g)].map((m) => m[1]);
  for (const t of tooM) { terms.push({ term: t === "formal" ? "classic" : t, weight: -1 }); if (t === "formal") terms.push({ term: "formal", weight: -1 }); addAvoid.push(`too ${t}`); }
  const likeM = [...lower.matchAll(/(?:love|like|great|perfect|more)\s+(?:the\s+)?([a-z ]+?)(?:[!.,]|$| and )/g)].map((m) => m[1].trim());
  for (const t of likeM) {
    if (!t || t.length > 30) continue;
    const term = /colou?r/.test(t) ? "soft muted palette" : /light/.test(t) ? "warm lighting" : /band|music/.test(t) ? "lively" : t;
    terms.push({ term, weight: 1 });
    addLook.push(term);
  }
  if (/feels? more us|more 'us'|more us/.test(lower)) terms.push({ term: "personal", weight: 1 });
  const parts = [];
  const neg = terms.filter((t) => t.weight < 0).map((t) => t.term);
  const pos = terms.filter((t) => t.weight > 0).map((t) => t.term);
  if (neg.length) parts.push(`Reduces ${uniq(neg).join(", ")} styles`);
  if (pos.length) parts.push(`${uniq(pos).map(cap).join(", ")} ${pos.length > 1 ? "are keepers" : "is a keeper"}`);
  return {
    learned: parts.join(". ") || "Noted. No clear style signal in this reaction.",
    terms,
    addAvoid,
    addLook: addLook.filter((t) => t.split(" ").length <= 4),
  };
}

const thaiDate = (iso) => {
  if (!iso) return "(ยังไม่ระบุวัน)";
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()][1]}. ${d.getUTCFullYear()}`;
};

export function draftVendorMessage({ event, vendor, questions }) {
  const b = event.dna?.basics || {};
  const lines = [
    `สวัสดีครับ ${vendor.shopName}`,
    `ORCA ติดต่อแทนทีมจัดงาน "${event.name}" ครับ`,
    `วันที่ ${thaiDate(b.date)} · ${b.location || "กรุงเทพฯ"} · ผู้ร่วมงาน ${b.guests || "-"} คน`,
    `สไตล์งาน: ${(event.dna?.style?.mood || []).slice(0, 3).join(", ")}`,
    "",
    "รบกวนสอบถามดังนี้ครับ",
    ...questions.map((q, i) => `${i + 1}) ${q}`),
    "",
    "ตอบกลับในหน้านี้ได้เลยครับ ขอบคุณมากครับ",
  ];
  return { text: lines.join("\n") };
}

export function parseVendorReply({ text }) {
  const lower = text.toLowerCase();
  let available = null;
  if (/ไม่ว่าง|not available|unavailable|fully booked|booked|เต็ม/.test(lower)) available = false;
  else if (/ว่าง|available|yes|free|ได้ครับ|ได้ค่ะ|ok/.test(lower)) available = true;
  let price = null;
  const nums = [...lower.matchAll(/([\d][\d,.]*)\s*(k|บาท|baht|thb)?/g)]
    .map((m) => {
      let v = parseFloat(m[1].replace(/,/g, ""));
      if (m[2] === "k") v *= 1000;
      return v;
    })
    .filter((v) => v >= 1000);
  if (nums.length) price = /รวม|total/.test(lower) ? Math.max(...nums) : nums[nums.length - 1];
  const excl = text.match(/(ไม่รวม[^.\n]*|exclud[^.\n]*)/i);
  const valid = text.match(/(valid[^.\n]*|ยืนราคา[^.\n]*|\d+\s*วัน)/i);
  return {
    available,
    price,
    notes: [excl?.[0], valid && !(excl?.[0] || "").includes(valid[0]) ? valid[0] : null].filter(Boolean).join(". "),
  };
}

export function explainMatches({ ranked, vendorsById, templateWhy }) {
  const why = {};
  for (const list of Object.values(ranked)) {
    for (const m of list) why[m.vendorId] = templateWhy(m, vendorsById[m.vendorId]);
  }
  const tops = Object.values(ranked).map((l) => l[0]).filter(Boolean);
  const looks = tops.flatMap((m) => m.evidence.look);
  const shared = uniq(looks.filter((l, i) => looks.indexOf(l) !== i));
  const setNote = shared.length
    ? `The top picks share a ${shared.slice(0, 3).join(", ")} look, so venue, decor and the rest read as one story.`
    : tops.length > 1
      ? "Top picks fit the brief individually; check that their styles sit well together before proposing."
      : "";
  return { why, setNote };
}

// Spans of the client's text that ORCA used, for highlighting the brief (engine-independent).
export function highlights(text) {
  const lower = text.toLowerCase();
  const res = [...STYLE_LEXICON.map((x) => x[0]), ...REQ_TRIGGERS.map((x) => x[0]), ...INTERPRET.map((x) => x[0]), /\d{2,4}\s*(guests|pax|people|คน|ท่าน)/];
  const spans = [];
  for (const re of res) for (const m of lower.matchAll(new RegExp(re.source, "g"))) {
    if (!m[0].trim()) continue;
    let a = m.index; let b = m.index + m[0].length;
    // pull a negation into the highlight ("ไม่อยากให้เป็นทางการ", "not too formal")
    const neg = lower.slice(Math.max(0, a - 22), a).match(/(ไม่(?:อยาก(?:ให้)?|ต้อง|ได้)?(?:ดู|เป็น)?|not (?:in a way that feels )?(?:too )?|nothing (?:too )?|no )\s*$/);
    if (neg) a -= neg[0].length;
    // finish the word (Thai has no spaces inside words)
    while (b < text.length && /[\u0E00-\u0E7Fa-z]/i.test(text[b]) && b - a < 40) b++;
    spans.push([a, b]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const sp of spans) { const last = out[out.length - 1]; if (last && sp[0] <= last[1] + 1) last[1] = Math.max(last[1], sp[1]); else out.push([...sp]); }
  return out;
}

// The client's own phrase around a match, with its negation ("ไม่ต้องจัดเต็มหรืออลังการเกินไป").
// Thai clauses are separated by spaces, so the phrase runs from space to space.
function phraseAt(text, index, length) {
  const lower = text.toLowerCase();
  let a = index; let b = index + length;
  const neg = lower.slice(Math.max(0, a - 24), a).match(/(ไม่(?:อยาก(?:ให้)?|ต้อง|ได้|เอา)?(?:ดู|เป็น)?|not (?:in a way that feels )?(?:too )?|nothing (?:too )?|no )\s*$/);
  if (neg) a -= neg[0].length;
  while (a > 0 && !/[\s,.;!?]/.test(text[a - 1])) a--;
  while (b < text.length && !/[\s,.;!?]/.test(text[b])) b++;
  // a phrase ending on a joining word reads better with the next chunk ("…หรือดู traditional จนเกินไปค่ะ"),
  // and a lone word reads better with the one before it ("ดูหรูหรา โรแมนติก")
  const chunk = (from, dir) => {
    const at = (i) => text[dir < 0 ? i - 1 : i];
    let i = from;
    while (i > 0 && i < text.length && /[ \t]/.test(at(i))) i += dir;
    while (i > 0 && i < text.length && !/[\s,.;!?]/.test(at(i))) i += dir;
    return i;
  };
  for (let k = 0; k < 2 && /(ดู|หรือ|และ|เป็น|ให้|แต่|or|and|too)$/i.test(text.slice(a, b).trim()); k++) b = chunk(b, 1);
  if (b - a < 14) a = chunk(a, -1);
  return text.slice(a, b).trim().replace(/^(แต่ก็|แต่|และ|ก็|but|and)\s*/i, "");
}

// Style words in one message: [{ tag, dim, negated, phrase }]. Used to catch a change that goes
// against what the client said earlier.
export function styleMentions(text) {
  const lower = text.toLowerCase();
  const out = [];
  for (const [re, dim, tag] of STYLE_LEXICON) {
    const m = lower.match(re);
    if (m && !out.some((x) => x.tag === tag)) out.push({ tag, dim, negated: isNegated(lower, m.index), phrase: phraseAt(text, m.index, m[0].length) });
  }
  return out;
}

// Where the client talked about a style word before (latest first), in their own words.
export function saidAbout(texts, tag) {
  const entry = STYLE_LEXICON.find((x) => x[2] === tag);
  if (!entry) return null;
  for (const t of [...texts].reverse()) {
    const m = t.toLowerCase().match(entry[0]);
    if (m) return { phrase: phraseAt(t, m.index, m[0].length), negated: isNegated(t.toLowerCase(), m.index) };
  }
  return null;
}
