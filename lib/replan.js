// More guests on a fixed budget: work out the impact before touching any order.
//   impacts  what each partner (and ORCA's own ops) is affected by, priced where ORCA knows the price
//   cuts     savings the partners offered up front (trims), never on the hero moment
//   options  A: keep the venue in a different layout · B: move to a bigger venue from the network
// Nothing here changes the event; selfserve applies the plan once the customer approves it.
import { store } from "./store.js";
import { rankVendors } from "./matching.js";
import { HERO_CATS } from "./creative.js";

const pair = (th, en) => ({ th, en });
const thb = (n) => `฿${Math.round(n || 0).toLocaleString("en-US")}`;
const perGuest = (v) => (v.packages?.[0]?.unit || v.priceUnit) === "per guest";
const ENTRY_COST = 10000; // one more check-in point, ORCA's estimate

// items: [{ key, vendor, amount, unit, ordered }] (what the event spends per service right now)
export function planGuests(e, g1, items, budget) {
  const g0 = e.guests || 0;
  const lines = items.map((it) => ({ ...it, after: it.amount, notes: [], asks: [], trims: [] }));
  const impacts = [];
  for (const L of lines) {
    const v = L.vendor; const cat = v.category;
    if (perGuest(v)) {
      const unit = L.unit ?? v.packages?.[0]?.price ?? v.priceFrom ?? 0;
      L.after = L.amount + unit * (g1 - g0);
      impacts.push({ vendorId: v.id, shopName: v.shopName, category: cat, kind: "cost", before: L.amount, after: L.after,
        ...pair(`ราคาต่อหัว: ${g1} ท่าน × ${thb(unit)} = ${thb(unit * g1)}`, `Per guest: ${g1} × ${thb(unit)} = ${thb(unit * g1)}`) });
      L.notes.push(pair(`ปรับจำนวนเป็น ${g1} ท่าน`, `Guest count now ${g1}`));
    }
    const cap = v.capacity;
    if (cat === "venue" && cap?.max && g1 > cap.max) {
      if (cap.standing && g1 <= cap.standing) {
        impacts.push({ vendorId: v.id, shopName: v.shopName, category: cat, kind: "ask",
          ...pair(`ผังที่นั่งรับได้ ${cap.max} คน แต่ผังแบบยืนรับได้ ${cap.standing} คน ต้องให้ร้านยืนยันผังใหม่`, `Seated holds ${cap.max}; standing holds ${cap.standing}. The venue must confirm the new layout`) });
        L.asks.push({ type: "capacity", ...pair(`ขอปรับเป็นผังแบบยืนสำหรับ ${g1} คน (ร้านแจ้งว่ารับได้ ${cap.standing} คน) ยืนยันได้ไหม และมีค่าใช้จ่ายเพิ่มไหม`, `Can you switch to a standing layout for ${g1} (you list ${cap.standing})? Any extra cost?`) });
      } else {
        impacts.push({ vendorId: v.id, shopName: v.shopName, category: cat, kind: "risk",
          ...pair(`รับได้สูงสุด ${cap.max} คน ไม่พอสำหรับ ${g1} คน ต้องย้ายสถานที่`, `Holds ${cap.max} at most: not enough for ${g1}; the event has to move`) });
        L.mustMove = true;
      }
    }
    if (cat === "av" && g1 >= g0 * 1.3) {
      impacts.push({ vendorId: v.id, shopName: v.shopName, category: cat, kind: "ask",
        ...pair(`ผู้ชมเพิ่มเป็น ${g1} คน ต้องเช็คว่าระบบเสียงครอบคลุมพอไหม อาจต้องเพิ่มลำโพงเสริม`, `${g1} people: check the sound covers the room; may need delay speakers`) });
      L.asks.push({ type: "req", ...pair(`ผู้ชมเพิ่มเป็น ${g1} คน ระบบเสียงต้องเสริมลำโพงไหม ถ้าต้องเพิ่ม ค่าใช้จ่ายเท่าไร`, `With ${g1} people, do you need extra speakers? If so, at what cost?`) });
    }
    if (cat === "decor" && e.dna?.creative?.themes?.some((t) => t.key === "fan")) {
      impacts.push({ vendorId: v.id, shopName: v.shopName, category: cat, kind: "info",
        ...pair("จุดถ่ายรูป Portal: คนเพิ่มขึ้น แนะนำจัดคิวเป็นรอบ ๆ ไม่ต้องเพิ่มจุดใหม่ งานจะไม่เสียจังหวะ", "Photo portal: more people; run it in timed slots instead of adding spots, so the flow holds") });
    }
  }
  const ops = g1 - g0 >= 100 ? ENTRY_COST : 0;
  if (ops) impacts.push({ vendorId: null, shopName: null, category: "ops", kind: "cost", before: 0, after: ops,
    ...pair(`ระบบเข้างาน: แขก ${g1} คน แนะนำเพิ่มจุดลงทะเบียนอีก 1 จุด (ORCA ประเมิน ~${thb(ops)} ต้องยืนยันราคา)`, `Entry: ${g1} guests needs one more check-in point (ORCA estimate ~${thb(ops)}, to confirm)`) });

  const sum = (f) => lines.reduce((t, L) => t + f(L), 0);
  const spendBefore = sum((L) => L.amount);
  let spendAfter = sum((L) => L.after) + ops;
  const growth = spendAfter - spendBefore;

  // keep a 5% contingency; trim what the partners offered, biggest first, never the hero moment
  const keep = Math.round(budget * 0.05);
  const cuts = [];
  for (const L of [...lines].sort((a, b) => b.after - a.after)) {
    if (spendAfter <= budget - keep) break;
    if (HERO_CATS.includes(L.vendor.category)) continue;
    for (const t of L.vendor.trims || []) {
      if (spendAfter <= budget - keep) break;
      const saving = t.saving ?? (t.perGuest || 0) * (perGuest(L.vendor) ? g1 : 1);
      if (!saving) continue;
      L.after -= saving; spendAfter -= saving;
      L.trims.push({ ...t, saving });
      L.notes.push(pair(t.th, t.en));
      cuts.push({ vendorId: L.vendor.id, shopName: L.vendor.shopName, category: L.vendor.category, th: t.th, en: t.en, saving });
    }
  }

  // option B: a venue in the network that seats everyone
  const venue = lines.find((L) => L.vendor.category === "venue");
  let planB = null;
  if (venue && venue.vendor.capacity?.max && venue.vendor.capacity.max < g1) {
    const future = { ...e, guests: g1, dna: { ...e.dna, basics: { ...(e.dna?.basics || {}), guests: g1 } } };
    const alt = (rankVendors(future, store.vendors(), { perCategory: 20 }).venue || [])
      .map((m) => store.vendor(m.vendorId))
      .find((v) => v && v.id !== venue.vendor.id && (v.capacity?.max || 0) >= g1);
    if (alt) {
      const price = (alt.packages?.[0]?.price ?? alt.priceFrom ?? 0) * (perGuest(alt) ? g1 : 1);
      const total = spendAfter - venue.after + price;
      planB = { vendorId: alt.id, shopName: alt.shopName, capacity: alt.capacity.max, price, total, reserve: budget - total, delta: price - venue.after };
    }
  }
  const touched = new Set(impacts.map((i) => i.vendorId).filter(Boolean));
  return {
    g0, g1, budget, impacts, cuts, lines, ops, spendBefore, spendAfter, growth,
    reserveBefore: budget - spendBefore, reserveAfter: budget - spendAfter, keep,
    planA: { venue: venue?.vendor.shopName || null, total: spendAfter, reserve: budget - spendAfter },
    planB, untouched: lines.filter((L) => !touched.has(L.vendor.id)).map((L) => L.vendor.shopName),
  };
}
