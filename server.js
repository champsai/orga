import express from "express";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { store, save, reset, newId, now, logActivity, DATA_DIR } from "./lib/store.js";
import ASSET_LIST from "./lib/assets.json" with { type: "json" };
import { rankVendors, CATEGORIES, categoryBudget } from "./lib/matching.js";
import * as ai from "./lib/ai.js";
import * as concierge from "./lib/concierge.js";
import * as selfserve from "./lib/selfserve.js";
import { SHOWCASE, SHOWCASE_GROUPS, SHOWCASE_GROUPS_TH, showcaseSummary } from "./lib/showcase.js";
import { ensurePlan, pushVersion, previewImpact, applyPatch, changeView, changeDiffs, suggestFollowUps, runSheetCSV, clientView } from "./lib/planning.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const UPLOADS = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOADS, { recursive: true });

// Photos in public/: read the folder when it is there (local), otherwise the list written at build
// time (on Vercel public/ lives on the CDN, outside this function). See scripts/asset-manifest.js.
const hasAsset = (dir, file) => (fs.existsSync(path.resolve("public", dir)) ? fs.existsSync(path.resolve("public", dir, file)) : (ASSET_LIST[dir] || []).includes(file));

app.use(express.json({ limit: "15mb" }));
app.use(express.static("public"));
// uploaded files (express.static is not used on Vercel, so serve them by hand)
app.get("/uploads/:file", (req, res) => {
  const file = path.join(UPLOADS, path.basename(req.params.file));
  if (fs.existsSync(file)) res.sendFile(file); else res.status(404).end();
});

// Vendor photos: drop public/vendors/<vendorId>-1.jpg (-2, -3) and they replace the mood-board
// tiles in that shop's portfolio. Checked at most every few seconds.
let photoCheckedAt = 0;
function syncVendorPhotos() {
  if (Date.now() - photoCheckedAt < 3000) return;
  photoCheckedAt = Date.now();
  for (const v of store.vendors()) (v.portfolio || []).forEach((p, i) => {
    if (p.url && !p.url.startsWith("/vendors/")) return; // the shop's own upload wins
    const ext = ["jpg", "jpeg", "png", "webp"].find((x) => hasAsset("vendors", `${v.id}-${i + 1}.${x}`));
    if (ext) p.url = `/vendors/${v.id}-${i + 1}.${ext}`;
    else if (p.url) delete p.url;
  });
}
app.use("/api", (_req, _res, next) => { syncVendorPhotos(); next(); });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.-]/g, "_")}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

// Planning documents: briefs, quotes, contracts, floor plans, invoices, images.
const docUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.-]/g, "_")}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^(image\/|text\/|application\/(pdf|msword|vnd\.|zip|octet-stream))/.test(file.mimetype)),
});

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Something went wrong" });
  });

const notFound = (res, what) => res.status(404).json({ error: `${what} not found` });

// ---------------------------------------------------------------- helpers

function eventSummary(e) {
  const threads = store.threads().filter((t) => t.eventId === e.id);
  const drafts = threads.flatMap((t) => t.messages.filter((m) => m.from === "orca" && m.status === "awaiting_approval"));
  const approvals = e.approvals || [];
  const decisions = (e.quotes || []).filter((q) => q.status === "quoted").length + drafts.length +
    approvals.filter((a) => a.status === "revision").length + (e.changes || []).filter((c) => c.status === "open").length;
  const waiting = threads.filter((t) => t.status === "awaiting").length + approvals.filter((a) => a.status === "pending" && a.sharedWithClient).length;
  const openQ = e.dna?.openQuestions?.length || 0;
  const daysLeft = e.date ? Math.ceil((new Date(e.date) - Date.now()) / 86400000) : null;
  return {
    id: e.id, name: e.name, client: e.client, type: e.type, date: e.date, location: e.location,
    guests: e.guests, budget: e.budget, stage: e.stage, status: e.status, team: e.team,
    briefVersion: e.briefVersions?.length || 1, chips: e.dna?.chips || [],
    outstanding: { decisions, waiting, openQuestions: openQ },
    selfServe: Boolean(e.selfServe),
    needsAttention: e.status !== "completed" && (decisions > 0 || openQ > 0 || (daysLeft !== null && daysLeft < 45 && !e.selected?.venue)),
    daysLeft,
  };
}

function eventDetail(e) {
  ensurePlan(e);
  const threads = store.threads().filter((t) => t.eventId === e.id);
  const vendorsById = Object.fromEntries(store.vendors().map((v) => [v.id, v]));
  const quotes = (e.quotes || []).map((q) => ({ ...q, total: q.qty * q.unitPrice, vendorName: vendorsById[q.vendorId]?.shopName }));
  const allowances = Object.fromEntries(CATEGORIES.map((c) => [c.key, categoryBudget(e, c.key)]));
  return { ...e, summary: eventSummary(e), threads: threads.map((t) => threadView(t)), quotes, allowances };
}

function threadView(t) {
  const v = store.vendor(t.vendorId);
  const e = store.event(t.eventId);
  return { ...t, vendorName: v?.shopName, vendorCategory: v?.category, eventName: e?.name || null };
}

// ---------------------------------------------------------------- status

app.get("/api/status", (_req, res) => res.json(ai.aiStatus()));

app.post("/api/reset", (_req, res) => {
  reset();
  res.json({ ok: true });
});

// ---------------------------------------------------------------- events

app.get("/api/events", (_req, res) => res.json(store.events().map(eventSummary)));

app.get("/api/events/:id", (req, res) => {
  const e = store.event(req.params.id);
  if (!e) return notFound(res, "Event");
  res.json(eventDetail(e));
});

app.post("/api/decode", wrap(async (req, res) => {
  const { texts, previous } = req.body;
  if (!Array.isArray(texts) || !texts.some((t) => t?.trim())) return res.status(400).json({ error: "Type or paste what the client wants first." });
  const dna = await ai.decode({ texts: texts.filter((t) => t?.trim()), previous });
  res.json(dna);
}));

app.post("/api/events", (req, res) => {
  const { name, client, texts = [], dna, team = [], references = [] } = req.body;
  if (!dna) return res.status(400).json({ error: "Decode the brief before creating the event." });
  const { _ai, _aiError, ...cleanDna } = dna;
  const b = cleanDna.basics || {};
  const e = {
    id: newId("e"),
    name: name?.trim() || `${cleanDna.eventType ? cleanDna.eventType[0].toUpperCase() + cleanDna.eventType.slice(1) : "New event"} for ${client || "client"}`,
    client: client?.trim() || "Client",
    type: cleanDna.eventType || "event",
    date: b.date, location: b.location, guests: b.guests, budget: b.budget,
    stage: "Briefing", status: "active", team,
    createdAt: now(),
    input: texts.join("\n\n"),
    texts,
    dna: cleanDna,
    briefVersions: [{ v: 1, at: now(), note: "Created from client brief", dna: structuredClone(cleanDna) }],
    feedback: [], selected: {}, shortlist: {}, quotes: [], activity: [], references,
  };
  ensurePlan(e);
  logActivity(e, "Event created. Brief v1 decoded into Event DNA.");
  store.events().unshift(e);
  save();
  res.json(eventDetail(e));
});

app.patch("/api/events/:id", (req, res) => {
  const e = store.event(req.params.id);
  if (!e) return notFound(res, "Event");
  for (const k of ["name", "client", "stage", "status", "team", "references"]) if (k in req.body) e[k] = req.body[k];
  save();
  res.json(eventDetail(e));
});

// Re-decode with a new client message (keeps locked items, drops rejected)
app.post("/api/events/:id/refine", wrap(async (req, res) => {
  const e = store.event(req.params.id);
  if (!e) return notFound(res, "Event");
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "Type what changed first." });
  e.texts ??= e.input ? [e.input] : [];
  e.texts.push(text.trim());
  const dna = await ai.decode({ texts: e.texts, previous: e.dna });
  const { _ai, _aiError, ...clean } = dna;
  clean.learned = e.dna?.learned || [];
  e.dna = clean;
  pushVersion(e, `Refined: "${text.trim().slice(0, 80)}"`);
  logActivity(e, `Brief updated to v${e.briefVersions.length} from a new client message.`);
  save();
  res.json({ event: eventDetail(e), ai: _ai, aiError: _aiError });
}));

// Manual DNA edits: lock, reject, edit text, change basics
app.put("/api/events/:id/dna", (req, res) => {
  const e = store.event(req.params.id);
  if (!e) return notFound(res, "Event");
  const { dna, note } = req.body;
  if (!dna) return res.status(400).json({ error: "Missing DNA" });
  e.dna = { ...dna, learned: dna.learned || e.dna?.learned || [] };
  pushVersion(e, note || "Edited by organizer");
  logActivity(e, note || "Brief edited.", "Organizer");
  save();
  res.json(eventDetail(e));
});

// What changes if the brief changes? Compare current vs proposed ranking.
app.post("/api/events/:id/preview-impact", (req, res) => {
  const e = store.event(req.params.id);
  if (!e) return notFound(res, "Event");
  res.json(previewImpact(e, req.body.dna));
});

// ---------------------------------------------------------------- matching

app.get("/api/events/:id/matches", wrap(async (req, res) => {
  const e = store.event(req.params.id);
  if (!e) return notFound(res, "Event");
  const vendors = store.vendors();
  const vendorsById = Object.fromEntries(vendors.map((v) => [v.id, v]));
  const ranked = rankVendors(e, vendors, { perCategory: 20 });
  const key = JSON.stringify([e.dna, vendors.length, vendors.map((v) => v.lastConfirmed).join()]);
  let explained = e.matchCache?.key === key ? e.matchCache.value : null;
  if (!explained || req.query.refresh) {
    explained = await ai.explainMatches({ event: e, ranked, vendorsById });
    e.matchCache = { key, value: explained };
    save();
  }
  const out = {};
  for (const [cat, list] of Object.entries(ranked)) {
    out[cat] = list.map((m) => ({ ...m, why: explained.why?.[m.vendorId] || "", vendor: vendorsById[m.vendorId] }));
  }
  res.json({ categories: out, setNote: explained.setNote, ai: explained._ai, aiError: explained._aiError });
}));

// Client reaction → ORCA learns → DNA updates → re-rank
app.post("/api/events/:id/feedback", wrap(async (req, res) => {
  const e = store.event(req.params.id);
  if (!e) return notFound(res, "Event");
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "Type the client's reaction first." });
  const out = await ai.learnFromFeedback({ event: e, text });
  const dna = structuredClone(e.dna);
  dna.learned = [...(dna.learned || []), ...out.terms];
  dna.style.avoid = [...new Set([...(dna.style.avoid || []), ...out.addAvoid])];
  dna.style.look = [...new Set([...(dna.style.look || []), ...out.addLook])];
  e.dna = dna;
  e.feedback ??= [];
  e.feedback.push({ at: now(), text, learned: out.learned });
  pushVersion(e, `Client reaction: "${text.slice(0, 60)}"`);
  logActivity(e, `ORCA learned: ${out.learned}`);
  save();
  res.json({ learned: out.learned, ai: out._ai, event: eventDetail(e) });
}));

app.post("/api/events/:id/shortlist", (req, res) => {
  const e = store.event(req.params.id);
  const v = store.vendor(req.body.vendorId);
  if (!e || !v) return notFound(res, "Event or vendor");
  e.shortlist ??= {};
  const list = new Set(e.shortlist[v.category] || []);
  req.body.on === false ? list.delete(v.id) : list.add(v.id);
  e.shortlist[v.category] = [...list];
  save();
  res.json(eventDetail(e));
});

app.post("/api/events/:id/select", (req, res) => {
  const e = store.event(req.params.id);
  const v = store.vendor(req.body.vendorId);
  if (!e || !v) return notFound(res, "Event or vendor");
  e.selected ??= {};
  if (req.body.on === false) {
    delete e.selected[v.category];
    e.quotes = (e.quotes || []).filter((q) => !(q.vendorId === v.id && q.status === "estimate"));
  } else {
    e.selected[v.category] = v.id;
    if (!(e.quotes || []).some((q) => q.vendorId === v.id)) {
      const pkg = v.packages?.[0];
      const perGuest = (pkg?.unit || v.priceUnit) === "per guest";
      e.quotes.push({
        id: newId("q"), vendorId: v.id, category: v.category,
        item: pkg?.name || v.shopName, qty: perGuest ? e.guests || 1 : 1,
        unitPrice: pkg?.price ?? v.priceFrom ?? 0, status: "estimate",
        needsConfirmation: [...(v.missing || []), ...(v.availability?.[e.date] ? [] : [`Availability on ${e.date}`])],
      });
    }
    logActivity(e, `${v.shopName} added to the event package.`, "Organizer");
  }
  if (e.stage === "Briefing") e.stage = "Sourcing";
  save();
  res.json(eventDetail(e));
});

app.patch("/api/events/:id/quotes/:qid", (req, res) => {
  const e = store.event(req.params.id);
  const q = e?.quotes?.find((x) => x.id === req.params.qid);
  if (!q) return notFound(res, "Quote");
  for (const k of ["status", "qty", "unitPrice", "item"]) if (k in req.body) q[k] = req.body[k];
  if (req.body.status === "committed") logActivity(e, `Quote approved: ${store.vendor(q.vendorId)?.shopName}.`, "Organizer");
  save();
  res.json(eventDetail(e));
});

// ---------------------------------------------------------------- conversations

// AI drafts a question to a vendor. Nothing is sent until the organizer approves.
app.post("/api/events/:id/ask", wrap(async (req, res) => {
  const e = store.event(req.params.id);
  const v = store.vendor(req.body.vendorId);
  if (!e || !v) return notFound(res, "Event or vendor");
  const questions = (req.body.questions || []).filter(Boolean);
  if (!questions.length) questions.push(`ว่างวันที่ ${e.date} ไหม`, "ราคารวมสำหรับงานนี้ และสิ่งที่ไม่รวมในราคา");
  const { thread } = await draftQuestion(e, v, questions, req.body.topic);
  save();
  res.json(threadView(thread));
}));

// Shared by "Request quote" and change follow-ups: always a draft that waits for approval.
async function draftQuestion(e, v, questions, topic) {
  const draft = await ai.draftVendorMessage({ event: e, vendor: v, questions });
  let t = store.threads().find((x) => x.eventId === e.id && x.vendorId === v.id);
  if (!t) {
    t = { id: newId("t"), eventId: e.id, vendorId: v.id, channel: "ORCA", topic: topic || `Enquiry: ${e.name}`, status: "draft", messages: [] };
    store.threads().unshift(t);
  }
  t.questions = questions;
  const message = { id: newId("m"), from: "orca", status: "awaiting_approval", at: now(), text: draft.text, ai: draft._ai };
  t.messages.push(message);
  if (t.status !== "awaiting") t.status = "draft";
  logActivity(e, `Drafted a question to ${v.shopName}. Waiting for your approval.`);
  return { thread: t, message };
}

app.get("/api/threads", (req, res) => {
  let list = store.threads();
  if (req.query.eventId) list = list.filter((t) => t.eventId === req.query.eventId);
  if (req.query.vendorId) list = list.filter((t) => t.vendorId === req.query.vendorId);
  res.json(list.map(threadView));
});

app.patch("/api/threads/:id", (req, res) => {
  const t = store.thread(req.params.id);
  if (!t) return notFound(res, "Conversation");
  if ("eventId" in req.body) t.eventId = req.body.eventId;
  save();
  res.json(threadView(t));
});

app.patch("/api/threads/:id/messages/:mid", (req, res) => {
  const t = store.thread(req.params.id);
  const m = t?.messages.find((x) => x.id === req.params.mid);
  if (!m) return notFound(res, "Message");
  if (m.status === "sent") return res.status(409).json({ error: "This message was already sent and can't be edited." });
  if ("text" in req.body) m.text = req.body.text;
  if (req.body.action === "approve") m.status = "approved";
  if (req.body.action === "send") {
    m.status = "sent";
    m.at = now();
    t.status = "awaiting";
    const e = store.event(t.eventId);
    if (e) logActivity(e, `Sent to ${store.vendor(t.vendorId)?.shopName}. Waiting for a reply.`, "Organizer");
  }
  if (req.body.action === "discard") t.messages = t.messages.filter((x) => x.id !== m.id);
  save();
  res.json(threadView(t));
});

// A reply arrives: from the vendor portal (structured) or pasted from LINE (free text)
app.post("/api/threads/:id/reply", wrap(async (req, res) => {
  const t = store.thread(req.params.id);
  if (!t) return notFound(res, "Conversation");
  const v = store.vendor(t.vendorId);
  const e = store.event(t.eventId);
  const { text = "", structured, via = "portal" } = req.body;
  let parsed;
  if (structured) {
    const items = (structured.items || []).filter((i) => i.name && Number(i.unitPrice) > 0);
    parsed = {
      available: structured.available === "yes" ? true : structured.available === "no" ? false : null,
      price: items.reduce((s, i) => s + Number(i.unitPrice) * (Number(i.qty) || 1), 0) || null,
      items,
      includes: structured.includes || "",
      excludes: structured.excludes || "",
      validUntil: structured.validUntil || "",
      terms: structured.terms || "",
      notes: [structured.excludes && `Excludes: ${structured.excludes}`, structured.validUntil && `Valid until ${structured.validUntil}`, structured.terms].filter(Boolean).join(". "),
    };
  } else {
    if (!text.trim()) return res.status(400).json({ error: "The reply is empty." });
    parsed = await ai.parseVendorReply({ text, questions: t.questions });
  }
  t.messages.push({ id: newId("m"), from: "vendor", via, at: now(), text: text || summarizeStructured(parsed), parsed });
  t.status = "replied";

  // What ORCA learns about the vendor
  if (v && e?.date && parsed.available !== null && parsed.available !== undefined) {
    v.availability ??= {};
    v.availability[e.date] = parsed.available ? "available" : "booked";
    v.missing = (v.missing || []).filter((m) => !/availab/i.test(m));
  }
  if (v) v.lastConfirmed = now().slice(0, 10);
  if (e && v) {
    const existing = e.quotes.find((q) => q.vendorId === v.id);
    if (parsed.price) {
      const q = existing || { id: newId("q"), vendorId: v.id, category: v.category, qty: 1 };
      Object.assign(q, {
        item: parsed.items?.length ? parsed.items.map((i) => i.name).join(" + ") : `Quote from ${v.shopName}`,
        qty: 1, unitPrice: parsed.price, status: "quoted", threadId: t.id,
        includes: parsed.includes, excludes: parsed.excludes, validUntil: parsed.validUntil, terms: parsed.terms, notes: parsed.notes,
        needsConfirmation: parsed.available === null ? ["Availability not confirmed"] : [],
      });
      if (!existing) e.quotes.push(q);
    }
    if (e.stage === "Sourcing" || e.stage === "Briefing") e.stage = "Quoting";
    logActivity(e, `${v.shopName} replied${parsed.price ? ` with a quote: ${parsed.price.toLocaleString()} THB` : ""}${parsed.available === false ? " (not available)" : ""}.`, v.shopName);
  }
  save();
  res.json(threadView(t));
}));

function summarizeStructured(p) {
  const parts = [];
  if (p.available === true) parts.push("Available on the date.");
  if (p.available === false) parts.push("Not available on the date.");
  if (p.items?.length) parts.push(p.items.map((i) => `${i.name}: ${Number(i.unitPrice).toLocaleString()} x ${i.qty || 1}`).join("; "));
  if (p.price) parts.push(`Total ${p.price.toLocaleString()} THB.`);
  if (p.notes) parts.push(p.notes);
  return parts.join(" ");
}

// ---------------------------------------------------------------- vendors

app.get("/api/vendors", (_req, res) => res.json(store.vendors()));

app.get("/api/vendors/:id", (req, res) => {
  const v = store.vendor(req.params.id);
  if (!v) return notFound(res, "Vendor");
  const history = store.events()
    .filter((e) => Object.values(e.selected || {}).includes(v.id))
    .map((e) => ({ id: e.id, name: e.name, date: e.date, status: e.status }));
  res.json({ ...v, history, threads: store.threads().filter((t) => t.vendorId === v.id).map(threadView) });
});

const VENDOR_FIELDS = ["shopName", "category", "location", "area", "description", "capacity", "setting", "priceUnit", "priceFrom", "priceTo", "packages", "dna", "tags", "palette", "contact", "serviceArea", "portfolio", "availability", "missing"];

app.post("/api/vendors", (req, res) => {
  const body = req.body || {};
  if (!body.shopName?.trim() || !body.category) return res.status(400).json({ error: "Shop name and category are required." });
  const v = {
    id: newId("v"), verified: false, rating: null, eventsDone: 0, responseTime: "new shop",
    joinedAt: now(), lastConfirmed: now().slice(0, 10), availability: {}, missing: [], portfolio: [],
    palette: ["#f5f5f7", "#d2d2d7", "#7a7a7a", "#1d1d1f"], serviceArea: [body.location || "Bangkok"],
    dna: { mood: [], feel: [], look: [] }, tags: [], packages: [],
  };
  for (const k of VENDOR_FIELDS) if (k in body) v[k] = body[k];
  if (v.priceFrom == null) v.missing.push("Price");
  store.vendors().push(v);
  save();
  res.json(v);
});

app.patch("/api/vendors/:id", (req, res) => {
  const v = store.vendor(req.params.id);
  if (!v) return notFound(res, "Vendor");
  for (const k of VENDOR_FIELDS) if (k in req.body) v[k] = req.body[k];
  v.lastConfirmed = now().slice(0, 10);
  save();
  res.json(v);
});

app.post("/api/vendors/:id/portfolio", upload.single("image"), (req, res) => {
  const v = store.vendor(req.params.id);
  if (!v) return notFound(res, "Vendor");
  if (!req.file) return res.status(400).json({ error: "Choose a JPG, PNG or WebP image under 8 MB." });
  v.portfolio ??= [];
  v.portfolio.unshift({ title: req.body.title || "Portfolio photo", url: `/uploads/${req.file.filename}` });
  save();
  res.json(v);
});

// What a vendor sees: only enquiries actually sent to them, and only the parts
// of the brief relevant to their service. Internal notes, budget and other
// vendors' conversations stay out.
app.get("/api/vendor-portal/:vendorId/enquiries", (req, res) => {
  const v = store.vendor(req.params.vendorId);
  if (!v) return notFound(res, "Vendor");
  const out = store.threads()
    .filter((t) => t.vendorId === v.id && !store.event(t.eventId)?.selfServe && t.messages.some((m) => m.from === "orca" && m.status === "sent"))
    .map((t) => {
      const e = store.event(t.eventId);
      const firstSent = t.messages.find((m) => m.from === "orca" && m.status === "sent");
      const deadline = new Date(new Date(firstSent.at).getTime() + 2 * 86400000).toISOString();
      const quote = e?.quotes?.find((q) => q.vendorId === v.id);
      const selected = e?.selected?.[v.category] === v.id;
      let stage = "Reply needed";
      if (t.status === "replied") stage = selected ? (quote?.status === "committed" || quote?.status === "paid" ? "Confirmed" : "Confirmation pending") : "Selection pending";
      if (t.status === "replied" && t.messages[t.messages.length - 1].from === "orca") stage = "Clarification requested";
      return {
        id: t.id, topic: t.topic, status: t.status, stage, deadline,
        messages: t.messages.filter((m) => m.from === "vendor" || m.status === "sent").map(({ id, from, at, text, parsed }) => ({ id, from, at, text, parsed })),
        event: e ? {
          name: e.name, date: e.date, location: e.location, guests: e.guests, type: e.type,
          style: { mood: e.dna?.style?.mood || [], feel: e.dna?.style?.feel || [], look: e.dna?.style?.look || [], avoid: e.dna?.style?.avoid || [] },
          requirements: (e.dna?.requirements || []).filter((r) => r.category === v.category).map((r) => ({ text: r.text, kind: r.kind })),
          references: (e.references || []).filter((r) => r.reaction === "like").map((r) => ({ url: r.url, comment: r.comment })),
          files: (e.files || []).filter((f) => f.visibility?.vendors?.includes(v.id)).map((f) => ({ id: f.id, name: f.name, group: f.group, version: f.version, url: f.url || null })),
        } : null,
      };
    });
  res.json(out);
});

// ---------------------------------------------------------------- planning: tasks, timeline, run sheet

const planEvent = (req, res) => {
  const e = store.event(req.params.id);
  if (!e) { notFound(res, "Event"); return null; }
  return ensurePlan(e);
};
const who = (req) => String(req.body?.who || "Organizer").slice(0, 60);
const TASK_FIELDS = ["title", "owner", "due", "status", "dependsOn", "vendorId", "fileId", "notes"];

app.post("/api/events/:id/tasks", (req, res) => {
  const e = planEvent(req, res); if (!e) return;
  if (!req.body.title?.trim()) return res.status(400).json({ error: "Give the task a title." });
  const t = { id: newId("k"), status: "todo", dependsOn: [] };
  for (const k of TASK_FIELDS) if (k in req.body) t[k] = req.body[k];
  t.title = t.title.trim();
  e.tasks.push(t);
  logActivity(e, `Task added: ${t.title}`, who(req));
  save();
  res.json(eventDetail(e));
});

app.patch("/api/events/:id/tasks/:tid", (req, res) => {
  const e = planEvent(req, res); if (!e) return;
  const t = e.tasks.find((x) => x.id === req.params.tid);
  if (!t) return notFound(res, "Task");
  for (const k of TASK_FIELDS) if (k in req.body) t[k] = req.body[k];
  if (req.body.status === "done") logActivity(e, `Task done: ${t.title}`, who(req));
  save();
  res.json(eventDetail(e));
});

const RS_FIELDS = ["time", "activity", "responsible", "vendorId", "arrival", "contact", "notes", "status"];
const touchRunSheet = (e, req) => { e.runSheet.updatedAt = now(); e.runSheet.updatedBy = who(req); };

app.post("/api/events/:id/runsheet/items", (req, res) => {
  const e = planEvent(req, res); if (!e) return;
  if (!req.body.time || !req.body.activity?.trim()) return res.status(400).json({ error: "A run sheet line needs a time and an activity." });
  const r = { id: newId("rs"), status: "pending" };
  for (const k of RS_FIELDS) if (k in req.body) r[k] = req.body[k];
  e.runSheet.items.push(r);
  touchRunSheet(e, req);
  save();
  res.json(eventDetail(e));
});

app.patch("/api/events/:id/runsheet/items/:rid", (req, res) => {
  const e = planEvent(req, res); if (!e) return;
  const r = e.runSheet.items.find((x) => x.id === req.params.rid);
  if (!r) return notFound(res, "Run sheet line");
  // only one line can be "now" at a time
  if (req.body.status === "live") for (const x of e.runSheet.items) if (x.status === "live") x.status = "done";
  for (const k of RS_FIELDS) if (k in req.body) r[k] = req.body[k];
  touchRunSheet(e, req);
  save();
  res.json(eventDetail(e));
});

app.post("/api/events/:id/runsheet/issues", (req, res) => {
  const e = planEvent(req, res); if (!e) return;
  if (!req.body.text?.trim()) return res.status(400).json({ error: "Describe the issue first." });
  e.runSheet.issues.unshift({ id: newId("is"), at: now(), text: req.body.text.trim(), severity: req.body.severity === "watch" ? "watch" : "urgent", owner: req.body.owner || who(req), resolved: false });
  touchRunSheet(e, req);
  logActivity(e, `Issue reported: ${req.body.text.trim()}`, who(req));
  save();
  res.json(eventDetail(e));
});

app.patch("/api/events/:id/runsheet/issues/:iid", (req, res) => {
  const e = planEvent(req, res); if (!e) return;
  const i = e.runSheet.issues.find((x) => x.id === req.params.iid);
  if (!i) return notFound(res, "Issue");
  for (const k of ["resolved", "severity", "owner", "text"]) if (k in req.body) i[k] = req.body[k];
  touchRunSheet(e, req);
  save();
  res.json(eventDetail(e));
});

app.get("/api/events/:id/runsheet.csv", (req, res) => {
  const e = store.event(req.params.id);
  if (!e) return notFound(res, "Event");
  const name = `${e.name.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "")}-run-sheet.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(runSheetCSV(e));
});

// ---------------------------------------------------------------- approvals & proposals

function findApproval(req, res) {
  const e = planEvent(req, res); if (!e) return {};
  const a = e.approvals.find((x) => x.id === req.params.aid);
  if (!a) { notFound(res, "Approval"); return {}; }
  return { e, a };
}
const DECISION = { approve: "approved", revision: "revision", decline: "declined" };

function decide(e, a, decision, note, by) {
  a.status = DECISION[decision];
  a.history ??= [];
  a.history.push({ at: now(), who: by, action: a.status, note: note || "" });
  if (note) (a.comments ??= []).push({ id: newId("cm"), who: by, side: "client", at: now(), text: note });
  logActivity(e, `${a.title} ${a.version}: ${a.status === "approved" ? "approved" : a.status === "revision" ? "revision requested" : "declined"} by ${by}.`, by);
}

app.post("/api/events/:id/approvals/:aid/decision", (req, res) => {
  const { e, a } = findApproval(req, res); if (!a) return;
  if (!DECISION[req.body.decision]) return res.status(400).json({ error: "Choose approve, revision or decline." });
  decide(e, a, req.body.decision, req.body.note?.trim(), who(req));
  save();
  res.json(eventDetail(e));
});

app.post("/api/events/:id/approvals/:aid/comments", (req, res) => {
  const { e, a } = findApproval(req, res); if (!a) return;
  if (!req.body.text?.trim()) return res.status(400).json({ error: "Write a comment first." });
  (a.comments ??= []).push({ id: newId("cm"), who: who(req), side: req.body.side === "client" ? "client" : "internal", at: now(), text: req.body.text.trim() });
  save();
  res.json(eventDetail(e));
});

// Issue the next version after a revision request: back to "awaiting decision".
app.post("/api/events/:id/approvals/:aid/version", (req, res) => {
  const { e, a } = findApproval(req, res); if (!a) return;
  const n = Number(String(a.version).replace(/\D/g, "")) || 1;
  a.version = `v${n + 1}`;
  a.status = "pending";
  a.requestedAt = now();
  a.history.push({ at: now(), who: who(req), action: "sent", note: req.body.note?.trim() || `${a.version} issued` });
  logActivity(e, `${a.title} ${a.version} sent for approval.`, who(req));
  save();
  res.json(eventDetail(e));
});

app.patch("/api/events/:id/approvals/:aid", (req, res) => {
  const { e, a } = findApproval(req, res); if (!a) return;
  if ("sharedWithClient" in req.body) {
    a.sharedWithClient = Boolean(req.body.sharedWithClient);
    if (a.sharedWithClient) a.history.push({ at: now(), who: who(req), action: "sent", note: "Shared with the client" });
  }
  save();
  res.json(eventDetail(e));
});

// Organizer replies to a client comment on a concept, option or image (visible to the client).
app.post("/api/events/:id/client-comments", (req, res) => {
  const e = planEvent(req, res); if (!e) return;
  if (!req.body.text?.trim() || !req.body.target?.kind) return res.status(400).json({ error: "Write a reply first." });
  e.clientComments.push({ id: newId("cc"), who: who(req), at: now(), fromOrganizer: true, target: req.body.target, text: req.body.text.trim() });
  save();
  res.json(eventDetail(e));
});

// ---------------------------------------------------------------- change requests

app.get("/api/events/:id/changes", (req, res) => {
  const e = planEvent(req, res); if (!e) return;
  res.json([...e.changes].sort((a, b) => b.at.localeCompare(a.at)).map((c) => changeView(e, c)));
});

app.post("/api/events/:id/changes", (req, res) => {
  const e = planEvent(req, res); if (!e) return;
  const { requestedBy, channel = "Email", message, basics = {}, diffs = [] } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Paste the client's original message." });
  const cur = e.dna?.basics || {};
  const patchBasics = {};
  for (const k of ["date", "guests", "location", "budget"]) {
    let v = basics[k];
    if (v === "" || v == null) continue;
    if (k === "guests" || k === "budget") v = Number(v);
    if (v !== cur[k]) patchBasics[k] = v;
  }
  const cleanDiffs = diffs.filter((d) => d.label?.trim() && d.to?.trim()).map((d) => ({ label: d.label.trim(), from: d.from?.trim() || "—", to: d.to.trim() }));
  if (!Object.keys(patchBasics).length && !cleanDiffs.length) return res.status(400).json({ error: "Enter at least one proposed value." });
  const patch = Object.keys(patchBasics).length ? { basics: patchBasics } : null;
  const ch = {
    id: newId("ch"), requestedBy: requestedBy?.trim() || e.client, channel, at: now(), message: message.trim(),
    patch, diffs: cleanDiffs, status: "open",
    followUps: suggestFollowUps(e, patch, cleanDiffs, newId),
  };
  const items = changeDiffs(e, ch).map((d) => ({ label: d.label, value: `${d.from} → ${d.to}` }));
  const a = {
    id: newId("a"), type: "change", title: `Change: ${items.map((i) => i.label).join(", ")}`, version: "v1", status: "pending", sharedWithClient: false,
    changeId: ch.id, summary: message.trim().slice(0, 160), items, fileIds: [], comments: [], requestedAt: now(),
    history: [{ at: now(), who: who(req), action: "created", note: `Logged from ${channel}` }],
  };
  ch.approvalId = a.id;
  const clientFu = ch.followUps.find((f) => f.kind === "client");
  if (clientFu) clientFu.approvalId = a.id;
  e.changes.unshift(ch);
  e.approvals.push(a);
  logActivity(e, `Change requested by ${ch.requestedBy}: ${items.map((i) => i.label).join(", ")}.`, who(req));
  save();
  res.json(changeView(e, ch));
});

function findChange(req, res) {
  const e = planEvent(req, res); if (!e) return {};
  const ch = e.changes.find((x) => x.id === req.params.cid);
  if (!ch) { notFound(res, "Change"); return {}; }
  return { e, ch };
}

// "Approve revised brief": updates the brief (new version) and internal estimates only.
// Nothing goes to suppliers here; those are separate follow-up actions.
app.post("/api/events/:id/changes/:cid/accept", (req, res) => {
  const { e, ch } = findChange(req, res); if (!ch) return;
  if (ch.status !== "open") return res.status(409).json({ error: "This change was already decided." });
  const view = changeView(e, ch);
  ch.snapshot = { impact: view.impact, conflicts: view.conflicts };
  if (ch.patch) {
    const oldG = e.dna?.basics?.guests;
    ch.before = {
      basics: Object.fromEntries(Object.keys(ch.patch.basics || {}).map((k) => [k, e.dna?.basics?.[k] ?? null])),
      requirements: Object.fromEntries(Object.keys(ch.patch.requirements || {}).map((id) => [id, e.dna?.requirements?.find((r) => r.id === id)?.text])),
    };
    e.dna = { ...applyPatch(e.dna, ch.patch), learned: e.dna?.learned || [] };
    pushVersion(e, `Change accepted: "${ch.message.slice(0, 60)}"`);
    const newG = e.dna.basics.guests;
    if (oldG && newG && newG !== oldG) for (const q of e.quotes || []) {
      if (q.status !== "estimate") continue;
      if (q.qty === oldG) q.qty = newG; else if (q.qty === oldG * 2) q.qty = newG * 2;
    }
  }
  ch.status = "accepted";
  ch.acceptedAt = now();
  ch.acceptedBy = who(req);
  logActivity(e, `Revised brief approved${ch.patch ? ` (v${e.briefVersions.length})` : ""}. Follow-ups to suppliers are still to do.`, who(req));
  save();
  res.json(changeView(e, ch));
});

app.post("/api/events/:id/changes/:cid/decline", (req, res) => {
  const { e, ch } = findChange(req, res); if (!ch) return;
  if (ch.status !== "open") return res.status(409).json({ error: "This change was already decided." });
  ch.status = "declined";
  ch.declinedAt = now();
  ch.declinedBy = who(req);
  ch.declineNote = req.body.note?.trim() || "";
  const a = e.approvals.find((x) => x.id === ch.approvalId);
  if (a && a.status === "pending") decide(e, a, "decline", ch.declineNote, who(req));
  logActivity(e, `Change declined: "${ch.message.slice(0, 60)}"`, who(req));
  save();
  res.json(changeView(e, ch));
});

app.patch("/api/events/:id/changes/:cid/followups/:fid", (req, res) => {
  const { e, ch } = findChange(req, res); if (!ch) return;
  const f = ch.followUps.find((x) => x.id === req.params.fid);
  if (!f) return notFound(res, "Follow-up");
  if ("done" in req.body) f.done = Boolean(req.body.done);
  save();
  res.json(changeView(e, ch));
});

// Contacting a supplier is its own step: ORCA drafts the message, the organizer approves and sends it in the Inbox.
app.post("/api/events/:id/changes/:cid/followups/:fid/draft", wrap(async (req, res) => {
  const { e, ch } = findChange(req, res); if (!ch) return;
  const f = ch.followUps.find((x) => x.id === req.params.fid);
  const v = f && store.vendor(f.vendorId);
  if (!v) return notFound(res, "Supplier follow-up");
  if (ch.status !== "accepted") return res.status(409).json({ error: "Approve the revised brief first. Suppliers hear about it after that." });
  const { thread, message } = await draftQuestion(e, v, f.questions?.length ? f.questions : [f.text], `Change: ${ch.message.slice(0, 50)}`);
  f.threadId = thread.id;
  f.messageId = message.id;
  save();
  res.json({ change: changeView(e, ch), threadId: thread.id });
}));

// ---------------------------------------------------------------- files

const FILE_GROUPS = ["brief", "reference", "quotation", "contract", "floorplan", "invoice", "other"];

app.post("/api/events/:id/files", docUpload.single("file"), (req, res) => {
  const e = planEvent(req, res); if (!e) return;
  if (!req.file) return res.status(400).json({ error: "Choose a PDF, image, Office or text file under 15 MB." });
  const by = who(req);
  const existing = req.body.fileId && e.files.find((f) => f.id === req.body.fileId);
  if (existing) {
    existing.versions ??= [{ v: existing.version, at: existing.at, by: existing.uploader, url: existing.url || null }];
    existing.version += 1;
    Object.assign(existing, { url: `/uploads/${req.file.filename}`, at: now(), uploader: by, size: req.file.size, mime: req.file.mimetype });
    existing.versions.push({ v: existing.version, at: existing.at, by, url: existing.url });
    logActivity(e, `New version of ${existing.name} (v${existing.version}).`, by);
    save();
    return res.json(eventDetail(e));
  }
  let linked = null;
  try { linked = req.body.linked ? JSON.parse(req.body.linked) : null; } catch {}
  const f = {
    id: newId("f"), name: req.file.originalname, group: FILE_GROUPS.includes(req.body.group) ? req.body.group : "other",
    version: 1, uploader: by, at: now(), linked, visibility: { internal: true, client: false, vendors: [] },
    url: `/uploads/${req.file.filename}`, size: req.file.size, mime: req.file.mimetype,
  };
  f.versions = [{ v: 1, at: f.at, by, url: f.url }];
  e.files.unshift(f);
  logActivity(e, `File uploaded: ${f.name}. Internal only until you share it.`, by);
  save();
  res.json(eventDetail(e));
});

app.patch("/api/events/:id/files/:fid", (req, res) => {
  const e = planEvent(req, res); if (!e) return;
  const f = e.files.find((x) => x.id === req.params.fid);
  if (!f) return notFound(res, "File");
  if (req.body.visibility) {
    const vis = req.body.visibility;
    f.visibility = { internal: true, client: Boolean(vis.client), vendors: (vis.vendors || []).filter((id) => store.vendor(id)) };
  }
  if (FILE_GROUPS.includes(req.body.group)) f.group = req.body.group;
  if ("linked" in req.body) f.linked = req.body.linked;
  save();
  res.json(eventDetail(e));
});

// ---------------------------------------------------------------- self-serve: customer chat → orders → vendors

const sendErr = (res, err) => res.status(err.status || 500).json({ error: err.message || "Something went wrong" });

app.post("/api/customers", (req, res) => {
  const { name, phone, line, email } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "กรุณาใส่ชื่อ / Please add your name." });
  if (!phone?.trim() && !email?.trim() && !line?.trim()) return res.status(400).json({ error: "ใส่เบอร์โทร อีเมล หรือ LINE อย่างน้อยหนึ่งช่อง / Add a phone, email or LINE ID." });
  const c = selfserve.createCustomer({ name, phone, line, email });
  save();
  res.json(selfserve.customerView(c));
});

app.get("/api/customers/:cid", (req, res) => {
  const c = selfserve.findCustomer(req.params.cid);
  if (!c) return notFound(res, "Customer");
  res.json(selfserve.customerView(c));
});

app.post("/api/customers/:cid/messages", wrap(async (req, res) => {
  const c = selfserve.findCustomer(req.params.cid);
  if (!c) return notFound(res, "Customer");
  const text = String(req.body.text || "").trim().slice(0, 4000);
  if (!text) return res.status(400).json({ error: "พิมพ์ข้อความก่อนนะครับ / Type a message first." });
  const out = await selfserve.handleMessage(c, text);
  save();
  res.json({ ...selfserve.customerView(c), ai: out?.ai, aiError: out?.aiError });
}));

// Before any order: the customer swaps a suggested vendor, then confirms the set.
app.post("/api/customers/:cid/choose", (req, res) => {
  const c = selfserve.findCustomer(req.params.cid);
  if (!c) return notFound(res, "Customer");
  try { selfserve.chooseVendor(c, req.body.category, req.body.vendorId); save(); res.json(selfserve.customerView(c)); }
  catch (err) { sendErr(res, err); }
});
app.post("/api/customers/:cid/confirm", (req, res) => {
  const c = selfserve.findCustomer(req.params.cid);
  if (!c) return notFound(res, "Customer");
  try { selfserve.confirmVendors(c); save(); res.json(selfserve.customerView(c)); }
  catch (err) { sendErr(res, err); }
});
// Demo checkout: deposit or balance for every confirmed order, held by ORCA until the event.
app.post("/api/customers/:cid/pay", (req, res) => {
  const c = selfserve.findCustomer(req.params.cid);
  if (!c) return notFound(res, "Customer");
  try { const p = selfserve.pay(c, req.body || {}); save(); res.json({ ...selfserve.customerView(c), receipt: p }); }
  catch (err) { sendErr(res, err); }
});

// What a customer may see about a vendor before choosing them.
app.get("/api/vendors/:id/public", (req, res) => {
  const v = store.vendor(req.params.id);
  if (!v) return notFound(res, "Vendor");
  const similar = store.vendors().filter((x) => x.category === v.category && x.id !== v.id).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 3).map(selfserve.shopCard);
  // ORCA's own past events this shop worked on: real portfolio the customer can trust
  const orcaWork = SHOWCASE.filter((c) => c.vendors.includes(v.shopName)).map((c) => ({ id: c.id, title: c.title, image: showcaseImage(c.id), type: c.type, typeTh: c.th?.type || c.type, when: c.when, whenTh: c.th?.when || c.when, guests: c.guests }));
  res.json({ ...selfserve.publicVendor(v), similar, orcaWork });
});

// Public shop directory for customers.
app.get("/api/shops", (_req, res) => res.json(store.vendors().map(selfserve.shopCard)));

// Demo only: vendors answer everything waiting for them.
app.post("/api/customers/:cid/simulate", (req, res) => {
  const c = selfserve.findCustomer(req.params.cid);
  if (!c) return notFound(res, "Customer");
  try { const n = selfserve.simulateVendors(c); save(); res.json({ ...selfserve.customerView(c), answered: n }); }
  catch (err) { sendErr(res, err); }
});

app.get("/api/vendor-portal/:vendorId/orders", (req, res) => {
  if (!store.vendor(req.params.vendorId)) return notFound(res, "Vendor");
  res.json(selfserve.vendorOrders(req.params.vendorId));
});

app.post("/api/vendor-portal/:vendorId/orders/:eventId", (req, res) => {
  try {
    selfserve.vendorAction(req.params.vendorId, req.params.eventId, req.body || {});
    save();
    res.json(selfserve.vendorOrders(req.params.vendorId));
  } catch (err) { sendErr(res, err); }
});

// ---------------------------------------------------------------- concierge demo (client message → vendors → changes)

app.get("/api/concierge", (_req, res) => {
  res.json(store.events().filter((e) => e.concierge).map((e) => ({ id: e.id, name: e.name, client: e.client, date: e.date, createdAt: e.createdAt })));
});

app.get("/api/concierge/:id", (req, res) => {
  const e = store.event(req.params.id);
  if (!e) return notFound(res, "Event");
  res.json(concierge.orderView(e));
});

// Page 1: the client's own words → Event DNA → event → ORCA briefs the best vendor per category.
app.post("/api/concierge/start", wrap(async (req, res) => {
  const { client, text, date, location, budget } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "Paste what the client wrote first." });
  const decoded = await ai.decode({ texts: [text.trim()] });
  const { _ai, _aiError, ...dna } = decoded;
  dna.basics = { ...dna.basics };
  // details the client didn't write: the organizer's form fills the gaps, the client's words win
  if (!dna.basics.date && date) dna.basics.date = date;
  if (!dna.basics.location && location) dna.basics.location = location;
  if (!dna.basics.budget && budget) dna.basics.budget = Number(budget);
  dna.openQuestions = (dna.openQuestions || []).filter((q) => !dna.basics[q.field]);
  const who = client?.trim() || "Client";
  const e = ensurePlan({
    id: newId("e"), concierge: true,
    name: `${who} ${dna.eventType ? dna.eventType[0].toUpperCase() + dna.eventType.slice(1) : "Event"}`,
    client: who, type: dna.eventType || "event",
    date: dna.basics.date, location: dna.basics.location, guests: dna.basics.guests, budget: dna.basics.budget,
    stage: "Sourcing", status: "active", team: ["Fah"], createdAt: now(),
    input: text.trim(), texts: [text.trim()], dna,
    briefVersions: [{ v: 1, at: now(), note: "Decoded from the client's message", dna: structuredClone(dna) }],
    feedback: [], selected: {}, shortlist: {}, quotes: [], activity: [], references: [], conciergeLog: [],
  });
  logActivity(e, "Event created from the client's message.");
  store.events().unshift(e);
  const sent = concierge.briefVendors(e);
  e.conciergeLog.push({ at: now(), kind: "start", text: text.trim(), ai: _ai, sent: sent.length });
  save();
  res.json({ ...concierge.orderView(e), ai: _ai, aiError: _aiError });
}));

app.post("/api/concierge/:id/replies", (req, res) => {
  const e = store.event(req.params.id);
  if (!e) return notFound(res, "Event");
  const n = concierge.simulateReplies(e);
  save();
  res.json({ ...concierge.orderView(e), replies: n });
});

// Page 2: the client changes their mind. ORCA re-reads everything they've said, updates what it
// can from what it already knows, and only asks vendors when it needs to.
app.post("/api/concierge/:id/change", wrap(async (req, res) => {
  const e = store.event(req.params.id);
  if (!e) return notFound(res, "Event");
  ensurePlan(e);
  const text = req.body.text?.trim();
  if (!text) return res.status(400).json({ error: "Type what the client asked for." });
  const { result, ai: _ai, aiError: _aiError, next } = await concierge.absorbChange(e, text);
  e.conciergeLog ??= [];
  if (!result.lines.length) {
    e.conciergeLog.push({ at: now(), kind: "change", text, ai: _ai, lines: [], outcomes: [] });
    save();
    return res.json({ ...concierge.orderView(e), result, ai: _ai, aiError: _aiError });
  }
  const counts = result.outcomes.reduce((m, o) => ({ ...m, [o.outcome]: (m[o.outcome] || 0) + 1 }), {});
  logActivity(e, `Client change handled: ${counts.auto || 0} orders updated by ORCA, ${counts.clarify || 0} vendors asked to clarify${counts.new ? `, ${counts.new} new vendor briefed` : ""}.`);
  e.conciergeLog.push({ at: now(), kind: "change", text, ai: _ai, lines: result.lines, outcomes: result.outcomes, budgetOnly: result.budgetOnly });
  save();
  res.json({ ...concierge.orderView(e), result, ai: _ai, aiError: _aiError });
}));

// ---------------------------------------------------------------- client portal (client-safe only)

// ORCA's past work for the client portal: public, fictional case studies.
// A real photo dropped into public/showcase/<id>.jpg|.png|.webp replaces the drawn illustration.
const showcaseImage = (id) => {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) if (hasAsset("showcase", `${id}.${ext}`)) return `showcase/${id}.${ext}`;
  return `showcase/${id}.svg`;
};
app.get("/api/showcase", (_req, res) => res.json({ cases: SHOWCASE.map((c) => ({ ...c, image: showcaseImage(c.id) })), groups: SHOWCASE_GROUPS, groupsTh: SHOWCASE_GROUPS_TH, summary: showcaseSummary() }));

app.get("/api/client-portal", (_req, res) => {
  res.json(store.events().map((e) => ({ id: e.id, name: e.name, client: e.client, date: e.date })));
});

app.get("/api/client-portal/:eventId", (req, res) => {
  const e = store.event(req.params.eventId);
  if (!e) return notFound(res, "Event");
  res.json(clientView(e));
});

app.post("/api/client-portal/:eventId/comments", (req, res) => {
  const e = store.event(req.params.eventId);
  if (!e) return notFound(res, "Event");
  ensurePlan(e);
  const { target, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "Write your comment first." });
  const name = String(req.body.who || e.client).slice(0, 60);
  if (target?.kind === "approval") {
    const a = e.approvals.find((x) => x.id === target.id && x.sharedWithClient);
    if (!a) return notFound(res, "Proposal");
    (a.comments ??= []).push({ id: newId("cm"), who: name, side: "client", at: now(), text: text.trim() });
  } else {
    if (!["concept", "option", "reference"].includes(target?.kind)) return res.status(400).json({ error: "Unknown item." });
    const label = target.kind === "concept" ? `Concept: ${e.concepts.find((c) => c.id === target.id)?.title || ""}`
      : target.kind === "option" ? `Vendor option: ${store.vendor(target.id)?.shopName || ""}` : `Reference image ${Number(target.id) + 1}`;
    e.clientComments.push({ id: newId("cc"), who: name, at: now(), target: { kind: target.kind, id: String(target.id), label }, text: text.trim() });
  }
  logActivity(e, `${name} commented in the client portal.`, name);
  save();
  res.json(clientView(e));
});

app.post("/api/client-portal/:eventId/approvals/:aid/decision", (req, res) => {
  const e = store.event(req.params.eventId);
  if (!e) return notFound(res, "Event");
  ensurePlan(e);
  const a = e.approvals.find((x) => x.id === req.params.aid && x.sharedWithClient);
  if (!a) return notFound(res, "Proposal");
  if (!["approve", "revision"].includes(req.body.decision)) return res.status(400).json({ error: "Approve or request a revision." });
  if (a.status !== "pending") return res.status(409).json({ error: "This version was already decided." });
  if (req.body.decision === "revision" && !req.body.note?.trim()) return res.status(400).json({ error: "Tell the organizer what to change." });
  decide(e, a, req.body.decision, req.body.note?.trim(), String(req.body.who || e.client).slice(0, 60));
  save();
  res.json(clientView(e));
});

app.get("/api/meta",(_req, res) => res.json({ categories: CATEGORIES }));

app.listen(PORT, () => {
  const s = ai.aiStatus();
  console.log(`\n  ORCA prototype running`);
  console.log(`  Organizer app : http://localhost:${PORT}`);
  console.log(`  Vendor portal : http://localhost:${PORT}/vendor.html`);
  console.log(`  Client portal : http://localhost:${PORT}/client.html`);
  console.log(`  AI engine     : ${s.mode === "claude" ? `Claude (${s.model})` : "offline rules (set ANTHROPIC_API_KEY in .env to use Claude)"}\n`);
});
