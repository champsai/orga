// Self-serve: a customer signs up and chats with ORCA in their own words. ORCA decodes the
// brief, suggests the best vendors per service (with alternatives, reviews and portfolio),
// and only sends orders once the customer confirms. After vendors accept, the customer pays
// a deposit that ORCA holds until the event is over. When the customer changes their mind,
// ORCA updates orders itself where it already knows enough and asks only when it must.
// Every message has Thai and English text; the customer site shows Thai by default.
import { store, newId, now, logActivity } from "./store.js";
import { rankVendors, templateWhy, templateWhyTh } from "./matching.js";
import { chipTh, avoidTh, reqTh, pkgTh } from "./th.js";
import { baseOf, slotInfo, detectSlot, slotFit } from "./slots.js";
import { creativeRead } from "./creative.js";
import { planGuests } from "./replan.js";
import { ensurePlan, pushVersion } from "./planning.js";
import * as ai from "./ai.js";
import * as cg from "./concierge.js";
import { highlights as highlightsOf, styleMentions, saidAbout } from "./offline-ai.js";

const pair = (th, en) => ({ th, en });
const thb = (n) => `฿${Math.round(n || 0).toLocaleString("en-US")}`;
const TYPE = { wedding: ["งานแต่งงาน", "wedding"], birthday: ["งานวันเกิด", "birthday party"], conference: ["งานสัมมนา", "conference"], party: ["ปาร์ตี้", "party"], launch: ["งานเปิดตัวสินค้า", "product launch"], corporate: ["งานบริษัท", "company event"] };
const typeOf = (t) => TYPE[t] || ["งานอีเวนต์", "event"];
const STATUS = {
  pending: ["รอร้านยืนยัน", "Waiting for the vendor"], accepted: ["ร้านยืนยันแล้ว", "Confirmed"], needs_reply: ["รอร้านตอบ", "Vendor is checking"],
  needs_customer: ["รอคุณตัดสินใจ", "Your decision"], declined: ["ร้านปฏิเสธ", "Declined"], cancelled: ["ยกเลิก", "Cancelled"],
};
const DEPOSIT = 0.3;
const OPTIONS = 3;

// ---------------------------------------------------------------- customers + chat

const GREETING_TH = "อยากได้อะไร บอก ORCA มาเลยครับ";
const GREETING_EN = "Tell ORCA what you'd like.";

export function createCustomer({ name, phone, line, email }) {
  const c = {
    id: newId("c"), name: String(name).trim().slice(0, 60), phone: String(phone || "").trim().slice(0, 30), line: String(line || "").trim().slice(0, 40), email: String(email || "").trim().slice(0, 80),
    createdAt: now(), eventId: null, draftTexts: [], draftBasics: {}, pendingDecision: null, chat: [],
  };
  say(c, pair(
    `สวัสดีครับคุณ${c.name} 👋 ORCA เองครับ\n${GREETING_TH}`,
    `Hi ${c.name} 👋 I'm ORCA.\n${GREETING_EN}`));
  store.data.customers ??= [];
  store.data.customers.unshift(c);
  return c;
}

export const findCustomer = (id) => (store.data.customers || []).find((c) => c.id === id);
const customerOf = (e) => (store.data.customers || []).find((c) => c.id === e.customerId);

function say(c, msg, extra = {}) {
  c.chat.push({ id: newId("cm"), from: "orca", at: now(), th: msg.th, en: msg.en, ...extra });
}
function heard(c, text) {
  c.chat.push({ id: newId("cm"), from: "customer", at: now(), th: text, en: text });
}
const evTotal = (e) => Object.values(e.selected || {}).reduce((t, vid) => t + cg.totalOf(e, vid), 0);

// ---------------------------------------------------------------- suggestions (before any order)

// Best vendors for one service, skipping ones that already said no.
function rankedFor(e, key) {
  const base = baseOf(key);
  const sibling = (k) => k !== key && baseOf(k) === base;
  const skip = new Set([
    ...(e.declinedVendors || []),
    ...Object.entries(e.selected || {}).filter(([k]) => sibling(k)).map(([, vid]) => vid),
    ...Object.entries(e.proposal || {}).filter(([k, p]) => sibling(k) && p.status === "proposed").map(([, p]) => p.chosen),
  ]);
  const list = (rankVendors(e, store.vendors(), { perCategory: 20 })[base] || []).filter((m) => !skip.has(m.vendorId));
  if (!slotInfo(key)) return list;
  return list.map((m) => ({ ...m, score: m.score + slotFit(key, store.vendor(m.vendorId)) })).sort((a, b) => b.score - a.score);
}
function proposeCategory(e, cat, reason = "") {
  e.proposal ??= {};
  const list = rankedFor(e, cat).slice(0, OPTIONS).map((m) => m.vendorId);
  if (!list.length) return null;
  const prev = e.proposal[cat];
  const chosen = prev && list.includes(prev.chosen) ? prev.chosen : list[0];
  e.proposal[cat] = { options: list, chosen, status: "proposed", reason };
  return store.vendor(chosen);
}
const openProposals = (e) => Object.entries(e.proposal || {}).filter(([, p]) => p.status === "proposed");

export function chooseVendor(c, cat, vendorId) {
  const e = c.eventId && store.event(c.eventId);
  const p = e?.proposal?.[cat];
  const v = store.vendor(vendorId);
  if (!p || p.status !== "proposed" || !v || v.category !== baseOf(cat)) throw Object.assign(new Error("เลือกร้านนี้ไม่ได้ / This vendor can't be chosen here."), { status: 400 });
  if (!p.options.includes(vendorId)) p.options = [vendorId, ...p.options].slice(0, OPTIONS + 1);
  p.chosen = vendorId;
  return e;
}

// The customer confirms the vendors: now the orders go out.
export function confirmVendors(c) {
  const e = c.eventId && store.event(c.eventId);
  const open = e ? openProposals(e) : [];
  if (!open.length) throw Object.assign(new Error("ไม่มีร้านที่รอยืนยัน / Nothing to confirm."), { status: 409 });
  const miss = missingBasics({ date: e.date, guests: e.guests });
  if (miss.length) throw Object.assign(new Error(`ก่อนส่งออเดอร์ บอก ${miss.map((m) => m.th.replace(/ \(.*\)$/, "")).join(" และ ")} ในแชทก่อนนะครับ / Tell ORCA ${miss.map((m) => m.en.replace(/ \(.*\)$/, "")).join(" and ")} first.`), { status: 409 });
  const names = [];
  for (const [cat, p] of open) {
    const v = store.vendor(p.chosen);
    if (!v) continue;
    const old = e.selected?.[cat];
    if (old && old !== v.id && e.orders?.[old]) {
      setOrder(e, old, "cancelled", "Replaced by the customer");
      e.quotes = (e.quotes || []).filter((q) => q.vendorId !== old);
      const ov = store.vendor(old);
      if (ov) cg.send(e, ov, pair(`เรียน ${ov.shopName}\nลูกค้าย้ายงาน ${e.name} ไปสถานที่ที่รองรับ ${e.guests} คน จึงขอยกเลิกออเดอร์นี้ ขอบคุณที่ช่วยดูให้ครับ\nORCA`, `Dear ${ov.shopName}\nThe client moved ${e.name} to a venue for ${e.guests} guests, so this order is cancelled. Thank you for your help.\nORCA`), "update");
    }
    openOrder(e, v, cat);
    p.status = "ordered";
    names.push(v.shopName);
  }
  if (e.stage === "Sourcing" || e.stage === "Briefing") e.stage = "Quoting";
  logActivity(e, `${c.name} confirmed ${names.length} vendors; orders sent.`, c.name);
  say(c, pair(`ส่งออเดอร์ไปที่ ${names.length} ร้านแล้วครับ 📨\n${names.map((n) => `• ${n}`).join("\n")}\nร้านยืนยันเมื่อไรจะแจ้งตรงนี้ แล้วค่อยชำระมัดจำ ${Math.round(DEPOSIT * 100)}% ครับ`,
    `Orders sent to ${names.length} vendors 📨\n${names.map((n) => `• ${n}`).join("\n")}\nI'll tell you here as soon as they confirm; then you pay a ${Math.round(DEPOSIT * 100)}% deposit.`), { orders: true });
  return e;
}

// ---------------------------------------------------------------- orders

function orderNo() {
  const m = store.data.meta || (store.data.meta = {});
  m.orderSeq = (m.orderSeq || 1000) + 1;
  const d = new Date();
  return `ORC-${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${m.orderSeq}`;
}
function setOrder(e, vid, status, note = "") {
  e.orders ??= {};
  const o = (e.orders[vid] ||= { no: orderNo(), at: now(), history: [], paid: 0 });
  o.status = status;
  o.updatedAt = now();
  o.history.push({ at: now(), status, note });
  return o;
}
function openOrder(e, v, slot = v.category) {
  cg.addOrder(e, v, slot);
  const a = e.adjust?.[v.id];
  if (a) {
    const q = cg.mainQuote(e, v.id);
    if (q && a.perGuest) q.unitPrice -= a.perGuest;
    if (a.saving) e.quotes.push({ id: newId("q"), vendorId: v.id, category: v.category, item: `Trim: ${a.notes.map((n) => n.en).join(", ")}`, itemTh: `ลด: ${a.notes.map((n) => n.th).join(", ")}`, qty: 1, unitPrice: -a.saving, status: "committed", extra: true });
  }
  cg.send(e, v, cg.enquiry(e, v), "enquiry", [{ type: "enquiry", ...pair("ว่างวันงานไหม และยืนยันราคา", "Availability and price") }]);
  setOrder(e, v.id, "pending", "Order sent");
}

// The vendor can't do it: drop them and suggest the next best ones. The customer confirms again.
function replaceVendor(e, vid) {
  const v = store.vendor(vid);
  const cat = Object.keys(e.selected || {}).find((k) => e.selected[k] === vid) || Object.keys(e.proposal || {}).find((k) => e.proposal[k].chosen === vid) || v?.category;
  e.declinedVendors = [...new Set([...(e.declinedVendors || []), vid])];
  if (e.orders?.[vid] && !["declined", "cancelled"].includes(e.orders[vid].status)) setOrder(e, vid, "cancelled", "Replaced");
  if (e.selected?.[cat] === vid) delete e.selected[cat];
  e.quotes = (e.quotes || []).filter((q) => q.vendorId !== vid);
  return proposeCategory(e, cat, "replacement");
}

// ---------------------------------------------------------------- the conversation

const DATE_SLASH = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
function quickBasics(text) {
  const m = text.match(DATE_SLASH);
  if (!m) return {};
  let y = Number(m[3]); if (y > 2500) y -= 543;
  return { date: `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}` };
}

export async function handleMessage(c, text) {
  heard(c, text);
  const e = c.eventId ? store.event(c.eventId) : null;
  if (!e) return draftTurn(c, text);
  ensurePlan(e);
  if (c.pendingDecision?.type === "guests") {
    const d = c.pendingDecision; c.pendingDecision = null;
    const plus = /เพิ่มอีก|รวม|more|in total|plus/i.test(text);
    const exact = /เปลี่ยนเป็น|ทั้งหมด|exactly|change to/i.test(text);
    if (plus || exact) return changeTurn(c, e, `แขก ${plus ? d.from + d.n : d.n} คน`);
  }
  if (c.pendingDecision?.type === "clash") {
    const d = c.pendingDecision; c.pendingDecision = null;
    const keep = /คงแบบเดิม|คงเดิม|แบบเดิม|keep/i.test(text);
    const go = !keep && /เปลี่ยน|แบบใหม่|ใช่|โอเค|\bok\b|yes|change/i.test(text);
    if (keep) return changeTurn(c, e, d.text, { keepStyle: true, intro: pair("ได้ครับ คงสไตล์เดิมไว้ ส่วนที่เหลือปรับให้แล้ว 👇", "OK, keeping the style as it was; the rest is updated 👇") });
    if (go) return changeTurn(c, e, d.text, { clash: d.clash });
  }
  if (UNDO_RE.test(text)) return undoTurn(c, e);
  if (e.hold && RELEASE_RE.test(text)) return releaseHold(c, e);
  if (!e.hold && HOLD_RE.test(text)) { c.pendingDecision = null; return startHold(c, e); }
  if (c.pendingDecision?.type === "hold") {
    c.pendingDecision = null;
    if (/ทันที|เหมือนเดิม|right away|as before/i.test(text)) {
      e.holdDeclined = true;
      say(c, pair("ได้ครับ ORCA จะแจ้งร้านทุกครั้งที่แก้เหมือนเดิม", "OK, I'll keep updating the vendors each time."));
      return;
    }
  }
  if (c.pendingDecision?.type === "plan") {
    const d = c.pendingDecision;
    const which = /แผน ?b|plan b|ตัวเลือก ?b/i.test(text) ? "B" : /แผน ?a|plan a|อนุมัติ|approve|ok|โอเค|ตกลง/i.test(text) ? "A" : null;
    const no = /ยังไม่|ไม่เปลี่ยน|ยกเลิก|cancel|keep|not now/i.test(text);
    if (which || no) { c.pendingDecision = null; return no && !which ? planCancel(c, e) : applyPlan(c, e, d.g1, which); }
    c.pendingDecision = null;
  }
  if (c.pendingDecision && decideTurn(c, e, text)) return;
  const g1 = wantsPlan(e, text);
  if (g1) return planTurn(c, e, text, g1);
  const slot = detectSlot(text);
  if (slot) return slotTurn(c, e, text, slot);
  const clash = findClash(e, text);
  if (clash) return askClash(c, e, text, clash);
  const n = Number((text.match(/(\d{1,4})\s*(คน|ท่าน|guests?|people|pax)/i) || [])[1]);
  if (n && e.guests && n < e.guests && /เพิ่ม|\badd\b|more|extra/i.test(text) && !/ลด|เหลือ|reduce|fewer|less|down/i.test(text)) {
    c.pendingDecision = { type: "guests", n, from: e.guests };
    say(c, pair(
      `ขอเช็คก่อนนิดนึงครับ ตอนนี้แขก ${e.guests} ท่าน หมายถึงแบบไหนครับ?\n• เพิ่มอีก ${n} ท่าน (รวม ${e.guests + n} ท่าน)\n• เปลี่ยนเป็น ${n} ท่าน (ลดลง ${e.guests - n} ท่าน)`,
      `Quick check: you have ${e.guests} guests now. Did you mean:\n• ${n} more (${e.guests + n} in total)\n• change to ${n} (${e.guests - n} fewer)`),
      { quick: [`เพิ่มอีก ${n} คน (รวม ${e.guests + n})`, `เปลี่ยนเป็น ${n} คน`] });
    return;
  }
  return changeTurn(c, e, text);
}

// First message: decode the brief, show what ORCA picked up (highlights, Event DNA, a box of
// suggestions per service) and recommend vendors straight away. Date or guests can follow;
// orders wait until ORCA has both.
const missingBasics = (b) => [
  !b.date && pair("วันจัดงาน (เช่น 12 ธันวาคม)", "the date (e.g. 12 December)"),
  !b.guests && pair("จำนวนแขกโดยประมาณ", "roughly how many guests"),
].filter(Boolean);

async function draftTurn(c, text) {
  c.draftTexts.push(text);
  const [all, only] = await Promise.all([ai.decode({ texts: c.draftTexts }), ai.decode({ texts: [text] })]);
  const { _ai, _aiError, ...dna } = all;
  c.draftBasics = { ...c.draftBasics };
  for (const [k, v] of Object.entries({ ...(dna.basics || {}), ...(only.basics || {}), ...quickBasics(text) })) if (v != null && v !== "") c.draftBasics[k] = v;
  dna.basics = { ...dna.basics, ...c.draftBasics };
  const [tth, ten] = typeOf(dna.eventType);
  const assumedPlace = !dna.basics.location;
  if (assumedPlace) dna.basics.location = "Bangkok";
  dna.openQuestions = (dna.openQuestions || []).filter((q) => !dna.basics[q.field]);
  // a launch / artist debut gets a creative read: themes, concept ideas, a set of partners, a budget split
  const creative = creativeRead(c.draftTexts.join("\n\n"), dna);
  if (creative) {
    const { spans, requirements, styleTags, ...keep } = creative;
    const mine = new Set(requirements.map((r) => r.category));
    dna.requirements = [...(dna.requirements || []).filter((r) => r.source === "client" || !mine.has(r.category)), ...requirements.map((r) => ({ id: newId("r"), ...r, creative: true }))];
    dna.style = { ...dna.style, look: [...new Set([...(dna.style?.look || []), ...styleTags.look])], feel: [...new Set([...(dna.style?.feel || []), ...styleTags.feel])] };
    dna.chips = [...(dna.basics.guests ? [`${dna.basics.guests} PAX`] : []), ...creative.core];
    dna.creative = keep;
  }
  const e = ensurePlan({
    id: newId("e"), concierge: true, selfServe: true, customerId: c.id,
    name: `${c.name} ${dna.eventType ? dna.eventType[0].toUpperCase() + dna.eventType.slice(1) : "Event"}`,
    client: c.name, type: dna.eventType || "event",
    date: dna.basics.date, location: dna.basics.location, guests: dna.basics.guests, budget: dna.basics.budget,
    stage: "Sourcing", status: "active", team: ["ORCA"], createdAt: now(),
    input: c.draftTexts.join("\n\n"), texts: [...c.draftTexts], dna,
    briefVersions: [{ v: 1, at: now(), note: "Decoded from the customer's chat", dna: structuredClone(dna) }],
    feedback: [], selected: {}, shortlist: {}, quotes: [], activity: [], references: [], conciergeLog: [], orders: {}, proposal: {}, payments: [],
  });
  logActivity(e, `${c.name} started the event in the customer chat.`, c.name);
  store.events().unshift(e);
  c.eventId = e.id;
  for (const cat of Object.keys(rankVendors(e, store.vendors(), { perCategory: 1 }))) proposeCategory(e, cat);
  const n = openProposals(e).length;
  const missing = missingBasics(dna.basics);
  const brief = c.draftTexts.join("\n\n");
  if (creative) return creativeTurn(c, e, { brief, dna, creative, missing, assumedPlace, n, ai: _ai, aiError: _aiError });
  say(c, pair(
    `เข้าใจแล้วครับ ✨ นี่คือสิ่งที่ ORCA จับได้จากที่เล่ามา (ส่วนที่ไฮไลต์)`,
    `Got it ✨ Here's what I picked up from your message (highlighted).`),
  {
    brief: { text: brief, marks: highlightsOf(brief) },
    dna: dnaCard(dna), proposal: true, ai: _ai,
    after: pair(
      `${tth}${e.guests ? ` · ${e.guests} ท่าน` : ""}${e.date ? ` · ${cg.dTH(e.date)}` : ""} · ${cg.placeTH(e.location)}${assumedPlace ? " (ตั้งไว้ก่อน เปลี่ยนได้)" : ""}\nORCA แนะนำร้านที่เหมาะกับแต่ละหมวดไว้ใต้กล่องแล้ว และมีตัวเลือกอื่นอีกหมวดละ ${OPTIONS - 1} ร้านในแผง “ร้านที่ ORCA แนะนำ” กดดูผลงานและรีวิวได้เลยครับ${missing.length ? `\n\nก่อนส่งออเดอร์ ขอข้อมูลเพิ่มอีกนิดครับ:\n${missing.map((m) => `• ${m.th}`).join("\n")}` : "\n\nเลือกร้านที่ชอบแล้วกด “ยืนยันร้านและส่งออเดอร์” ได้เลยครับ"}`,
      `A ${ten}${e.guests ? ` · ${e.guests} guests` : ""}${e.date ? ` · ${cg.dEN(e.date)}` : ""} · ${e.location}${assumedPlace ? " (assumed)" : ""}.\nI've put my recommended vendor under each box, with ${OPTIONS - 1} more options per service in “Vendors ORCA suggests”. Check their work and reviews.${missing.length ? `\n\nBefore I send orders I need:\n${missing.map((m) => `• ${m.en}`).join("\n")}` : "\n\nPick the ones you like, then press “Confirm and send orders”."}`),
    quick: !dna.basics.guests ? ["50 คน", "100 คน", "150 คน", "200 คน"] : [],
  });
  if (!n) say(c, pair("ยังไม่มีร้านที่ตรงกับงานนี้ในระบบ ทีม ORCA จะติดต่อกลับครับ", "No matching shops yet; the ORCA team will get back to you."));
  return { ai: _ai, aiError: _aiError };
}

// Highlighted spans from two readers, merged.
function mergeSpans(spans) {
  const out = [];
  for (const sp of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = out.at(-1);
    if (last && sp[0] <= last[1] + 1) last[1] = Math.max(last[1], sp[1]); else out.push([...sp]);
  }
  return out;
}

// First reply for a launch: brief → DNA extraction → Event DNA → ideas → partner set → budget.
function creativeTurn(c, e, { brief, dna, creative, missing, assumedPlace, n, ai: aiMode, aiError }) {
  const k = creative;
  say(c, pair(
    `เข้าใจแล้วครับ ✨ ORCA อ่านบรีฟแล้ว นี่คือคำสำคัญที่จับได้ (ส่วนที่ไฮไลต์) และสิ่งที่ ORCA ตีความออกมาครับ`,
    `Got it ✨ Here are the key words I picked up (highlighted) and what I read into them.`),
  {
    brief: { text: brief, marks: mergeSpans([...highlightsOf(brief), ...k.spans]) },
    dna: dnaCard(dna), proposal: true, ai: aiMode,
    after: pair(
      `ข้อเสนอเหล่านี้เป็นแนวทางที่ ORCA สร้างจากบรีฟ ไม่ใช่ข้อสรุปที่ต้องยอมรับ เลือก ปรับ หรือปฏิเสธข้อไหนก็ได้ บอกในแชทได้เลยครับ\nทีมที่แนะนำยังไม่ได้สั่งจอง กดดูผลงานและรีวิวได้ในแผง “ร้านที่ ORCA แนะนำ”${assumedPlace ? "\nสถานที่ตั้งเป็นกรุงเทพฯ ไว้ก่อน เปลี่ยนได้" : ""}${missing.length ? `\n\nก่อนส่งออเดอร์ ขอข้อมูลเพิ่มอีกนิดครับ:\n${missing.map((m) => `• ${m.th}`).join("\n")}` : "\n\nพร้อมเมื่อไรกด “ยืนยันร้านและส่งออเดอร์” ได้เลยครับ"}`,
      `These are directions I drew from the brief, not decisions: pick, adjust or reject any of them here in the chat.\nNothing is booked yet; check each partner's work and reviews in “Vendors ORCA suggests”.${assumedPlace ? "\nLocation set to Bangkok for now." : ""}${missing.length ? `\n\nBefore I send orders I need:\n${missing.map((m) => `• ${m.en}`).join("\n")}` : "\n\nWhen you're ready, press “Confirm and send orders”."}`),
    quick: missing.some((m) => /date|วัน/.test(m.en + m.th)) ? [] : [],
  });
  if (!n) say(c, pair("ยังไม่มีร้านที่ตรงกับงานนี้ในระบบ ทีม ORCA จะติดต่อกลับครับ", "No matching shops yet; the ORCA team will get back to you."));
  e.name = [k.name, k.type.en].filter(Boolean).join(" · ");
  logActivity(e, `ORCA read the brief as a ${k.type.en} and suggested ${k.ideas.length} ideas.`, "ORCA");
  return { ai: aiMode, aiError };
}

const splitChips = (chips) => (chips || []).flatMap((c) => String(c).split(" · "));
// Thai wording added at view time, so chats saved before this still read in Thai.
const dnaTh = (d) => ({
  ...d, chips: splitChips(d.chips), chipsTh: splitChips(d.chips).map(chipTh), avoidTh: (d.avoid || []).map(avoidTh),
  boxes: (d.boxes || []).map((b) => ({ ...b, items: b.items.map((i) => ({ ...i, th: reqTh(i.text) })) })),
});
const BOX_ORDER = ["venue", "catering", "entertainment", "experience", "decor", "photography", "av", "transport"];
function dnaCard(dna) {
  const s = dna.style || {};
  const boxes = BOX_ORDER.map((cat) => ({ category: cat, items: (dna.requirements || []).filter((r) => r.category === cat).map((r) => ({ text: r.text, source: r.source, quote: r.quote || null })) })).filter((b) => b.items.length);
  return { creative: dna.creative || null, budget: dna.basics?.budget || null, guests: dna.basics?.guests || null, location: dna.basics?.location || null, chips: splitChips(dna.chips), mood: [...(s.mood || []), ...(s.feel || [])].slice(0, 5), look: (s.look || []).slice(0, 4), avoid: (s.avoid || []).slice(0, 5), needs: (dna.requirements || []).map((r) => r.text).slice(0, 8), boxes };
}

// After the event exists: every message may change suggestions or orders.
// ---------------------------------------------------------------- back and forth
// The client briefs until they're happy. ORCA follows taste changes straight away, but speaks up in
// plain chat text when a change goes against their own earlier words or keeps flipping, offers to
// hold the vendor updates meanwhile, and can undo the last change.
const UNDO_RE = /เอาแบบเมื่อกี้|กลับไปแบบเดิม|ย้อนกลับ|เอาแบบก่อนหน้า|ยกเลิกที่แก้|\bundo\b|go back|revert/i;
const HOLD_RE = /พักแจ้งร้าน|พักการแจ้ง|hold (the )?(vendor )?updates/i;
const RELEASE_RE = /ส่งร้านได้|ส่งอัปเดตให้ร้าน|แจ้งร้านได้|พอใจแล้ว|send (it|the updates)|i'?m done/i;
// a word the client avoided, now wanted, is kept as its positive form
const POSITIVE_AS = { "over-the-top": "grand", "too simple": "minimal", "old-fashioned": "classic", stuffy: "calm" };

function findClash(e, text) {
  const st = e.dna?.style || {};
  const root = (t) => t.replace(/^too /, "");
  const avoid = (st.avoid || []).map(root);
  const liked = [...(st.mood || []), ...(st.feel || []), ...(st.look || [])];
  for (const m of styleMentions(text)) {
    const want = !m.negated && avoid.includes(root(m.tag));
    const drop = m.negated && liked.includes(m.tag);
    if (!want && !drop) continue;
    const then = saidAbout(e.texts || [], m.tag);
    if (then) return { kind: want ? "want" : "drop", tag: m.tag, dim: m.dim, now: m.phrase, then: then.phrase };
  }
  return null;
}

function askClash(c, e, text, cl) {
  c.pendingDecision = { type: "clash", text, clash: cl };
  const decor = e.selected?.decor && store.vendor(e.selected.decor);
  say(c, pair(
    `ขอเช็คก่อนนะครับ 🙏\nตอนบรีฟ คุณบอกว่า “${cl.then}”\nแต่รอบนี้บอกว่า “${cl.now}”\n${decor ? `ถ้าเปลี่ยน ORCA จะถาม ${decor.shopName} ว่าปรับแบบได้ไหม และมีผลกับราคาไหม\n` : ""}จะเปลี่ยนเป็นแบบใหม่ หรือคงแบบเดิมไว้ครับ?`,
    `Quick check 🙏\nIn your brief you said “${cl.then}”\nbut now you said “${cl.now}”\n${decor ? `If we change, I'll ask ${decor.shopName} whether they can adapt and what it costs.\n` : ""}Change to the new style, or keep the original?`),
    { quick: ["เปลี่ยนเป็นแบบใหม่", "คงแบบเดิม"] });
}

const clashPatch = (cl) => (next) => {
  const o = (next.overrides = structuredClone(next.overrides || {}));
  if (cl.kind === "want") {
    const tag = POSITIVE_AS[cl.tag] || cl.tag;
    o.want = [...(o.want || []).filter((x) => x.tag !== tag), { tag, dim: cl.dim, from: cl.tag }];
    o.drop = (o.drop || []).filter((x) => x.tag !== tag && x.tag !== cl.tag);
  } else {
    o.drop = [...(o.drop || []).filter((x) => x.tag !== cl.tag), { tag: cl.tag }];
    o.want = (o.want || []).filter((x) => x.tag !== cl.tag);
  }
};
const keepPatch = (next, prev) => {
  next.style = structuredClone(prev.style || {});
  next.chips = [...(next.chips || []).filter((x) => /PAX$/.test(x)), ...(prev.chips || []).filter((x) => !/PAX$/.test(x))];
  next.overrides = prev.overrides;
};

// what each order cost before a change, for the change card
function snapshot(e) {
  const before = Object.fromEntries(Object.keys(e.orders || {}).filter((vid) => e.orders[vid].status !== "cancelled").map((vid) => [vid, cg.totalOf(e, vid)]));
  return { before, totalBefore: evTotal(e) };
}

// the same detail changing again and again (150 → 120 → 150)
function noteHistory(e, lines) {
  e.changeHistory ??= [];
  const flips = [];
  for (const l of lines) {
    if (!["Guests", "Date", "Location"].includes(l.label)) continue;
    // only since the last hold was released: a fresh round of back and forth
    const hist = e.changeHistory.slice(e.historyFrom || 0).filter((h) => h.label === l.label);
    const step = { at: now(), label: l.label, labelTh: l.labelTh, from: l.fromTh || l.from, to: l.toTh || l.to, fromEn: l.from, toEn: l.to };
    e.changeHistory.push(step);
    const all = [...hist, step];
    if (all.length >= 3 || hist.some((h) => h.from === step.to)) {
      flips.push({ labelTh: l.labelTh, label: l.label, n: all.length, path: [all[0].from, ...all.map((h) => h.to)], pathEn: [all[0].fromEn, ...all.map((h) => h.toEn)] });
    }
  }
  return flips;
}

async function changeTurn(c, e, text, opts = {}) {
  const prevDna = structuredClone(e.dna);
  const snap = snapshot(e);
  const patch = opts.clash ? clashPatch(opts.clash) : opts.keepStyle ? keepPatch : null;
  const { result, ai: aiMode, aiError } = await cg.absorbChange(e, text, { autoBrief: false, notify: !e.hold, patch, toDna: opts.toDna });
  if (!result.lines.length) {
    if (opts.keepStyle) say(c, pair("ได้ครับ คงแบบเดิมไว้ ไม่มีอะไรเปลี่ยน ไม่ต้องแจ้งร้าน", "OK, keeping it as it was. Nothing changed, so vendors aren't told."));
    else if (opts.toDna) say(c, pair("ตอนนี้เหมือนแบบก่อนหน้าอยู่แล้วครับ ไม่มีอะไรต้องย้อน", "It's already the same as before; nothing to undo."));
    else say(c, pair("ORCA ยังไม่แน่ใจว่าอยากเปลี่ยนอะไรครับ 🙏 ลองบอกเป็น จำนวนแขก วันที่ สถานที่ หรือสิ่งที่อยากเพิ่ม/ลด ได้เลย", "I'm not sure what you'd like to change 🙏 Try a guest count, a date, a place, or something to add or remove."), { ai: aiMode });
    return { ai: aiMode, aiError };
  }
  if (!opts.toDna) e.undo = [...(e.undo || []), { kind: "change", dna: prevDna, text, at: now() }].slice(-10);
  if (e.hold) e.hold.rounds = (e.hold.rounds || 0) + 1;
  report(c, e, result, snap, { intro: opts.intro, aiMode });
  // keeps changing the same thing: offer to hold the vendor updates (plain text)
  const flips = noteHistory(e, result.lines);
  if (flips.length && !e.hold && !e.holdDeclined && !e.holdOffered && !c.pendingDecision) {
    const f = flips[0];
    c.pendingDecision = { type: "hold" };
    e.holdOffered = true;
    say(c, pair(
      `สังเกตว่า${f.labelTh}เปลี่ยนมา ${f.n} รอบแล้วครับ (${f.path.join(" → ")}) 🙂\nถ้ายังคิดอยู่ ให้ ORCA พักการแจ้งร้านไว้ก่อนไหมครับ? แก้ได้เรื่อยๆ ราคาในแชทอัปเดตให้ดูทุกครั้ง พอพอใจแล้วค่อยส่งให้ร้านทีเดียว ร้านจะได้ไม่สับสน`,
      `I notice the ${f.label.toLowerCase()} has changed ${f.n} times (${f.pathEn.join(" → ")}) 🙂\nWhile you decide, shall I hold the vendor updates? Change as much as you like; prices update here each time, and the vendors get one summary when you're happy.`),
      { quick: ["พักแจ้งร้านไว้ก่อน", "แจ้งร้านทันทีเหมือนเดิม"] });
  }
  return { ai: aiMode, aiError };
}

function report(c, e, result, { before, totalBefore }, { intro = null, aiMode = null } = {}) {
  const th = []; const en = []; const ask = []; const rows = [];
  const row = (o, kind, rth, ren) => rows.push({ vendorId: o.vendorId, shopName: o.shopName, category: store.vendor(o.vendorId)?.category, kind, th: rth, en: ren });
  for (const o of result.outcomes) {
    if (e.hold && o.outcome !== "none") {
      row(o, "held", `พักไว้ ยังไม่แจ้งร้าน · ${[...o.autosTh, ...o.asksTh].join(" · ")}`, `On hold, not sent yet · ${[...o.autos, ...o.asks].join(" · ")}`);
      th.push(`⏸ ${o.shopName}: พักไว้ ยังไม่แจ้งร้าน`); en.push(`⏸ ${o.shopName}: on hold, not sent yet`);
    } else if (o.outcome === "auto") {
      row(o, "auto", o.autosTh.join(" · "), o.autos.join(" · "));
      setOrder(e, o.vendorId, e.orders?.[o.vendorId]?.status || "pending", "Updated by ORCA");
      th.push(`✅ ${o.shopName}: ${o.autosTh.join(" · ")}`); en.push(`✅ ${o.shopName}: ${o.autos.join(" · ")}`);
    } else if (o.outcome === "clarify") {
      setOrder(e, o.vendorId, "needs_reply", "ORCA asked the vendor");
      if (o.conflict) {
        ask.push(o.vendorId);
        row(o, "conflict", "ข้อมูลของ ORCA บอกว่าร้านไม่ว่างวันใหม่ กำลังถามร้านให้ยืนยันอีกครั้ง", "My records say they're booked on the new date; asked them to double-check.");
        th.push(`⚠️ ${o.shopName}: ข้อมูลของ ORCA บอกว่าร้านไม่ว่างวันใหม่ กำลังถามร้านให้ยืนยันอีกครั้ง`);
        en.push(`⚠️ ${o.shopName}: my records say they're booked on the new date. I've asked them to double-check.`);
      } else {
        row(o, "ask", `ส่งคำถามไปที่ร้านแล้ว: ${o.asksTh.join(" / ")}`, `Asked the vendor: ${o.asks.join(" / ")}`);
        th.push(`⏳ ${o.shopName}: ส่งคำถามไปที่ร้านแล้ว (${o.asksTh.join(" / ")})`);
        en.push(`⏳ ${o.shopName}: I've asked them (${o.asks.join(" / ")})`);
      }
    }
  }
  // services nobody is ordered for yet (before confirming, or a newly asked-for service): re-suggest
  let resuggested = 0;
  for (const cat of result.uncovered || []) {
    const before = e.proposal?.[cat]?.chosen;
    const isNew = !e.proposal?.[cat];
    const v = proposeCategory(e, cat, isNew ? "new" : "");
    if (!v) continue;
    resuggested++;
    rows.push({ vendorId: v.id, shopName: v.shopName, category: cat, kind: isNew ? "new" : before && before !== v.id ? "swap" : "rerank",
      th: isNew ? `เพิ่มบริการใหม่ ORCA แนะนำร้านนี้ กดยืนยันได้ที่แผงด้านข้าง` : `ร้านที่แนะนำตามข้อมูลล่าสุด`, en: isNew ? "New service: my suggestion, confirm it in the side panel" : "Best fit for the new details" });
    if (isNew) { th.push(`🆕 เพิ่ม${cg.CAT[cat]?.[0] || ""}: ORCA แนะนำ ${v.shopName} (ดูแล้วกดยืนยันได้เลย)`); en.push(`🆕 New ${cg.CAT[cat]?.[1] || cat}: I suggest ${v.shopName} (check and confirm)`); }
    else if (before && before !== v.id) { th.push(`🔁 ${cg.CAT[cat]?.[0] || cat}: ร้านที่เหมาะที่สุดเปลี่ยนเป็น ${v.shopName}`); en.push(`🔁 ${cg.CAT[cat]?.[1] || cat}: the best fit is now ${v.shopName}`); }
  }
  if (resuggested && !result.outcomes.some((o) => o.outcome !== "none")) { th.push("ORCA จัดอันดับร้านที่แนะนำใหม่ตามข้อมูลล่าสุดแล้วครับ"); en.push("I've re-ranked the suggested vendors for the new details."); }
  const untouched = result.outcomes.filter((o) => o.outcome === "none").length;
  if (untouched && !e.hold) { th.push(`ร้านอื่นอีก ${untouched} ร้านไม่ได้รับผลกระทบ ไม่ต้องแจ้ง`); en.push(`${untouched} other vendors aren't affected, so I left them alone.`); }
  if (result.budgetOnly) { th.push(`บันทึกงบใหม่แล้วครับ (เป็นข้อมูลภายใน ไม่แจ้งร้าน)`); en.push("Saved the new budget (kept internal, vendors aren't told)."); }
  if (Object.keys(e.selected).length) { th.push(`ยอดรวมตอนนี้ ${thb(evTotal(e))}`); en.push(`Running total: ${thb(evTotal(e))}`); }
  for (const r of rows) {
    if (before[r.vendorId] != null) { r.before = before[r.vendorId]; r.after = cg.totalOf(e, r.vendorId); }
    if (e.orders?.[r.vendorId] && r.kind !== "rerank") e.orders[r.vendorId].lastChange = { at: now(), kind: r.kind, before: r.before ?? null };
  }
  const change = {
    intro: intro || (e.hold ? pair("รับทราบครับ ⏸ ปรับในแผนให้แล้ว ยังไม่แจ้งร้าน 👇", "Noted ⏸ Updated the plan, vendors not told yet 👇") : rows.length ? pair("รับทราบครับ ORCA อัปเดตให้แล้ว 👇", "Done. Here's what I updated 👇") : pair("รับทราบครับ บันทึกแล้ว 👇", "Noted 👇")),
    lines: result.lines.map((l) => ({ label: l.label, labelTh: l.labelTh || l.label, from: l.from, fromTh: l.fromTh || l.from, to: l.to, toTh: l.toTh || l.to })),
    rows, untouched: e.hold ? 0 : untouched, budgetOnly: Boolean(result.budgetOnly),
    totalBefore: Object.keys(before).length ? totalBefore : null, totalAfter: Object.keys(before).length ? evTotal(e) : null,
  };
  say(c, pair(`รับทราบครับ ปรับตามนี้:\n${result.lines.map((l) => `• ${l.labelTh || l.label}: ${l.fromTh || l.from} → ${l.toTh || l.to}`).join("\n")}\n\n${th.join("\n")}`,
    `Done. Here's what changed:\n${result.lines.map((l) => `• ${l.label}: ${l.from} → ${l.to}`).join("\n")}\n\n${en.join("\n")}`),
    { change, quick: ask.length ? ["หาร้านใหม่ให้หน่อย", "รอร้านยืนยันก่อน"] : e.hold ? ["โอเค ส่งร้านได้", "เอาแบบเมื่อกี้"] : ["เอาแบบเมื่อกี้"], proposal: openProposals(e).length > 0, ai: aiMode });
  if (ask.length) c.pendingDecision = { type: "replace", vendorIds: ask };
}

function startHold(c, e) {
  e.hold = { at: now(), dna: structuredClone(e.dna), qty: Object.fromEntries((e.quotes || []).map((q) => [q.id, q.qty])), rounds: 0 };
  say(c, pair(
    "ได้ครับ ⏸ พักการแจ้งร้านไว้ก่อน\nแก้ได้ตามสบายเลย ORCA จะคำนวณราคาให้ดูในแชททุกครั้ง แต่ยังไม่บอกร้าน\nพอพอใจแล้วพิมพ์ “โอเค ส่งร้านได้” ORCA จะส่งสรุปรวมให้ร้านรอบเดียวครับ",
    "OK ⏸ Vendor updates are on hold.\nChange as much as you like; I'll price every change here but won't tell the vendors.\nWhen you're happy, say “send it” and they get one combined update."),
    { quick: ["โอเค ส่งร้านได้"] });
}

// The client is happy: one update per vendor for everything since the hold, or nothing at all
// if it all came back to where it started.
function releaseHold(c, e) {
  const h = e.hold;
  e.hold = null;
  e.holdOffered = false;
  e.historyFrom = (e.changeHistory || []).length;
  for (const q of e.quotes || []) if (h.qty[q.id] != null) q.qty = h.qty[q.id];
  const snap = snapshot(e);
  const result = cg.applyChange(e, h.dna, e.dna, { autoBrief: false });
  if (!result.lines.length) {
    say(c, pair(`สรุปแล้วทุกอย่างกลับมาเหมือนตอนก่อนพักครับ 🙂 ไม่มีอะไรต้องแจ้งร้าน (แก้ไป ${h.rounds} รอบ ร้านไม่ได้รับข้อความวุ่นๆ เลย)`,
      `It all came back to where it was 🙂 Nothing to tell the vendors (${h.rounds} changes, zero messages to them).`));
    return;
  }
  pushVersion(e, `Released held changes (${h.rounds} rounds)`);
  report(c, e, result, snap, { intro: pair(`ส่งสรุปรวมให้ร้านแล้วครับ 📨 แก้ไป ${h.rounds} รอบ ร้านได้ข้อความเดียว 👇`, `Sent one combined update 📨 ${h.rounds} changes, one message per vendor 👇`) });
}

// "เอาแบบเมื่อกี้": back to the brief before the last change (vendors are told only what differs).
function undoTurn(c, e) {
  const u = (e.undo || []).pop();
  if (!u) { say(c, pair("ยังไม่มีอะไรให้ย้อนครับ 🙂", "There's nothing to undo yet 🙂")); return; }
  if (u.kind === "slot") {
    const p = e.proposal?.[u.slot];
    const s = slotInfo(u.slot);
    if (p && p.status !== "proposed") {
      say(c, pair(`${s.th}รับออเดอร์ไปแล้วครับ ถ้าจะยกเลิก บอก ORCA ได้เลย ORCA จะคุยกับร้านให้`, `The ${s.en.toLowerCase()} already has the order. Tell me if you want to cancel and I'll talk to them.`));
      return;
    }
    if (e.proposal) delete e.proposal[u.slot];
    e.dna = u.dna;
    pushVersion(e, `Undo: removed ${s.en}`);
    say(c, pair(`ย้อนกลับให้แล้วครับ ↩️ เอา${s.th}ออกจากบรีฟแล้ว`, `Undone ↩️ Removed the ${s.en.toLowerCase()} from the brief.`), { proposal: openProposals(e).length > 0 });
    return;
  }
  return changeTurn(c, e, "(undo)", { toDna: u.dna, intro: pair("ย้อนกลับให้แล้วครับ ↩️ กลับไปเป็นแบบก่อนหน้า 👇", "Undone ↩️ Back to how it was 👇") });
}

// The customer answers a question ORCA asked them (find a new vendor, or wait / keep).
// "อยากได้ช่างภาพ behind the scene เพิ่ม": keep the main photographer, add the brief, suggest a
// second one who does exactly that. Nothing is ordered until the customer confirms.
function slotTurn(c, e, text, key) {
  const s = slotInfo(key);
  const base = baseOf(key);
  const prevDna = structuredClone(e.dna);
  e.texts = [...(e.texts || []), text];
  e.dna.requirements ??= [];
  if (!e.dna.requirements.some((r) => r.text === s.reqEn)) {
    e.dna.requirements.push({ id: newId("r"), category: base, text: s.reqEn, kind: "requirement", source: "client", quote: text.slice(0, 140) });
    pushVersion(e, `Client added: ${s.en}`);
  }
  const have = e.selected?.[key] && store.vendor(e.selected[key]);
  if (have) {
    say(c, pair(`มี${s.th} อยู่แล้วครับ: ${have.shopName} 🙂 ถ้าอยากเปลี่ยนร้าน บอก ORCA ได้เลย`, `You already have a ${s.en.toLowerCase()}: ${have.shopName}. Tell me if you'd like a different one.`));
    return;
  }
  const totalBefore = evTotal(e);
  const v = proposeCategory(e, key, "new");
  if (v) e.undo = [...(e.undo || []), { kind: "slot", slot: key, dna: prevDna, at: now() }].slice(-10);
  if (!v) {
    say(c, pair(`ตอนนี้ยังไม่มี${s.th} ที่ว่างตรงกับงานนี้ ทีม ORCA จะหาให้แล้วแจ้งกลับครับ`, `No ${s.en.toLowerCase()} fits this event yet; the ORCA team will find one.`));
    return;
  }
  const opt = optionView(e, key, v.id);
  const more = (e.proposal[key].options.length || 1) - 1;
  const mainId = e.selected?.[base] || e.proposal?.[base]?.chosen;
  const mainV = mainId && store.vendor(mainId);
  const rows = [{
    vendorId: v.id, shopName: v.shopName, category: base, slotTh: s.th, slotEn: s.en, kind: "new", after: opt.estimate,
    th: `${s.whyTh}${more ? ` · มีตัวเลือกอื่นอีก ${more} ร้าน` : ""}`, en: `${s.whyEn}${more ? ` · ${more} more options` : ""}`,
  }];
  if (mainV) rows.push({ vendorId: mainV.id, shopName: mainV.shopName, category: base, kind: "keep", after: e.selected?.[base] ? cg.totalOf(e, mainId) : null,
    th: "ยังเป็นช่างภาพหลักเหมือนเดิม ไม่ต้องแจ้งร้าน", en: "Stays your main photographer; nothing to tell them" });
  const change = {
    intro: pair(`รับทราบครับ เพิ่ม${s.th} ให้ในบรีฟแล้ว 👇`, `Got it. I've added a ${s.en.toLowerCase()} to the brief 👇`),
    lines: [{ label: "Brief", labelTh: "บรีฟเพิ่ม", from: "-", fromTh: "-", to: s.reqEn, toTh: s.reqTh }],
    rows, untouched: 0, budgetOnly: false, pending: key,
    totalBefore, totalAfter: totalBefore + (opt.estimate || 0),
  };
  say(c, pair(
    `รับทราบครับ เพิ่ม${s.th} ให้แล้ว\nORCA แนะนำ ${v.shopName} (${thb(opt.estimate)})${more ? ` และมีตัวเลือกอื่นอีก ${more} ร้าน` : ""}${mainV ? `\n${mainV.shopName} ยังเป็นช่างภาพหลักเหมือนเดิม` : ""}\nดูผลงานแล้วกด “ยืนยันร้านและส่งออเดอร์” ได้เลยครับ`,
    `Added a ${s.en.toLowerCase()}.\nI suggest ${v.shopName} (${thb(opt.estimate)})${more ? `, plus ${more} more options` : ""}.${mainV ? `\n${mainV.shopName} stays your main photographer.` : ""}\nCheck their work, then press “Confirm and send orders”.`),
    { change, proposal: true });
}

// What the event spends per service right now: sent orders first, then the chosen suggestions.
function planItems(e) {
  const items = []; const seen = new Set();
  for (const [key, vid] of Object.entries(e.selected || {})) {
    const o = e.orders?.[vid];
    const v = store.vendor(vid);
    if (!v || !o || ["cancelled", "declined"].includes(o.status)) continue;
    items.push({ key, vendor: v, amount: cg.totalOf(e, vid), unit: cg.mainQuote(e, vid)?.unitPrice, ordered: true });
    seen.add(key);
  }
  for (const [key, p] of openProposals(e)) {
    const v = store.vendor(p.chosen);
    if (!v || seen.has(key)) continue;
    const adj = e.adjust?.[v.id];
    items.push({ key, vendor: v, amount: optionView(e, key, v.id).estimate, unit: (v.packages?.[0]?.price ?? v.priceFrom ?? 0) - (adj?.perGuest || 0), ordered: false });
  }
  return items;
}
const guestsIn = (text) => Number((text.match(/(\d{2,5})\s*(คน|ท่าน|guests?|people|pax)/i) || [])[1]) || null;
// More guests and a budget to hold: plan before changing anything.
function wantsPlan(e, text) {
  const g1 = guestsIn(text);
  if (!g1 || !e.budget || !e.guests || g1 <= e.guests) return null;
  const capped = /ไม่ให้เกิน|ไม่เกิน|คุมงบ|ห้ามเกิน|within|no more than|stay under|keep the budget/i.test(text);
  const p = planGuests(e, g1, planItems(e), e.budget);
  const tight = p.spendBefore + p.growth > e.budget - p.keep;
  const venue = p.impacts.some((i) => i.category === "venue" && i.kind !== "info");
  return capped || tight || venue ? g1 : null;
}
const catName = (e, cat) => {
  const r = e.dna?.creative?.budget?.find((x) => x.category === cat);
  return r ? pair(r.th, r.en) : cat === "ops" ? pair("ระบบเข้างาน (ORCA)", "Entry & check-in (ORCA)") : pair(cg.CAT[cat]?.[0] || cat, cg.CAT[cat]?.[1] || cat);
};

function planTurn(c, e, text, g1) {
  e.texts = [...(e.texts || []), text];
  const p = planGuests(e, g1, planItems(e), e.budget);
  const heroCats = ["av", "entertainment"];
  const table = [
    ...p.lines.map((L) => ({ category: L.vendor.category, ...catName(e, L.vendor.category), shopName: L.vendor.shopName, before: L.amount, after: L.after, hero: heroCats.includes(L.vendor.category), cut: L.trims.map((t) => pair(t.th, t.en)) })),
    ...(p.ops ? [{ category: "ops", ...catName(e, "ops"), before: 0, after: p.ops }] : []),
  ];
  const drafts = p.lines.filter((L) => L.notes.length || L.asks.length).map((L) => ({
    vendorId: L.vendor.id, shopName: L.vendor.shopName, ordered: L.ordered, ask: L.asks.length > 0,
    th: [...L.notes.map((n) => n.th), ...L.asks.map((a) => a.th)].join(" · "), en: [...L.notes.map((n) => n.en), ...L.asks.map((a) => a.en)].join(" · "),
  }));
  const plan = {
    g0: p.g0, g1, budget: p.budget, impacts: p.impacts, cuts: p.cuts, table, drafts, untouched: p.untouched,
    spendBefore: p.spendBefore, spendAfter: p.spendAfter, growth: p.growth, reserveBefore: p.reserveBefore, reserveAfter: p.reserveAfter,
    planA: p.planA, planB: p.planB, ordered: p.lines.some((L) => L.ordered),
  };
  c.pendingDecision = { type: "plan", g1 };
  say(c, pair(
    `รับทราบครับ ผู้ร่วมงาน ${p.g0} → ${g1} คน งบไม่เกิน ${thb(p.budget)}\nORCA เช็คผลกระทบ เสนอทางเลือก คำนวณงบใหม่ และร่างข้อความถึงร้านไว้แล้ว ยังไม่ได้เปลี่ยนอะไรและยังไม่ได้แจ้งร้าน รอคุณอนุมัติก่อนครับ`,
    `Noted: ${p.g0} → ${g1} guests, budget capped at ${thb(p.budget)}.\nI've checked the impact, laid out options, re-done the budget and drafted the vendor messages. Nothing has changed and no vendor has been told until you approve.`),
  { plan, intro: pair("ORCA เช็คให้ก่อนนะครับ ยังไม่ได้เปลี่ยนอะไรและยังไม่ได้แจ้งร้าน 👇", "Let me check first. Nothing has changed and no vendor has been told yet 👇"),
    quick: ["อนุมัติแผน A", ...(p.planB ? ["เลือกแผน B"] : []), "ยังไม่เปลี่ยน"] });
}

function planCancel(c, e) {
  say(c, pair("ได้ครับ ยังไม่เปลี่ยนอะไร แผนเดิมยังอยู่ครบ ถ้าจำนวนคนชัดเจนแล้วบอก ORCA ได้เลยครับ", "OK, nothing changed; the plan stays as it is. Tell me when the numbers are firm."));
}

// The customer approved: apply the plan, message the vendors that are booked, keep the rest for their orders.
function applyPlan(c, e, g1, which) {
  const p = planGuests(e, g1, planItems(e), e.budget);
  const g0 = p.g0;
  e.guests = g1;
  e.dna.basics = { ...(e.dna.basics || {}), guests: g1 };
  for (const r of e.dna.requirements || []) if (/^\d+ seated guests$/i.test(r.text)) r.text = `${g1} seated guests`;
  e.dna.chips = [`${g1} PAX`, ...(e.dna.chips || []).filter((x) => !/PAX$/.test(x))];
  const rows = [];
  for (const L of p.lines) {
    const v = L.vendor;
    const moving = which === "B" && v.category === "venue" && p.planB;
    if (moving) continue;
    if (!(L.notes.length || L.asks.length)) continue;
    const notes = L.notes; const asks = L.asks;
    if (L.ordered) {
      const q = cg.mainQuote(e, v.id);
      if (q && (v.packages?.[0]?.unit || v.priceUnit) === "per guest") q.qty = g1;
      for (const t of L.trims) {
        if (t.perGuest && q) q.unitPrice -= t.perGuest;
        else e.quotes.push({ id: newId("q"), vendorId: v.id, category: v.category, item: `Trim: ${t.en}`, itemTh: `ลด: ${t.th}`, qty: 1, unitPrice: -t.saving, status: "committed", extra: true });
      }
      const msg = pair(
        [`เรียน ${v.shopName}`, `งาน ${e.name}: ลูกค้าอนุมัติการเปลี่ยนแปลงแล้ว`, `• ผู้ร่วมงาน ${g0} → ${g1} คน`, ...notes.map((n) => `• ${n.th}`),
          asks.length ? `รบกวนช่วยตอบ:\n${asks.map((a, i) => `(${i + 1}) ${a.th}`).join("\n")}` : "ไม่ต้องตอบกลับหากไม่มีปัญหาครับ", "ขอบคุณครับ\nORCA"].join("\n"),
        [`Dear ${v.shopName}`, `${e.name}: the client approved a change`, `• Guests ${g0} → ${g1}`, ...notes.map((n) => `• ${n.en}`),
          asks.length ? `Could you answer:\n${asks.map((a, i) => `(${i + 1}) ${a.en}`).join("\n")}` : "No reply needed unless something doesn't work.", "Thank you,\nORCA"].join("\n"));
      cg.send(e, v, msg, asks.length ? "clarify" : "update", asks);
      const o = setOrder(e, v.id, asks.length ? "needs_reply" : e.orders[v.id].status, `Plan ${which} approved`);
      o.lastChange = { at: now(), kind: asks.length ? "ask" : "auto", before: L.amount };
    } else {
      e.adjust ??= {};
      const a = (e.adjust[v.id] ||= { perGuest: 0, saving: 0, notes: [], asks: [] });
      for (const t of L.trims) { if (t.perGuest) a.perGuest += t.perGuest; else a.saving += t.saving; a.notes.push(pair(t.th, t.en)); }
      a.asks.push(...asks);
    }
    rows.push({ vendorId: v.id, shopName: v.shopName, category: v.category, kind: L.ordered ? (asks.length ? "ask" : "auto") : "plan",
      th: [...notes.map((n) => n.th), ...asks.map((x) => x.th)].join(" · "), en: [...notes.map((n) => n.en), ...asks.map((x) => x.en)].join(" · "),
      before: L.amount, after: L.ordered ? cg.totalOf(e, v.id) : optionView(e, L.key, v.id).estimate });
  }
  let swapNote = null;
  if (which === "B" && p.planB) {
    const L = p.lines.find((x) => x.vendor.category === "venue");
    const others = rankedFor(e, L.key).map((m) => m.vendorId).filter((id) => id !== p.planB.vendorId && id !== L.vendor.id && (store.vendor(id)?.capacity?.max || 0) >= g1);
    e.proposal ??= {};
    e.proposal[L.key] = { options: [p.planB.vendorId, ...others].slice(0, OPTIONS), chosen: p.planB.vendorId, status: "proposed", reason: "replacement" };
    rows.push({ vendorId: p.planB.vendorId, shopName: p.planB.shopName, category: "venue", kind: "swap", before: L.amount, after: p.planB.price,
      th: `สถานที่ใหม่ รับได้ ${p.planB.capacity} คน กดยืนยันในแผงด้านข้าง${L.ordered ? ` แล้ว ORCA จะแจ้งยกเลิก ${L.vendor.shopName} ให้` : ""}`,
      en: `New venue for up to ${p.planB.capacity}; confirm it in the side panel${L.ordered ? `, then I'll cancel ${L.vendor.shopName}` : ""}` });
    swapNote = L;
  }
  pushVersion(e, `Client approved plan ${which}: ${g0} → ${g1} guests within ${thb(e.budget)}`);
  logActivity(e, `${c.name} approved plan ${which} (${g0} → ${g1} guests).`, c.name);
  const spend = rows.length ? p.spendBefore + rows.reduce((t, r) => t + ((r.after ?? r.before) - r.before), 0) + p.ops : p.spendBefore;
  const asked = rows.filter((r) => r.kind === "ask").length;
  const change = {
    intro: pair(`อนุมัติแผน ${which} แล้วครับ${p.lines.some((L) => L.ordered) ? " ORCA ส่งรายละเอียดให้ร้านที่เกี่ยวข้องแล้ว" : " ORCA ปรับแผนให้แล้ว"} 👇`, `Plan ${which} approved.${p.lines.some((L) => L.ordered) ? " I've sent the details to the vendors involved" : " The plan is updated"} 👇`),
    lines: [{ label: "Guests", labelTh: "ผู้ร่วมงาน", from: String(g0), fromTh: `${g0} คน`, to: String(g1), toTh: `${g1} คน` }],
    rows, untouched: p.untouched.length, budgetOnly: false,
    notes: [
      p.ops ? pair(`ระบบเข้างาน: เพิ่มจุดลงทะเบียน 1 จุด ~${thb(p.ops)} (ORCA จัดการเอง ต้องยืนยันราคา)`, `Entry: one more check-in point ~${thb(p.ops)} (ORCA arranges it; price to confirm)`) : null,
      asked ? pair(`รอร้านยืนยัน ${asked} ร้าน ORCA จะแจ้งในแชทนี้ทันทีที่ร้านตอบ`, `Waiting on ${asked} vendors; I'll tell you here as soon as they answer.`) : null,
      pair(`งบรวม ${thb(e.budget)} · ใช้จริง ${thb(spend)} · เหลือสำรอง ${thb(e.budget - spend)}`, `Budget ${thb(e.budget)} · spend ${thb(spend)} · contingency ${thb(e.budget - spend)}`),
    ].filter(Boolean),
    totalBefore: p.spendBefore, totalAfter: spend,
  };
  say(c, pair(`อนุมัติแผน ${which}: ผู้ร่วมงาน ${g0} → ${g1} คน\n${rows.map((r) => `• ${r.shopName}: ${r.th}`).join("\n")}`, `Plan ${which}: ${g0} → ${g1} guests\n${rows.map((r) => `• ${r.shopName}: ${r.en}`).join("\n")}`),
    { change, proposal: openProposals(e).length > 0, orders: true });
  return swapNote;
}

function decideTurn(c, e, text) {
  const d = c.pendingDecision;
  const replace = /หาร้านใหม่|เปลี่ยนร้าน|ร้านใหม่|ร้านอื่น|new vendor|another|replace/i.test(text);
  const keep = /รอ|คงไว้|เดิม|ไม่เปลี่ยน|wait|keep/i.test(text);
  if (!replace && !keep) { c.pendingDecision = null; return false; }
  c.pendingDecision = null;
  if (keep) {
    say(c, pair("ได้ครับ ORCA จะรอร้านยืนยันก่อน แล้วแจ้งทันทีครับ", "OK, I'll wait for them to confirm and let you know."));
    return true;
  }
  const lines = [];
  for (const vid of d.vendorIds) {
    const old = store.vendor(vid);
    const next = replaceVendor(e, vid);
    lines.push(next ? pair(`🔁 แทน ${old?.shopName}: ORCA แนะนำ ${next.shopName} และอีก ${OPTIONS - 1} ร้านให้เลือก`, `🔁 Instead of ${old?.shopName}: I suggest ${next.shopName}, plus ${OPTIONS - 1} more to choose from`)
      : pair(`ยังหาร้านแทน ${old?.shopName} ไม่ได้ ทีม ORCA จะติดต่อกลับครับ`, `No replacement for ${old?.shopName} yet; the ORCA team will follow up.`));
  }
  say(c, pair(`จัดให้ครับ\n${lines.map((l) => l.th).join("\n")}\nดูผลงานแล้วกด “ยืนยันร้านและส่งออเดอร์” ได้เลยครับ`, `On it.\n${lines.map((l) => l.en).join("\n")}\nCheck their work, then press “Confirm and send orders”.`), { proposal: true });
  return true;
}

// ---------------------------------------------------------------- payment (held by ORCA until the event)

function payable(e) {
  const out = { deposit: [], balance: [] };
  for (const [vid, o] of Object.entries(e.orders || {})) {
    if (o.status !== "accepted") continue;
    const total = cg.totalOf(e, vid);
    const paid = o.paid || 0;
    if (!paid) out.deposit.push({ vendorId: vid, amount: Math.round(total * DEPOSIT) });
    else if (paid < total) out.balance.push({ vendorId: vid, amount: total - paid });
  }
  return out;
}
const sum = (list) => list.reduce((s, x) => s + x.amount, 0);

export function pay(c, { kind, method }) {
  const e = c.eventId && store.event(c.eventId);
  if (!e) throw Object.assign(new Error("ยังไม่มีงาน / No event yet."), { status: 409 });
  if (!["deposit", "balance"].includes(kind)) throw Object.assign(new Error("Unknown payment."), { status: 400 });
  const items = payable(e)[kind];
  if (!items.length) throw Object.assign(new Error("ไม่มียอดที่ต้องชำระตอนนี้ / Nothing to pay right now."), { status: 409 });
  const methods = { promptpay: ["พร้อมเพย์", "PromptPay"], card: ["บัตรเครดิต/เดบิต", "Card"], banking: ["โมบายแบงก์กิ้ง", "Mobile banking"] };
  const m = methods[method] ? method : "promptpay";
  const p = { id: `PAY-${Date.now().toString(36).toUpperCase()}`, kind, method: m, at: now(), amount: sum(items), items, held: true };
  e.payments ??= [];
  e.payments.push(p);
  for (const it of items) {
    const o = e.orders[it.vendorId];
    o.paid = (o.paid || 0) + it.amount;
    o.history.push({ at: now(), status: o.status, note: `${kind === "deposit" ? "Deposit" : "Balance"} paid ${thb(it.amount)} (held by ORCA)` });
    const v = store.vendor(it.vendorId);
    const t = store.threads().find((x) => x.eventId === e.id && x.vendorId === it.vendorId);
    if (t) t.messages.push({ id: newId("m"), from: "orca", status: "sent", at: now(), kind: "update",
      text: `💰 ลูกค้าชำระ${kind === "deposit" ? "มัดจำ" : "ยอดคงเหลือ"}แล้ว ${thb(it.amount)}\nORCA ถือเงินไว้ให้ จะโอนให้ร้านหลังจบงาน`,
      textEn: `💰 The customer paid the ${kind} of ${thb(it.amount)}.\nORCA holds it and pays you out after the event.` });
    if (kind === "balance") for (const q of cg.quotesOf(e, it.vendorId)) q.status = "paid";
    if (v) logActivity(e, `${c.name} paid ${kind} ${thb(it.amount)} for ${v.shopName} (held by ORCA).`, c.name);
  }
  say(c, pair(`✅ ชำระ${kind === "deposit" ? "มัดจำ" : "ยอดคงเหลือ"} ${thb(p.amount)} ผ่าน${methods[m][0]}เรียบร้อยครับ (ใบเสร็จ ${p.id})\nORCA ถือเงินไว้ให้ จะโอนให้ร้านหลังจบงาน ถ้าร้านยกเลิก คุณได้เงินคืนเต็มจำนวน`,
    `✅ Paid the ${kind} of ${thb(p.amount)} by ${methods[m][1]} (receipt ${p.id}).\nORCA holds it and pays the vendors after the event. If a vendor cancels, you get a full refund.`), { orders: true });
  return p;
}

// ---------------------------------------------------------------- vendor side

export function vendorOrders(vendorId) {
  const v = store.vendor(vendorId);
  return store.events().filter((e) => e.orders?.[vendorId]).map((e) => {
    const o = e.orders[vendorId];
    const t = store.threads().find((x) => x.eventId === e.id && x.vendorId === vendorId);
    const lastOrca = t ? [...t.messages].reverse().find((m) => m.from === "orca") : null;
    const lines = cg.quotesOf(e, vendorId).map((q) => ({ item: q.item, qty: q.qty, unitPrice: q.unitPrice, total: q.qty * q.unitPrice, extra: Boolean(q.extra) }));
    const c = customerOf(e);
    const total = lines.reduce((s, l) => s + l.total, 0);
    return {
      eventId: e.id, no: o.no, status: o.status, at: o.at, updatedAt: o.updatedAt, history: o.history,
      event: { name: e.name, type: e.type, date: e.date, location: e.location, guests: e.guests,
        style: { mood: e.dna?.style?.mood || [], look: e.dna?.style?.look || [], avoid: e.dna?.style?.avoid || [] },
        needs: (e.dna?.requirements || []).filter((r) => r.category === v?.category).map((r) => r.text) },
      customer: c ? c.name.split(" ")[0] : e.client,
      lines, total, paid: o.paid || 0, depositDue: Math.round(total * DEPOSIT),
      questions: (t?.pendingAsks || []).filter((a) => a.type !== "enquiry").map((a) => ({ th: a.th, en: a.en, type: a.type })),
      message: lastOrca ? { th: lastOrca.text, en: lastOrca.textEn, at: lastOrca.at, kind: lastOrca.kind } : null,
    };
  }).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

function vendorSays(e, v, msg, parsed = {}) {
  const t = store.threads().find((x) => x.eventId === e.id && x.vendorId === v.id);
  if (!t) return;
  t.messages.push({ id: newId("m"), from: "vendor", via: "portal", at: now(), text: msg.th, textEn: msg.en, parsed });
  t.status = "replied";
  t.pendingAsks = [];
}

function offerReplacement(c, e, oldV, why) {
  const next = replaceVendor(e, oldV.id);
  say(c, pair(`${oldV.shopName} ไม่สะดวกครับ${why ? ` (${why})` : ""}\n${next ? `ORCA คัดร้านใหม่ให้แล้ว แนะนำ ${next.shopName} และอีก ${OPTIONS - 1} ร้าน ดูผลงานแล้วกดยืนยันได้เลยครับ` : "ทีม ORCA กำลังหาร้านใหม่ให้ครับ"}`,
    `${oldV.shopName} can't do it${why ? ` (${why})` : ""}.\n${next ? `I've picked new options: ${next.shopName} plus ${OPTIONS - 1} more. Check their work and confirm.` : "The ORCA team is finding a replacement."}`), { proposal: Boolean(next), orders: true });
}

// accept / decline a new order, or answer ORCA's question about a change
export function vendorAction(vendorId, eventId, { action, ok = true, extra = 0, note = "" }) {
  const e = store.event(eventId);
  const v = store.vendor(vendorId);
  const o = e?.orders?.[vendorId];
  if (!o || !v) throw Object.assign(new Error("Order not found"), { status: 404 });
  const c = customerOf(e);
  const q = cg.mainQuote(e, vendorId);
  extra = Math.max(0, Number(extra) || 0);
  note = String(note || "").trim().slice(0, 300);
  if (action === "accept") {
    if (o.status !== "pending") throw Object.assign(new Error("This order isn't waiting for you."), { status: 409 });
    setOrder(e, vendorId, "accepted", "Vendor accepted");
    if (q) q.status = "committed";
    v.availability = { ...(v.availability || {}), [e.date]: "available" };
    vendorSays(e, v, pair(`รับออเดอร์ครับ ยืนยันวันที่ ${cg.dTH(e.date)} ยอด ${thb(cg.totalOf(e, vendorId))}${note ? `\n${note}` : ""}`, `Order accepted for ${cg.dEN(e.date)}, ${thb(cg.totalOf(e, vendorId))}${note ? `\n${note}` : ""}`), { available: true, price: cg.totalOf(e, vendorId) });
    if (c) say(c, pair(`✅ ${v.shopName} ยืนยันออเดอร์แล้วครับ (${thb(cg.totalOf(e, vendorId))}) ชำระมัดจำได้ที่แผงด้านข้าง`, `✅ ${v.shopName} confirmed your order (${thb(cg.totalOf(e, vendorId))}). You can pay the deposit from the side panel.`), { orders: true });
  } else if (action === "decline") {
    if (!["pending", "needs_reply"].includes(o.status)) throw Object.assign(new Error("This order can't be declined now."), { status: 409 });
    setOrder(e, vendorId, "declined", note || "Vendor declined");
    v.availability = { ...(v.availability || {}), [e.date]: "booked" };
    vendorSays(e, v, pair(`ขออภัยครับ รับงานนี้ไม่ได้${note ? `: ${note}` : ""}`, `Sorry, we can't take this one${note ? `: ${note}` : ""}.`), { available: false });
    if (c) offerReplacement(c, e, v, note);
  } else if (action === "answer") {
    if (o.status !== "needs_reply") throw Object.assign(new Error("There's no question waiting for you."), { status: 409 });
    const t = store.threads().find((x) => x.eventId === e.id && x.vendorId === vendorId);
    const asked = (t?.pendingAsks || []).filter((a) => a.type !== "enquiry");
    if (ok) {
      if (extra) e.quotes.push({ id: newId("q"), vendorId, category: v.category, item: `Extra: ${asked.map((a) => a.text || a.type).join(", ").slice(0, 60) || "change"}`, qty: 1, unitPrice: extra, status: "committed", extra: true });
      setOrder(e, vendorId, "accepted", extra ? `Confirmed the change, +${extra}` : "Confirmed the change");
      if (q) q.status = "committed";
      if (asked.some((a) => a.type === "date")) v.availability = { ...(v.availability || {}), [e.date]: "available" };
      vendorSays(e, v, pair(`ได้ครับ${extra ? ` ค่าใช้จ่ายเพิ่ม ${thb(extra)}` : " ไม่มีค่าใช้จ่ายเพิ่ม"}${note ? `\n${note}` : ""}`, `Yes, we can${extra ? `, +${thb(extra)}` : " at no extra cost"}${note ? `\n${note}` : ""}.`), { available: true, price: cg.totalOf(e, vendorId) });
      if (c) say(c, pair(`✅ ${v.shopName} ยืนยันการเปลี่ยนแปลงแล้ว${extra ? ` (ค่าใช้จ่ายเพิ่ม ${thb(extra)})` : " ไม่มีค่าใช้จ่ายเพิ่ม"}${note ? `\nร้านฝากบอก: ${note}` : ""}`,
        `✅ ${v.shopName} confirmed the change${extra ? ` (+${thb(extra)})` : " at no extra cost"}${note ? `\nThey added: ${note}` : ""}.`), { orders: true });
    } else {
      setOrder(e, vendorId, "needs_customer", note || "Vendor can't do the change");
      if (asked.some((a) => a.type === "date")) v.availability = { ...(v.availability || {}), [e.date]: "booked" };
      vendorSays(e, v, pair(`ทำไม่ได้ครับ${note ? `: ${note}` : ""}`, `We can't do that${note ? `: ${note}` : ""}.`), { available: false });
      if (c) {
        say(c, pair(`⚠️ ${v.shopName} แจ้งว่าทำตามที่เปลี่ยนไม่ได้${note ? ` (${note})` : ""}\nให้ ORCA คัดร้านใหม่ให้เลือกไหมครับ`, `⚠️ ${v.shopName} says they can't do the change${note ? ` (${note})` : ""}.\nShall I pick new vendors for you to choose from?`), { quick: ["หาร้านใหม่ให้หน่อย", "คงร้านเดิมไว้"], orders: true });
        c.pendingDecision = { type: "replace", vendorIds: [vendorId] };
      }
    }
  } else throw Object.assign(new Error("Unknown action"), { status: 400 });
  logActivity(e, `${v.shopName}: ${action}${action === "answer" ? (ok ? " (yes)" : " (no)") : ""}.`, v.shopName);
  return e;
}

// Demo: every vendor with something waiting answers, the way a real shop would.
export function simulateVendors(c) {
  const e = c.eventId && store.event(c.eventId);
  if (!e) return 0;
  let n = 0;
  for (const [vid, o] of Object.entries(e.orders || {})) {
    const v = store.vendor(vid);
    const booked = v?.availability?.[e.date] === "booked";
    if (o.status === "pending") { vendorAction(vid, e.id, booked ? { action: "decline", note: "วันนั้นมีงานแล้ว" } : { action: "accept" }); n++; }
    else if (o.status === "needs_reply") {
      const t = store.threads().find((x) => x.eventId === e.id && x.vendorId === vid);
      const asked = (t?.pendingAsks || []).map((a) => a.type);
      if (asked.includes("date") && booked) vendorAction(vid, e.id, { action: "answer", ok: false, note: "วันนั้นมีงานแล้ว" });
      else vendorAction(vid, e.id, { action: "answer", ok: true, extra: asked.includes("capacity") ? 20000 : asked.includes("req") ? 8000 : 0, note: asked.includes("capacity") ? "เปิดพื้นที่ lounge เพิ่มให้" : "" });
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- what the customer sees

// What a customer may see about a vendor: portfolio, packages, reviews, trust. No contacts or internals.
export function publicVendor(v) {
  return {
    id: v.id, shopName: v.shopName, category: v.category, area: v.area || v.location, location: v.location, description: v.description || "",
    portfolio: (v.portfolio || []).map((p) => ({ title: p.title || "", url: p.url || null })), palette: v.palette || [],
    packages: (v.packages || []).map((p) => ({ name: p.name, price: p.price, unit: p.unit, includes: p.includes || [], excludes: p.excludes || [] })),
    priceFrom: v.priceFrom ?? null, priceUnit: v.priceUnit, capacity: v.capacity || null, setting: v.setting || null,
    style: [...(v.dna?.mood || []), ...(v.dna?.feel || []), ...(v.dna?.look || [])],
    rating: v.rating ?? null, reviewCount: v.reviewCount || (v.reviews || []).length, reviews: v.reviews || [],
    eventsDone: v.eventsDone || 0, responseTime: v.responseTime || "", verified: Boolean(v.verified), trust: v.trust || null,
    serviceArea: v.serviceArea || [], breakdown: ratingBreakdown(v),
  };
}

// How the review count splits across 1-5 stars, consistent with the average rating.
function ratingBreakdown(v) {
  const n = v.reviewCount || (v.reviews || []).length;
  if (!n || !v.rating) return null;
  const p5 = Math.min(0.95, Math.max(0.35, (v.rating - 4) * 0.95));
  const rest = 1 - p5;
  const shares = [p5, rest * 0.8, rest * 0.15, rest * 0.04, rest * 0.01];
  const counts = shares.map((x) => Math.round(x * n));
  counts[0] += n - counts.reduce((a, b) => a + b, 0);
  return { 5: counts[0], 4: counts[1], 3: counts[2], 2: counts[3], 1: counts[4] };
}

// A shop card for browsing: enough to compare, nothing private.
export function shopCard(v) {
  return {
    id: v.id, shopName: v.shopName, category: v.category, area: v.area || v.location, rating: v.rating ?? null, reviewCount: v.reviewCount || 0,
    eventsDone: v.eventsDone || 0, verified: Boolean(v.verified), priceFrom: v.priceFrom ?? null, priceUnit: v.priceUnit,
    palette: v.palette || [], portfolio: (v.portfolio || []).slice(0, 1).map((p) => ({ title: p.title || "", url: p.url || null })),
    style: [...(v.dna?.mood || []), ...(v.dna?.look || [])].slice(0, 4), description: v.description || "",
  };
}

function optionView(e, cat, vid) {
  const v = store.vendor(vid);
  if (!v) return null;
  const m = (rankVendors(e, [v], { perCategory: 1 })[baseOf(cat)] || [])[0];
  const s = slotInfo(cat); const fit = slotFit(cat, v);
  const pkg = v.packages?.[0];
  const perGuest = (pkg?.unit || v.priceUnit) === "per guest";
  return {
    vendorId: vid, shopName: v.shopName, area: v.area || v.location, rating: v.rating ?? null, reviewCount: v.reviewCount || 0, verified: Boolean(v.verified), eventsDone: v.eventsDone || 0,
    palette: v.palette || [], portfolio: (v.portfolio || []).map((p) => ({ title: p.title || "", url: p.url || null })),
    desc: v.description || "", descTh: v.descriptionTh || null, workedWith: v.workedWith || {},
    item: pkg?.name || v.shopName, itemTh: pkgTh(pkg?.name) || v.shopName, adjusted: Boolean(e.adjust?.[vid]), whyTh: m ? [s && fit ? s.whyTh : null, templateWhyTh(m, v)].filter(Boolean).join(" · ") : "", estimate: ((pkg?.price ?? v.priceFrom ?? 0) - (e.adjust?.[vid]?.perGuest || 0)) * (perGuest ? e.guests || 1 : 1) - (e.adjust?.[vid]?.saving || 0),
    score: m ? Math.min(5, Math.round((m.score + fit) * 10) / 10) : null, why: m ? [s && fit ? s.whyEn : null, templateWhy(m, v)].filter(Boolean).join(" · ") : "",
  };
}

// Chats saved before the greeting was reworded show the current wording.
// The greeting is the first ORCA message: "สวัสดีครับคุณ… 👋 ORCA เองครับ" + one line.
const isGreeting = (m, i) => i === 0 && m.from === "orca";
const greetingTh = (t) => String(t || "").replace(/(ORCA เองครับ)\n[\s\S]*$/, `$1\n${GREETING_TH}`);
const greetingEn = (t) => String(t || "").replace(/(I'm ORCA\.)\n[\s\S]*$/, `$1\n${GREETING_EN}`);

export function customerView(c) {
  const e = c.eventId ? store.event(c.eventId) : null;
  const orders = e ? Object.entries(e.orders || {}).filter(([, o]) => o.status !== "cancelled").map(([vid, o]) => {
    const v = store.vendor(vid);
    const q = cg.mainQuote(e, vid);
    const total = cg.totalOf(e, vid);
    const slot = slotInfo(Object.keys(e.selected || {}).find((k) => e.selected[k] === vid));
    return {
      slotTh: slot?.th || null, slotEn: slot?.en || null,
      vendorId: vid, no: o.no, status: o.status, statusTh: STATUS[o.status]?.[0], statusEn: STATUS[o.status]?.[1],
      shopName: v?.shopName, category: v?.category, categoryTh: cg.CAT[v?.category]?.[0], palette: v?.palette || [], portfolio: (v?.portfolio || []).map((p) => ({ title: p.title || "", url: p.url || null })),
      item: q?.item, itemTh: pkgTh(q?.item), qty: q?.qty, total, paid: o.paid || 0, extras: cg.quotesOf(e, vid).filter((x) => x.extra).map((x) => ({ item: x.item, itemTh: x.itemTh || null, amount: x.qty * x.unitPrice })),
      rating: v?.rating ?? null, reviewCount: v?.reviewCount || 0,
      desc: v?.description || "", descTh: v?.descriptionTh || null, workedWith: v?.workedWith || {},
      lastChange: o.lastChange || null,
    };
  }) : [];
  const proposal = e ? openProposals(e).map(([cat, p]) => ({
    category: baseOf(cat), slot: cat, slotTh: slotInfo(cat)?.th || null, slotEn: slotInfo(cat)?.en || null,
    categoryTh: cg.CAT[baseOf(cat)]?.[0], chosen: p.chosen, reason: p.reason || "",
    options: p.options.map((vid) => optionView(e, cat, vid)).filter(Boolean),
  })) : [];
  const due = e ? payable(e) : { deposit: [], balance: [] };
  const live = orders.filter((o) => !["declined"].includes(o.status));
  const balanceDate = e?.date ? new Date(new Date(e.date + "T00:00:00").getTime() - 7 * 86400000).toISOString().slice(0, 10) : null;
  return {
    customer: { id: c.id, name: c.name },
    chat: c.chat.map(({ id, from, at, th, en, quick, dna, orders: o, proposal: pr, brief, after, change, plan, intro }, i) => ({ change: change || null, plan: plan || null, intro: intro || null, id, from, at,
      th: isGreeting({ from }, i) ? greetingTh(th) : th, en: isGreeting({ from }, i) ? greetingEn(en) : en, quick: quick || [], dna: dna ? dnaTh(dna) : null, orders: Boolean(o), proposal: Boolean(pr), brief: brief || null, after: after || null })),
    event: e ? { id: e.id, name: e.name, nameTh: e.dna?.creative ? [e.dna.creative.name, e.dna.creative.type.th].filter(Boolean).join(" · ") : e.selfServe ? `${typeOf(e.type)[0]}ของคุณ ${c.name}` : e.name, type: e.type, date: e.date, location: e.location, guests: e.guests, budget: e.budget || null, chips: splitChips(e.dna?.chips), chipsTh: splitChips(e.dna?.chips).map(chipTh) } : null,
    proposal, proposalTotal: proposal.reduce((s, p) => s + (p.options.find((o) => o.vendorId === p.chosen)?.estimate || 0), 0),
    orders, total: live.reduce((s, o) => s + o.total, 0),
    waiting: orders.filter((o) => ["pending", "needs_reply"].includes(o.status)).length,
    payment: {
      paid: live.reduce((s, o) => s + o.paid, 0),
      depositDue: sum(due.deposit), depositCount: due.deposit.length,
      balanceDue: sum(due.balance), balanceDate,
      depositRate: DEPOSIT,
      history: (e?.payments || []).map(({ id, kind, method, at, amount }) => ({ id, kind, method, at, amount })),
    },
  };
}
