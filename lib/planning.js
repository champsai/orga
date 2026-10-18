// Planning helpers: change impact, follow-up state, run-sheet CSV and the
// client-safe view of an event. Kept out of server.js so the routes stay short.
import { store, now } from "./store.js";
import { rankVendors, CATEGORIES } from "./matching.js";

const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label || c.key]));
const BASIC_LABEL = { date: "Date", guests: "Guests", location: "Location", budget: "Budget", setting: "Setting" };
const fmtBasic = (k, v) => (v == null || v === "" ? "Not set" : k === "budget" ? `฿${Number(v).toLocaleString("en-US")}` : String(v));

// Keep the event's top-level basics in step with its brief, and keep every version.
export function syncBasics(e) {
  const b = e.dna?.basics || {};
  if (b.guests) e.guests = b.guests;
  if (b.date) e.date = b.date;
  if (b.location) e.location = b.location;
  if (b.budget) e.budget = b.budget;
  if (e.dna?.eventType) e.type = e.dna.eventType;
}

export function pushVersion(e, note) {
  e.briefVersions ??= [];
  e.briefVersions.push({ v: e.briefVersions.length + 1, at: now(), note, dna: structuredClone(e.dna) });
  e.matchCache = null;
  syncBasics(e);
}

// Older events (and ones created in the app) may not have planning data yet.
export function ensurePlan(e) {
  e.tasks ??= [];
  e.runSheet ??= { updatedAt: null, updatedBy: null, items: [], issues: [] };
  e.runSheet.items ??= [];
  e.runSheet.issues ??= [];
  e.approvals ??= [];
  e.changes ??= [];
  e.files ??= [];
  e.concepts ??= [];
  e.clientComments ??= [];
  return e;
}

// What changes if the brief changes? Compare current vs proposed ranking.
export function previewImpact(e, dna) {
  const proposed = { ...e, dna };
  const before = rankVendors(e, store.vendors(), { perCategory: 1 });
  const after = rankVendors(proposed, store.vendors(), { perCategory: 1 });
  const topPickChanges = [];
  for (const cat of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[cat]?.[0]; const a = after[cat]?.[0];
    if (b?.vendorId !== a?.vendorId) topPickChanges.push({ category: cat, from: store.vendor(b?.vendorId)?.shopName || "-", to: store.vendor(a?.vendorId)?.shopName || "-" });
  }
  const selectedAffected = Object.entries(e.selected || {}).map(([cat, vid]) => {
    const v = store.vendor(vid);
    const issues = v ? rankVendors(proposed, [v], { perCategory: 1 })[cat]?.[0]?.evidence.issues || [] : [];
    return { category: cat, vendor: v?.shopName, issues };
  }).filter((s) => s.issues.length > 0);
  const b0 = e.dna?.basics || {}; const b1 = dna?.basics || {};
  const costNote = b0.guests !== b1.guests && b1.guests
    ? `Per-guest items change by ${(b1.guests - (b0.guests || 0)) > 0 ? "+" : ""}${b1.guests - (b0.guests || 0)} guests.`
    : null;
  return { topPickChanges, selectedAffected, costNote };
}

// A change request stores a small patch; the proposed brief is the current one with it applied.
export function applyPatch(dna, patch) {
  const out = structuredClone(dna || {});
  if (!patch) return out;
  out.basics = { ...(out.basics || {}), ...(patch.basics || {}) };
  for (const [id, text] of Object.entries(patch.requirements || {})) {
    const r = (out.requirements || []).find((x) => x.id === id);
    if (r) { r.text = text; r.source = "client"; }
  }
  const oldGuests = dna?.basics?.guests;
  if (patch.basics?.guests) {
    out.chips = [`${patch.basics.guests} PAX`, ...(out.chips || []).filter((c) => !/PAX$/.test(c))];
    if (oldGuests && out.summary) out.summary = out.summary.replace(new RegExp(`\\b${oldGuests}\\b`, "g"), String(patch.basics.guests));
  }
  out.openQuestions = (out.openQuestions || []).filter((q) => !(patch.basics && q.field in patch.basics));
  return out;
}

export function changeDiffs(e, ch) {
  const out = [...(ch.diffs || [])];
  const b = e.dna?.basics || {};
  for (const [k, v] of Object.entries(ch.patch?.basics || {})) {
    if (ch.status === "accepted" && ch.before?.basics) out.push({ label: BASIC_LABEL[k] || k, from: fmtBasic(k, ch.before.basics[k]), to: fmtBasic(k, v) });
    else out.push({ label: BASIC_LABEL[k] || k, from: fmtBasic(k, b[k]), to: fmtBasic(k, v) });
  }
  for (const [id, text] of Object.entries(ch.patch?.requirements || {})) {
    const r = (e.dna?.requirements || []).find((x) => x.id === id);
    const from = ch.status === "accepted" ? ch.before?.requirements?.[id] : r?.text;
    out.push({ label: `${CAT_LABEL[r?.category] || "Brief"} requirement`, from: from || "—", to: text });
  }
  return out;
}

function followUpState(e, f) {
  if (f.kind === "supplier" && f.threadId) {
    const t = store.thread(f.threadId);
    const m = t?.messages.find((x) => x.id === f.messageId);
    if (m?.status === "sent") return "sent";
    if (m) return m.status === "approved" ? "approved" : "drafted";
  }
  if (f.kind === "client" && f.approvalId) {
    const a = e.approvals.find((x) => x.id === f.approvalId);
    if (a?.status === "approved") return "done";
    if (a?.sharedWithClient) return f.done ? "done" : "waiting";
  }
  return f.done ? "done" : "todo";
}

export function changeView(e, ch) {
  ensurePlan(e);
  const accepted = ch.status === "accepted";
  const followUps = (ch.followUps || []).map((f) => {
    const state = followUpState(e, f);
    return { ...f, vendorName: f.vendorId ? store.vendor(f.vendorId)?.shopName : null, state, finished: ["done", "sent"].includes(state) };
  });
  const unfinished = accepted ? followUps.filter((f) => !f.finished).length : null;
  // once accepted, show the impact as it was when the change was approved
  if (ch.status !== "open" && ch.snapshot) return { ...ch, diffs: changeDiffs(e, ch), followUps, impact: ch.snapshot.impact, conflicts: ch.snapshot.conflicts, unfinished };
  const base = accepted && ch.before ? { ...e, dna: { ...e.dna, basics: { ...e.dna.basics, ...ch.before.basics } } } : e;
  const proposed = ch.patch ? applyPatch(base.dna, ch.patch) : null;
  const imp = proposed && !accepted ? previewImpact(e, proposed) : { topPickChanges: [], selectedAffected: [], costNote: null };
  const oldG = base.dna?.basics?.guests ?? e.guests;
  const newG = proposed?.basics?.guests ?? oldG;
  const newDate = proposed?.basics?.date;

  const involved = new Set([
    ...Object.values(e.selected || {}), ...Object.values(e.shortlist || {}).flat(),
    ...(e.quotes || []).map((q) => q.vendorId), ...store.threads().filter((t) => t.eventId === e.id).map((t) => t.vendorId),
  ]);
  const vendors = new Map();
  const add = (vid, reason, conflict = false) => {
    const v = store.vendor(vid);
    if (!v) return;
    const cur = vendors.get(vid) || { vendorId: vid, name: v.shopName, category: v.category, reasons: [], conflict: false };
    if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
    cur.conflict ||= conflict;
    vendors.set(vid, cur);
  };
  for (const vid of involved) {
    const v = store.vendor(vid);
    if (!v) continue;
    if (newG !== oldG && v.capacity?.max) {
      if (v.capacity.max < newG) add(vid, `Holds up to ${v.capacity.max} guests`, true);
      else if (v.capacity.max === newG) add(vid, `At full capacity (${v.capacity.max}), no room to grow`, true);
    }
    if (newDate && newDate !== base.dna?.basics?.date && v.availability?.[newDate] === "booked") add(vid, `Booked on ${newDate}`, true);
  }
  for (const f of ch.followUps || []) if (f.vendorId) add(f.vendorId, "Needs to hear about the change");

  const costs = [];
  if (newG !== oldG && oldG) {
    for (const q of e.quotes || []) {
      const k = q.qty === oldG ? 1 : q.qty === oldG * 2 ? 2 : 0;
      if (!k) continue;
      const from = q.qty * q.unitPrice; const to = newG * k * q.unitPrice;
      costs.push({ vendor: store.vendor(q.vendorId)?.shopName, item: q.item, status: q.status, from, to, delta: to - from });
    }
  }
  const costDelta = costs.reduce((s, c) => s + c.delta, 0);
  const forecast = (e.quotes || []).reduce((s, q) => s + q.qty * q.unitPrice, 0);

  const affectedVendorIds = new Set(vendors.keys());
  const followTaskIds = new Set((ch.followUps || []).map((f) => f.taskId).filter(Boolean));
  const tasks = e.tasks.filter((t) => t.status !== "done" && (followTaskIds.has(t.id) || (t.vendorId && affectedVendorIds.has(t.vendorId))))
    .map(({ id, title, owner, due, status }) => ({ id, title, owner, due, status }));
  const approvals = e.approvals.filter((a) => a.id !== ch.approvalId && ["pending", "approved", "revision"].includes(a.status) &&
      (a.type === "brief" && ch.patch || a.type === "budget" && costDelta || (a.type === "vendor" && affectedVendorIds.has(a.vendorId) && vendors.get(a.vendorId)?.conflict)))
    .map(({ id, title, version, status, type }) => ({ id, title, version, status, type }));

  const conflicts = [];
  for (const v of vendors.values()) if (v.conflict) conflicts.push(`${v.name}: ${v.reasons.filter((r) => r !== "Needs to hear about the change").join(", ")}`);
  for (const s of imp.selectedAffected) conflicts.push(`${s.vendor} (chosen): ${s.issues.join(", ")}`);
  for (const c of imp.topPickChanges) conflicts.push(`Top ${CAT_LABEL[c.category] || c.category} pick changes: ${c.from} → ${c.to}`);
  if (e.budget && costDelta > 0 && forecast + costDelta > e.budget) conflicts.push(`Forecast goes over the ฿${e.budget.toLocaleString("en-US")} budget`);

  return {
    ...ch, diffs: changeDiffs(e, ch), followUps,
    impact: { vendors: [...vendors.values()], costs, costDelta, tasks, approvals, topPickChanges: imp.topPickChanges, costNote: imp.costNote },
    conflicts,
    unfinished,
  };
}

// Suggested follow-ups for a change logged in the app.
export function suggestFollowUps(e, patch, diffs, newId) {
  const out = [{ id: newId("fu"), kind: "client", text: "Send the revised brief to the client for approval", done: false }];
  const vendorIds = new Set([...Object.values(e.selected || {}), ...(e.quotes || []).map((q) => q.vendorId)]);
  const qs = [];
  const b = e.dna?.basics || {};
  if (patch?.basics?.guests && patch.basics.guests !== b.guests) qs.push(`จำนวนแขกเปลี่ยนจาก ${b.guests ?? "-"} เป็น ${patch.basics.guests} คน รบกวนแจ้งว่ารองรับได้ไหม และราคาเปลี่ยนเท่าไรครับ`);
  if (patch?.basics?.date && patch.basics.date !== b.date) qs.push(`งานเลื่อนเป็นวันที่ ${patch.basics.date} ว่างไหมครับ`);
  if (patch?.basics?.location && patch.basics.location !== b.location) qs.push(`สถานที่จัดงานเปลี่ยนเป็น ${patch.basics.location} มีค่าเดินทางหรือค่าใช้จ่ายเพิ่มไหมครับ`);
  for (const d of diffs || []) qs.push(`มีการเปลี่ยนแปลง: ${d.label} จาก ${d.from} เป็น ${d.to} รบกวนยืนยันครับ`);
  if (qs.length) for (const vid of vendorIds) {
    const v = store.vendor(vid);
    if (v) out.push({ id: newId("fu"), kind: "supplier", vendorId: vid, text: `Tell ${v.shopName} about the change`, questions: qs, done: false });
  }
  out.push({ id: newId("fu"), kind: "internal", text: "Update tasks and the run sheet", done: false });
  return out;
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function runSheetCSV(e) {
  ensurePlan(e);
  const head = ["Time", "Activity", "Responsible", "Supplier", "Supplier arrival", "Contact", "Contingency notes", "Status"];
  const rows = [...e.runSheet.items].sort((a, b) => a.time.localeCompare(b.time)).map((r) => [
    r.time, r.activity, r.responsible, r.vendorId ? store.vendor(r.vendorId)?.shopName : "", r.arrival, r.contact, r.notes, r.status,
  ]);
  const meta = [[`${e.name} · run sheet`], [`Event date: ${e.date || "not set"}`], [`Last updated: ${e.runSheet.updatedAt || "never"}${e.runSheet.updatedBy ? ` by ${e.runSheet.updatedBy}` : ""}`], []];
  return "﻿" + [...meta, head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// What the client sees. Built from scratch (never a spread of the event) so internal
// notes, budget internals, quotes, tasks and supplier conversations can't leak in.
export function clientView(e) {
  ensurePlan(e);
  const files = e.files.filter((f) => f.visibility?.client).map((f) => ({ id: f.id, name: f.name, group: f.group, version: f.version, at: f.at, url: f.url || null, size: f.size || null }));
  const fileIds = new Set(files.map((f) => f.id));
  const comments = e.clientComments.map((c) => ({ id: c.id, who: c.who, at: c.at, text: c.text, fromOrganizer: Boolean(c.fromOrganizer), target: { kind: c.target?.kind, id: c.target?.id } }));
  const approvals = e.approvals.filter((a) => a.sharedWithClient).map((a) => {
    const ch = a.changeId ? e.changes.find((c) => c.id === a.changeId) : null;
    return {
      id: a.id, type: a.type, title: a.title, version: a.version, status: a.status, summary: a.summary || "", dueBy: a.dueBy || null,
      items: (a.items || []).map((i) => ({ label: i.label, value: i.value })),
      diffs: ch ? changeDiffs(e, ch).map((d) => ({ label: d.label, from: d.from, to: d.to })) : [],
      files: (a.fileIds || []).filter((id) => fileIds.has(id)).map((id) => files.find((f) => f.id === id)),
      comments: (a.comments || []).filter((c) => c.side === "client").map((c) => ({ id: c.id, who: c.who, at: c.at, text: c.text })),
      history: (a.history || []).map((h) => ({ at: h.at, who: h.who, action: h.action })),
    };
  });
  const cats = [...new Set((e.dna?.requirements || []).map((r) => r.category))];
  const options = cats.map((cat) => {
    const ids = [...new Set([e.selected?.[cat], ...(e.shortlist?.[cat] || [])].filter(Boolean))];
    return {
      category: cat, label: CAT_LABEL[cat] || cat,
      vendors: ids.map((id) => store.vendor(id)).filter(Boolean).map((v) => ({
        id: v.id, shopName: v.shopName, description: v.description || "", area: v.area || v.location || "",
        palette: v.palette || [], portfolio: (v.portfolio || []).map((p) => ({ title: p.title || "", url: p.url || null })),
        style: [...(v.dna?.mood || []), ...(v.dna?.look || [])].slice(0, 6),
        proposed: e.selected?.[cat] === v.id,
      })),
    };
  }).filter((o) => o.vendors.length);
  return {
    event: {
      id: e.id, name: e.name, client: e.client, type: e.type, date: e.date, location: e.location, guests: e.guests, stage: e.stage,
      summary: e.dna?.summary || "", chips: e.dna?.chips || [],
      style: { mood: e.dna?.style?.mood || [], feel: e.dna?.style?.feel || [], look: e.dna?.style?.look || [], avoid: e.dna?.style?.avoid || [] },
      brief: (e.dna?.requirements || []).map((r) => ({ category: CAT_LABEL[r.category] || r.category, text: r.text, kind: r.kind })),
      briefVersion: e.briefVersions?.length || 1,
    },
    concepts: e.concepts.map((c) => ({ id: c.id, title: c.title, description: c.description, palette: c.palette || [], tags: c.tags || [] })),
    references: (e.references || []).map((r, i) => ({ id: String(i), url: r.url })),
    options, approvals, files, comments,
    outstanding: approvals.filter((a) => a.status === "pending").map((a) => ({ id: a.id, title: a.title, version: a.version, type: a.type, dueBy: a.dueBy })),
  };
}
