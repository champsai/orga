// Concierge demo: a client's unorganized message goes in, ORCA briefs the best vendor in
// each category; when the client changes their mind, ORCA updates the order itself when
// it already knows enough, and only asks a vendor when it needs clarification.
// Every vendor message is written in Thai with an English translation alongside.
import { store, newId, now, logActivity } from "./store.js";
import { rankVendors } from "./matching.js";
import { pushVersion } from "./planning.js";
import * as ai from "./ai.js";
import { tagTh, avoidTh } from "./th.js";

export const CAT = {
  venue: ["สถานที่", "Venue"], catering: ["อาหาร", "Catering"], entertainment: ["ดนตรี/บันเทิง", "Entertainment"],
  decor: ["ตกแต่ง", "Decor"], photography: ["ถ่ายภาพ", "Photography"], experience: ["กิจกรรม", "Experience"],
  av: ["แสงเสียง", "AV"], transport: ["รถรับส่ง", "Transport"],
};
export const dTH = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "ยังไม่กำหนด");
export const dEN = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "not set yet");
export const placeTH = (s) => (/^bangkok$/i.test(String(s || "").trim()) ? "กรุงเทพฯ" : s || "กรุงเทพฯ");
const n = (x) => Math.round(Number(x) || 0).toLocaleString("en-US");
const pair = (th, en) => ({ th, en });
const join = (parts) => { const ps = parts.filter(Boolean); return pair(ps.map((p) => p.th).filter(Boolean).join("\n"), ps.map((p) => p.en).filter(Boolean).join("\n")); };
const numbered = (list) => join(list.map((q, i) => pair(`(${i + 1}) ${q.th}`, `(${i + 1}) ${q.en}`)));
const words = (s) => String(s || "").toLowerCase().match(/[a-z฀-๿]{4,}/g) || [];
// "150 seated guests" and "170 seated guests" are the same requirement: the guest rule covers it
const norm = (s) => String(s || "").toLowerCase().replace(/[\d,.]+/g, "#").trim();

function header(e, v) {
  return pair(`สวัสดีครับ ${v.shopName}\nORCA ติดต่อแทนผู้จัดงาน "${e.name}"`, `Hello ${v.shopName},\nORCA is writing on behalf of the organizer of "${e.name}".`);
}
const sign = pair("ขอบคุณครับ\nORCA", "Thank you,\nORCA");

// ---------------------------------------------------------------- orders

export const quotesOf = (e, vid) => (e.quotes || []).filter((q) => q.vendorId === vid);
export const mainQuote = (e, vid) => quotesOf(e, vid).find((q) => !q.extra);
export const totalOf = (e, vid) => quotesOf(e, vid).reduce((s, q) => s + q.qty * q.unitPrice, 0);
const perGuest = (v, q) => (v.packages?.[0]?.unit || v.priceUnit) === "per guest" || (q && q.qty > 1);

// slot: "photography" for the main photographer, "photography+bts" for an extra one (lib/slots.js)
export function addOrder(e, v, slot = v.category) {
  e.selected ??= {};
  e.selected[slot] = v.id;
  if (mainQuote(e, v.id)) return;
  const pkg = v.packages?.[0];
  const pg = perGuest(v);
  e.quotes.push({
    id: newId("q"), vendorId: v.id, category: v.category, item: pkg?.name || v.shopName,
    qty: pg ? e.guests || 1 : 1, unitPrice: pkg?.price ?? v.priceFrom ?? 0, status: "estimate",
    includes: (pkg?.includes || []).join(", "), excludes: (pkg?.excludes || []).join(", "),
  });
}

export function send(e, v, msg, kind, asks = []) {
  let t = store.threads().find((x) => x.eventId === e.id && x.vendorId === v.id);
  if (!t) {
    t = { id: newId("t"), eventId: e.id, vendorId: v.id, channel: "ORCA", topic: `Order: ${e.name}`, status: "awaiting", messages: [] };
    store.threads().unshift(t);
  }
  t.messages.push({ id: newId("m"), from: "orca", status: "sent", at: now(), kind, text: msg.th, textEn: msg.en, ai: "orca" });
  // unanswered questions stay open alongside the new ones
  if (kind !== "update") { t.pendingAsks = [...(t.status === "awaiting" ? t.pendingAsks || [] : []), ...asks]; t.status = "awaiting"; }
  t.questions = asks.map((a) => a.th);
  return t;
}

export function enquiry(e, v) {
  const reqs = (e.dna?.requirements || []).filter((r) => r.category === v.category);
  const s = e.dna?.style || {};
  const q = mainQuote(e, v.id);
  return join([
    header(e, v),
    pair(`วันงาน: ${dTH(e.date)} · สถานที่: ${placeTH(e.location)} · แขก ${e.guests ?? "-"} ท่าน`, `Date: ${dEN(e.date)} · Location: ${e.location || "Bangkok"} · Guests: ${e.guests ?? "-"}`),
    reqs.length ? pair(`สิ่งที่ต้องการจากร้าน (${CAT[v.category][0]}): ${reqs.map((r) => r.text).join(", ")}`, `What we need from you (${CAT[v.category][1]}): ${reqs.map((r) => r.text).join(", ")}`) : null,
    pair(`บรรยากาศที่ลูกค้าต้องการ: ${[...(s.mood || []), ...(s.look || [])].join(", ")}`, `The feel the client wants: ${[...(s.mood || []), ...(s.look || [])].join(", ")}`),
    (s.avoid || []).length ? pair(`สิ่งที่ลูกค้าไม่ต้องการ: ${s.avoid.join(", ")}`, `Please avoid: ${s.avoid.join(", ")}`) : null,
    q ? pair(`แพ็กเกจที่สนใจ: ${q.item}${q.qty > 1 ? ` (${q.qty} ท่าน)` : ""}`, `Package we'd like: ${q.item}${q.qty > 1 ? ` (${q.qty} guests)` : ""}`) : null,
    pair("รบกวนยืนยัน (1) ว่างวันดังกล่าวไหม (2) ราคารวมสำหรับงานนี้ (3) สิ่งที่รวมและไม่รวมในราคา", "Please confirm (1) you're free on that date, (2) the total price for this event, (3) what is and isn't included."),
    sign,
  ]);
}

// ---------------------------------------------------------------- page 1: brief the vendors

export function briefVendors(e) {
  const ranked = rankVendors(e, store.vendors(), { perCategory: 1 });
  const out = [];
  for (const [cat, list] of Object.entries(ranked)) {
    const top = list[0];
    const v = top && store.vendor(top.vendorId);
    if (!v) continue;
    addOrder(e, v);
    send(e, v, enquiry(e, v), "enquiry", [{ type: "enquiry" }]);
    out.push({ vendorId: v.id, category: cat, score: top.score });
  }
  logActivity(e, `ORCA briefed ${out.length} vendors from the client's message.`);
  return out;
}

// Demo: vendors answer. Enquiries come back as bookings; clarifications get a plain answer.
export function simulateReplies(e) {
  let count = 0;
  for (const t of store.threads().filter((x) => x.eventId === e.id && x.status === "awaiting")) {
    const v = store.vendor(t.vendorId);
    const q = mainQuote(e, v.id);
    const asks = t.pendingAsks || [{ type: "enquiry" }];
    const parts = []; let available = true; let extra = 0; const extraLabels = [];
    for (const a of asks) {
      if (a.type === "enquiry" || a.type === "date") {
        const booked = v.availability?.[e.date] === "booked";
        available = !booked;
        if (booked) { parts.push(pair(`ขออภัยครับ วันที่ ${dTH(e.date)} ร้านไม่ว่างแล้ว`, `Sorry, we're not available on ${dEN(e.date)}.`)); continue; }
        v.availability ??= {};
        if (e.date) v.availability[e.date] = "available";
        parts.push(a.type === "date" ? pair(`วันที่ ${dTH(e.date)} ว่างครับ`, `${dEN(e.date)} works for us.`) : pair("ว่างครับ ยินดีรับงานครับ", "We're available and happy to take it."));
        if (a.type === "enquiry" && q) parts.push(pair(
          `ยืนยันแพ็กเกจ ${q.item}${q.qty > 1 ? ` ${n(q.unitPrice)} บาท/ท่าน × ${q.qty}` : ""} รวม ${n(totalOf(e, v.id))} บาท`,
          `Confirmed: ${q.item}${q.qty > 1 ? ` at ${n(q.unitPrice)} THB/guest × ${q.qty}` : ""}, ${n(totalOf(e, v.id))} THB in total.`));
      }
      if (a.type === "capacity") {
        extra += 20000; extraLabels.push("Extra lounge space");
        parts.push(pair(`รองรับ ${e.guests} ท่านได้ครับ โดยเปิดพื้นที่ lounge เพิ่ม ค่าใช้จ่ายเพิ่ม 20,000 บาท`, `We can host ${e.guests} guests by opening the lounge area, +20,000 THB.`));
      }
      if (a.type === "req") {
        extra += 8000; extraLabels.push(String(a.text).slice(0, 40));
        parts.push(pair(`"${a.text}" ทำได้ครับ ค่าใช้จ่ายเพิ่ม 8,000 บาท`, `"${a.text}" is no problem, +8,000 THB.`));
      }
      if (a.type === "style") parts.push(pair("ปรับแบบตามสไตล์ใหม่ได้ครับ ไม่มีค่าใช้จ่ายเพิ่ม จะส่งแบบให้ดูภายใน 2 วัน", "We can adapt the design at no extra cost and will send a new sketch within 2 days."));
      if (a.type === "location") parts.push(pair("ไปได้ครับ ค่าเดินทางรวมในราคาแล้ว", "We can travel there; transport is already included."));
    }
    if (extra && available) {
      e.quotes.push({ id: newId("q"), vendorId: v.id, category: v.category, item: `Extra: ${extraLabels.join(", ")}`, qty: 1, unitPrice: extra, status: "committed", extra: true });
      parts.push(pair(`ยอดรวมใหม่ ${n(totalOf(e, v.id))} บาท`, `New total ${n(totalOf(e, v.id))} THB.`));
    }
    if (q && available) { q.status = "committed"; q.threadId = t.id; }
    const msg = join(parts);
    t.messages.push({ id: newId("m"), from: "vendor", via: "portal", at: now(), text: msg.th, textEn: msg.en, parsed: { available, price: available ? totalOf(e, v.id) : null } });
    t.status = "replied";
    t.pendingAsks = [];
    v.lastConfirmed = now().slice(0, 10);
    logActivity(e, `${v.shopName} ${available ? "confirmed" : "can't make the new date"}.`, v.shopName);
    count++;
  }
  if (count && e.stage !== "Confirmed") e.stage = "Confirmed";
  return count;
}

// ---------------------------------------------------------------- page 2: the client changes their mind

export function diffBrief(prev, next) {
  const b0 = prev.basics || {}; const b1 = next.basics || {};
  const reqs0 = prev.requirements || []; const reqs1 = next.requirements || [];
  const added = reqs1.filter((r) => !reqs0.some((x) => norm(x.text) === norm(r.text)));
  const removed = reqs0.filter((r) => !reqs1.some((x) => norm(x.text) === norm(r.text)));
  const newLook = (next.style?.look || []).filter((t) => !(prev.style?.look || []).includes(t));
  const newAvoid = (next.style?.avoid || []).filter((t) => !(prev.style?.avoid || []).includes(t));
  const d = {
    guests: b1.guests && b1.guests !== b0.guests ? [b0.guests, b1.guests] : null,
    date: b1.date && b1.date !== b0.date ? [b0.date, b1.date] : null,
    location: b1.location && b1.location !== b0.location ? [b0.location, b1.location] : null,
    budget: b1.budget && b1.budget !== b0.budget ? [b0.budget, b1.budget] : null,
    added, removed, newLook, newAvoid,
  };
  const lines = [];
  if (d.guests) lines.push({ label: "Guests", from: String(d.guests[0] ?? "—"), to: String(d.guests[1]), labelTh: "จำนวนแขก", fromTh: `${d.guests[0] ?? "—"} ท่าน`, toTh: `${d.guests[1]} ท่าน` });
  if (d.date) lines.push({ label: "Date", from: dEN(d.date[0]), to: dEN(d.date[1]), labelTh: "วันงาน", fromTh: dTH(d.date[0]), toTh: dTH(d.date[1]) });
  if (d.location) lines.push({ label: "Location", from: d.location[0] || "—", to: d.location[1], labelTh: "สถานที่", fromTh: placeTH(d.location[0]), toTh: placeTH(d.location[1]) });
  if (d.budget) lines.push({ label: "Budget (internal)", from: `฿${n(d.budget[0])}`, to: `฿${n(d.budget[1])}`, labelTh: "งบประมาณ", fromTh: `฿${n(d.budget[0])}`, toTh: `฿${n(d.budget[1])}` });
  for (const r of added) lines.push({ label: `${CAT[r.category]?.[1] || r.category}: new`, from: "—", to: r.text, labelTh: `เพิ่ม (${CAT[r.category]?.[0] || r.category})`, fromTh: "—", toTh: r.text });
  for (const r of removed) lines.push({ label: `${CAT[r.category]?.[1] || r.category}: removed`, from: r.text, to: "—", labelTh: `ตัดออก (${CAT[r.category]?.[0] || r.category})`, fromTh: r.text, toTh: "—" });
  if (newLook.length) lines.push({ label: "Look", from: "—", to: newLook.join(", "), labelTh: "สไตล์", fromTh: "—", toTh: newLook.map(tagTh).join(", ") });
  if (newAvoid.length) lines.push({ label: "Avoid", from: "—", to: newAvoid.join(", "), labelTh: "ไม่เอา", fromTh: "—", toTh: newAvoid.map(avoidTh).join(", ") });
  return { d, lines, any: lines.length > 0 };
}

// Decide per booked vendor: ORCA updates the order itself (and tells the vendor), or asks.
// notify: false works the change out (prices, outcomes) without messaging anyone; used while the
// customer is still going back and forth and ORCA holds the vendor updates.
export function applyChange(e, prevDna, nextDna, { autoBrief = true, notify = true } = {}) {
  const { d, lines } = diffBrief(prevDna, nextDna);
  const outcomes = [];
  const future = { ...e, dna: nextDna, guests: nextDna.basics.guests ?? e.guests, date: nextDna.basics.date ?? e.date, location: nextDna.basics.location ?? e.location };

  for (const [slot, vid] of Object.entries(e.selected || {})) {
    const cat = slot.split("+")[0];
    const v = store.vendor(vid);
    if (!v) continue;
    const q = mainQuote(e, vid);
    const before = { qty: q?.qty, total: totalOf(e, vid) };
    const autos = []; const asks = []; const told = [];

    if (d.guests) {
      const [g0, g1] = d.guests;
      if (q && perGuest(v, q)) {
        const old = totalOf(e, vid);
        q.qty = g1;
        autos.push(pair(`ปรับจำนวนเป็น ${g1} ท่าน × ${n(q.unitPrice)} บาท = ${n(totalOf(e, vid))} บาท (เดิม ${n(old)} บาท)`, `Updated to ${g1} guests × ${n(q.unitPrice)} THB = ${n(totalOf(e, vid))} THB (was ${n(old)} THB)`));
      }
      if (v.capacity?.max) {
        if (g1 <= v.capacity.max) autos.push(pair(`ร้านรองรับได้สูงสุด ${v.capacity.max} ท่าน จึงรองรับ ${g1} ท่านได้`, `You host up to ${v.capacity.max}, so ${g1} guests fits`));
        else asks.push({ type: "capacity", ...pair(`ร้านรองรับสูงสุด ${v.capacity.max} ท่าน มีทางรองรับ ${g1} ท่านได้ไหม และค่าใช้จ่ายเพิ่มเท่าไร`, `You list a maximum of ${v.capacity.max}. Can you host ${g1}, and what would it cost?`) });
      }
      if (autos.length || asks.length) told.push(pair(`จำนวนแขก ${g0 ?? "-"} → ${g1} ท่าน`, `Guests ${g0 ?? "-"} → ${g1}`));
    }
    if (d.date) {
      const [, d1] = d.date;
      const a = v.availability?.[d1];
      told.push(pair(`วันงาน ${dTH(d.date[0])} → ${dTH(d1)}`, `Date ${dEN(d.date[0])} → ${dEN(d1)}`));
      if (a === "available") autos.push(pair(`ในระบบ ORCA ร้านว่างวันที่ ${dTH(d1)} จึงย้ายออเดอร์ให้แล้ว`, `ORCA's records show you're free on ${dEN(d1)}, so the order has moved`));
      else if (a === "booked") asks.push({ type: "date", conflict: true, ...pair(`ระบบแสดงว่าร้านไม่ว่างวันที่ ${dTH(d1)} ยืนยันได้ไหมครับ ถ้าไม่ว่าง ORCA จะแจ้งลูกค้าหาร้านอื่น`, `Our records show you're booked on ${dEN(d1)}. Can you confirm? If so, ORCA will find the client an alternative.`) });
      else asks.push({ type: "date", ...pair(`ว่างวันที่ ${dTH(d1)} ไหมครับ`, `Are you free on ${dEN(d1)}?`) });
    }
    if (d.location) {
      told.push(pair(`สถานที่ ${placeTH(d.location[0])} → ${placeTH(d.location[1])}`, `Location ${d.location[0] || "-"} → ${d.location[1]}`));
      if (cat !== "venue") asks.push({ type: "location", ...pair(`ไปที่ ${d.location[1]} ได้ไหม มีค่าเดินทางเพิ่มไหม`, `Can you work at ${d.location[1]}? Any extra travel cost?`) });
    }
    const pkg = v.packages?.[0] || {};
    const has = (list, r) => words(r.text).some((w) => list.join(" ").toLowerCase().includes(w));
    for (const r of d.added.filter((x) => x.category === cat)) {
      told.push(pair(`ลูกค้าขอเพิ่ม: ${r.text}`, `The client added: ${r.text}`));
      if (has(pkg.excludes || [], r)) asks.push({ type: "req", text: r.text, ...pair(`"${r.text}" ไม่อยู่ในแพ็กเกจเดิม เพิ่มได้ไหม ราคาเท่าไร`, `"${r.text}" isn't in your package. Can you add it, and at what price?`) });
      else if (has([...(pkg.includes || []), ...(v.tags || []), ...(v.dna?.look || [])], r)) autos.push(pair(`"${r.text}" อยู่ในแพ็กเกจ/บริการของร้านแล้ว`, `"${r.text}" is already part of your package/services`));
      else asks.push({ type: "req", text: r.text, ...pair(`"${r.text}" ทำได้ไหม และมีค่าใช้จ่ายเพิ่มเท่าไร`, `Can you do "${r.text}", and is there an extra cost?`) });
    }
    for (const r of d.removed.filter((x) => x.category === cat)) {
      told.push(pair(`ลูกค้าตัดรายการ: ${r.text}`, `The client dropped: ${r.text}`));
      autos.push(pair(`ตัด "${r.text}" ออกจากออเดอร์แล้ว`, `Removed "${r.text}" from the order`));
    }
    if (cat === "decor" && (d.newLook.length || d.newAvoid.length) && !d.added.some((x) => x.category === "decor")) {
      told.push(pair(`ลูกค้าปรับสไตล์${d.newLook.length ? ` เพิ่ม: ${d.newLook.join(", ")}` : ""}${d.newAvoid.length ? ` ไม่เอา: ${d.newAvoid.join(", ")}` : ""}`, `New style${d.newLook.length ? `, add: ${d.newLook.join(", ")}` : ""}${d.newAvoid.length ? `, avoid: ${d.newAvoid.join(", ")}` : ""}`));
      asks.push({ type: "style", ...pair("ปรับแบบให้เข้ากับสไตล์ใหม่ได้ไหม มีผลกับราคาไหม", "Can you adapt the design to this, and does it change the price?") });
    }

    let outcome = "none"; let message = null;
    if (asks.length) {
      outcome = "clarify";
      message = join([header(e, v), pair("ลูกค้าขอเปลี่ยนแปลงดังนี้:", "The client asked for these changes:"), join(told),
        autos.length ? join([pair("ORCA ปรับให้แล้ว:", "ORCA has already updated:"), join(autos)]) : null,
        pair("รบกวนช่วยตอบ:", "Could you please answer:"), numbered(asks), pair("รบกวนตอบกลับภายใน 24 ชม.", "A reply within 24 hours would be great."), sign]);
      if (notify) send(e, v, message, "clarify", asks);
    } else if (autos.length) {
      outcome = "auto";
      message = join([header(e, v), pair("อัปเดตออเดอร์:", "Order update:"), join(told), pair("ORCA ปรับออเดอร์ให้แล้ว:", "ORCA has updated your order:"), join(autos),
        pair("ไม่ต้องตอบกลับหากไม่มีปัญหา ถ้าติดขัดแจ้ง ORCA ได้เลยครับ", "No reply needed unless something doesn't work for you."), sign]);
      if (notify) send(e, v, message, "update");
    }
    outcomes.push({
      vendorId: vid, shopName: v.shopName, category: cat, outcome, conflict: asks.some((a) => a.conflict),
      autos: autos.map((a) => a.en), asks: asks.map((a) => a.en), autosTh: autos.map((a) => a.th), asksTh: asks.map((a) => a.th), message,
      before, after: { qty: q?.qty, total: totalOf(e, vid) },
    });
  }

  // a category the client just asked for, with nobody booked yet: brief the best match
  // (or, when the customer picks vendors themselves, just report it as uncovered)
  const ranked = rankVendors(future, store.vendors(), { perCategory: 1 });
  const uncovered = [];
  for (const [cat, list] of Object.entries(ranked)) {
    if (e.selected?.[cat] || !list[0]) continue;
    if (!autoBrief) { uncovered.push(cat); continue; }
    const v = store.vendor(list[0].vendorId);
    Object.assign(e, { guests: future.guests, date: future.date, location: future.location, dna: nextDna });
    addOrder(e, v);
    const message = enquiry(e, v);
    send(e, v, message, "enquiry", [{ type: "enquiry" }]);
    outcomes.push({ vendorId: v.id, shopName: v.shopName, category: cat, outcome: "new", autos: [], asks: ["Availability and price for the new item"], autosTh: [], asksTh: ["ว่างวันงานไหม และราคาเท่าไร"], message, before: { qty: null, total: 0 }, after: { qty: mainQuote(e, v.id)?.qty, total: totalOf(e, v.id) } });
  }
  return { lines, outcomes, uncovered, budgetOnly: Boolean(d.budget) };
}

// The client says something new. The whole conversation gives the brief; the new
// message alone says which basics changed. Shared by the organizer's Concierge page
// and the customer's own chat.
// opts.toDna: go back to a saved brief (undo) instead of decoding text.
// opts.patch(next, prev): adjust the decoded brief before it's applied (a confirmed style change).
export async function absorbChange(e, text, opts = {}) {
  const prev = structuredClone(e.dna);
  let next; let _ai = null; let _aiError = null;
  if (opts.toDna) next = structuredClone(opts.toDna);
  else {
    const [decoded, only] = await Promise.all([ai.decode({ texts: [...(e.texts || []), text], previous: prev }), ai.decode({ texts: [text] })]);
    ({ _ai, _aiError, ...next } = decoded);
    next.basics = { ...(prev.basics || {}) };
    for (const [k, v] of Object.entries(only.basics || {})) if (v != null && v !== "") next.basics[k] = v;
    // a creative read (launch briefs) stays with the event: its concept, budget split and partner brief
    if (prev.creative) {
      const mine = (prev.requirements || []).filter((r) => r.creative);
      const cats = new Set(mine.map((r) => r.category));
      next.creative = prev.creative;
      next.requirements = [...(next.requirements || []).filter((r) => r.source === "client" || !cats.has(r.category)), ...mine];
      next.style = { ...next.style, look: [...new Set([...(next.style?.look || []), ...(prev.style?.look || [])])], feel: [...new Set([...(next.style?.feel || []), ...(prev.style?.feel || [])])] };
      next.chips = [...prev.creative.core];
    }
    if (next.basics.guests) {
      for (const r of next.requirements || []) if (/^\d+ seated guests$/i.test(r.text)) r.text = `${next.basics.guests} seated guests`;
      next.chips = [`${next.basics.guests} PAX`, ...(next.chips || []).filter((c) => !/PAX$/.test(c))];
    }
    next.overrides = prev.overrides;
  }
  if (opts.patch) opts.patch(next, prev);
  applyOverrides(next);
  next.learned = prev.learned || [];
  const result = applyChange(e, prev, next, opts);
  if (!opts.toDna) e.texts = [...(e.texts || []), text];
  if (result.lines.length) {
    e.dna = next;
    pushVersion(e, opts.toDna ? "Undo: back to the previous brief" : `Client change: "${text.slice(0, 60)}"`);
  }
  return { result, ai: _ai, aiError: _aiError, next };
}

// Style choices the client confirmed against their earlier words ("จัดเต็มไปเลย" after "ไม่ต้องจัดเต็ม").
// Re-decoding the whole chat would bring the old wording back, so they're kept on the brief.
export function applyOverrides(dna) {
  const o = dna.overrides;
  if (!o) return dna;
  const st = (dna.style ||= {});
  for (const k of ["mood", "feel", "look", "avoid"]) st[k] = [...(st[k] || [])];
  const root = (t) => t.replace(/^too /, "");
  // from: the avoided word it replaces ("over-the-top" → wanted as "grand")
  for (const { tag, dim, from } of o.want || []) {
    const gone = from || tag;
    st.avoid = st.avoid.filter((a) => root(a) !== gone && a !== gone);
    if (!st[dim].includes(tag)) st[dim].push(tag);
    const chip = tag.charAt(0).toUpperCase() + tag.slice(1);
    if (!(dna.chips || []).includes(chip)) dna.chips = [...(dna.chips || []), chip];
  }
  for (const { tag } of o.drop || []) {
    for (const k of ["mood", "feel", "look"]) st[k] = st[k].filter((t) => t !== tag);
    if (!st.avoid.includes(tag)) st.avoid.push(tag);
    dna.chips = (dna.chips || []).filter((c) => c.toLowerCase() !== tag);
  }
  return dna;
}

// ---------------------------------------------------------------- views

export function orderView(e) {
  const threads = store.threads().filter((t) => t.eventId === e.id);
  const orders = Object.entries(e.selected || {}).map(([cat, vid]) => {
    const v = store.vendor(vid);
    const q = mainQuote(e, vid);
    const t = threads.find((x) => x.vendorId === vid);
    return {
      vendorId: vid, shopName: v?.shopName, category: cat.split("+")[0], categoryTH: CAT[cat.split("+")[0]]?.[0], item: q?.item, qty: q?.qty, unitPrice: q?.unitPrice,
      extras: quotesOf(e, vid).filter((x) => x.extra).map((x) => ({ item: x.item, amount: x.qty * x.unitPrice })),
      total: totalOf(e, vid), status: q?.status || "estimate", palette: v?.palette || [], portfolio: v?.portfolio || [],
      thread: t ? { id: t.id, status: t.status, messages: t.messages.map(({ id, from, at, kind, text, textEn, status }) => ({ id, from, at, kind, text, textEn, status })) } : null,
    };
  });
  return {
    event: { id: e.id, name: e.name, client: e.client, date: e.date, location: e.location, guests: e.guests, budget: e.budget, stage: e.stage, briefVersion: e.briefVersions?.length || 1, summary: e.dna?.summary, chips: e.dna?.chips || [], style: e.dna?.style || {}, requirements: (e.dna?.requirements || []).map((r) => ({ category: r.category, text: r.text, source: r.source })) },
    texts: e.texts || [],
    orders, total: orders.reduce((s, o) => s + o.total, 0),
    log: e.conciergeLog || [],
  };
}
