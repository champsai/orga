// Customer site. A customer can sign up and chat with ORCA directly: ORCA decodes what
// they write, books matching vendors as orders, and asks them when it needs to. Clients of
// an organizer can also open their event to review concepts and approve proposals.
// Event data comes from /api/client-portal and /api/customers, which never include
// internal notes, budget internals or supplier conversations.
import { api, esc, thb, fmtDate, fmtDateTime, ago, chip, portfolioTile, LOGO, toast, busy, drawer, L, LANG, setLang, langToggle, catLabel } from "./common.js";

const $main = document.getElementById("main");
const $sub = document.getElementById("subnav");
const $nav = document.getElementById("gnav");
const PREVIEW = new URLSearchParams(location.search).has("preview");

const ACTS = {};
const on = (n, f) => (ACTS[n] = f);
document.addEventListener("click", (e) => { const el = e.target.closest("[data-act]"); if (el && ACTS[el.dataset.act]) { e.preventDefault(); ACTS[el.dataset.act](el, e); } });
document.addEventListener("change", (e) => { const el = e.target.closest("[data-change]"); if (el && ACTS[el.dataset.change]) ACTS[el.dataset.change](el, e); });
const fail = (err) => toast(esc(err.message || err), "err");

const C = { id: null, data: null, me: null, cx: null };
try { C.me = localStorage.getItem("orca.customer"); } catch {}
const TYPE_LABEL = { brief: L("บรีฟงาน", "Brief"), vendor: L("เลือกร้าน", "Vendor choice"), budget: L("งบประมาณ", "Budget"), change: L("การเปลี่ยนแปลง", "Change") };
const GROUP_LABEL = { brief: L("บรีฟ", "Briefs"), reference: L("ภาพอ้างอิง", "References"), quotation: L("ใบเสนอราคา", "Quotations"), contract: L("สัญญา", "Contracts"), floorplan: L("ผังงาน", "Floor plans"), invoice: L("ใบแจ้งหนี้", "Invoices"), other: L("อื่นๆ", "Other") };
const ACTION_LABEL = { sent: L("ส่งให้คุณ", "Sent to you"), created: L("จัดทำ", "Prepared"), approved: L("อนุมัติ", "Approved"), revision: L("ขอแก้ไข", "Revision requested"), declined: L("ปฏิเสธ", "Declined") };
const statusChip = (s) => chip(s === "approved" ? "granted" : s === "pending" ? "pending" : s, s === "pending" ? L("รอคุณตัดสินใจ", "Your decision") : undefined);

if (PREVIEW) {
  const b = document.getElementById("preview");
  b.hidden = false;
  b.className = "preview-banner";
  b.innerHTML = L("<b>ดูแบบลูกค้า</b> หน้านี้คือสิ่งที่ลูกค้าเห็นจริง ปิดการคอมเมนต์และการอนุมัติไว้", "<b>Preview as client.</b> This is exactly what your client sees. Comments and decisions are turned off here.");
}

function nav() {
  $nav.innerHTML = `<a class="brand" href="#/">${LOGO}<span>ORCA</span></a><span class="nl hide-sm" style="opacity:.7">${L("สำหรับลูกค้า", "for Clients")}</span><span class="grow"></span>
    <a class="nl" href="#/shops">${L("ร้านค้า", "Shops")}</a>
    ${C.me ? `<a class="nl" href="#/chat">${L("แชทกับ ORCA", "Chat with ORCA")}</a><a class="nl hide-sm" href="#/start" data-act="signOut" title="${L("ออกจากระบบ แล้วสมัครบัญชีใหม่", "Sign out and create a new account")}">${L("บัญชีใหม่", "New account")}</a>` :`<a class="nl" href="#/start">${L("เริ่มวางแผนงาน", "Plan an event")}</a>`}
    ${C.id ? `<a class="nl hide-sm" href="#/" data-act="switch">${L("เปลี่ยนงาน", "Switch event")}</a>` : ""}
    ${langToggle()}`;
}
function subnav(title, tabs = [], cta = "") {
  $sub.innerHTML = `<div class="in"><div class="title">${esc(title)}</div><div class="tabs">${tabs.map((t) => `<a href="${t.href}" class="${t.on ? "on" : ""}">${esc(t.label)}${t.n ? `<span class="n">${t.n}</span>` : ""}</a>`).join("")}</div>${cta}</div>`;
}
on("lang", (el) => setLang(el.dataset.k));

let pollTimer = null;
async function route() {
  clearInterval(carTimer); clearInterval(pollTimer);
  const p = (location.hash || "#/").slice(2).split("/");
  try {
    if (p[0] === "e" && p[1]) return await renderEvent(p[1], p[2] || "overview");
    C.id = null; nav();
    if (p[0] === "start") return renderStart();
    if (p[0] === "shops") return await renderShops();
    if (p[0] === "shop" && p[1]) return await renderShop(p[1]);
    if (p[0] === "chat") return await renderChat();
    if (p[0] === "work") {
      // a shareable link to one story: #/work/<case id>
      await renderLanding();
      if (p[1] && SC.cases.some((c) => c.id === p[1])) ACTS.case({ dataset: { id: p[1] } });
      return;
    }
    return await renderLanding();
  } catch (err) { fail(err); }
}
window.addEventListener("hashchange", route);

// ---------------------------------------------------------------- landing
const gLabel = (sc, k, en) => L(sc.groupsTh?.[k] || en, en);
const placeL = (p) => L(/^bangkok$/i.test(p || "") ? "กรุงเทพฯ" : p || "", p || "");
const caseT = (c, k) => (LANG === "th" && c.th?.[k] != null ? c.th[k] : c[k]);

async function renderLanding() {
  subnav("ORCA · AI Event Concierge");
  const [events, sc] = await Promise.all([api("/api/client-portal"), showcase()]);
  const s = sc.summary;
  $main.innerHTML = `
    <section class="carousel" aria-label="${L("งานที่ ORCA เคยจัด", "Events ORCA has made")}">
      <div class="car-track" id="car-track">${sc.cases.map((c) => `<button class="car-slide" data-act="case" data-id="${c.id}" style="background-image:url('${scImg(c)}')" aria-label="${esc(c.title)}">
        <span class="car-cap"><span class="car-type">${esc(gLabel(sc, c.group, c.type))} · ${c.guests.toLocaleString("en-US")} ${L("ท่าน", "guests")}</span><b>${esc(c.title)}</b><span class="car-brief">“${esc(LANG === "th" ? c.brief : c.briefEn || c.brief)}”</span></span></button>`).join("")}</div>
      <button class="car-btn prev" data-act="carousel" data-dir="-1" aria-label="${L("ก่อนหน้า", "Previous")}">‹</button>
      <button class="car-btn next" data-act="carousel" data-dir="1" aria-label="${L("ถัดไป", "Next")}">›</button>
    </section>

    <section class="profile">
      <div class="profile-logo">${LOGO.replace('class="logo"', 'class="logo big"')}<span>ORCA</span></div>
      <div class="profile-main">
        <div class="profile-cats"><span>AI Event Concierge</span>${sc.groups.map(([k, l]) => `<a href="#/" data-act="scGroup" data-k="${k}">${esc(gLabel(sc, k, l))}</a>`).join("")}</div>
        <h1>ORCA</h1>
        <p>${L("จากข้อความเดียวที่ยังไม่ชัด สู่งานที่ไม่มีใครลืม ทั้งงานแต่ง สัมมนา เปิดตัวสินค้า ปาร์ตี้บริษัท และวันเกิด (แม้แต่ของน้องแมว) แค่เล่าว่าอยากให้งาน<i>รู้สึก</i>แบบไหน ORCA ถอดความ หาร้านที่ใช่ จองให้ และคอยอัปเดตทุกฝ่ายให้",
          "From one vague message to an unforgettable event. Weddings, conferences, brand launches, company parties and birthdays (yes, even for cats). Tell us how it should <i>feel</i>; ORCA decodes it, books the right team and keeps everyone in sync.")}</p>
        <div class="profile-stats"><div><b>${s.cases}</b><span>signature events</span></div><div><b>${s.guests.toLocaleString("en-US")}</b><span>guests</span></div><div><b>${s.vendors}</b><span>partner vendors</span></div><div><b>~${s.avgDecode}s</b><span>to decode a brief</span></div></div>
      </div>
      <div class="profile-cta card">
        <a class="btn lg" href="${C.me ? "#/chat" : "#/start"}">${C.me ? L("กลับไปแชทกับ ORCA", "Back to my chat") : L("เริ่มวางแผนงานกับ ORCA", "Plan my event with ORCA")}</a>
        <a class="btn lg ghost" href="#/" data-act="scrollTo" data-to="our-work">${L("ดูผลงาน", "See our work")}</a>
        <a class="small" href="#/" data-act="scrollTo" data-to="open-event" style="text-align:center">${L("มีงานกับผู้จัดงานอยู่แล้ว? เปิดงานของคุณ", "Already working with an organizer? Open your event")}</a>
      </div>
    </section>

    <div id="our-work">${showcaseBand(sc, { filters: true })}</div>

    <div class="card" id="open-event" style="margin-top:28px">
      <div class="card-head"><h3>${L("เปิดงานของคุณ", "Open your event")}</h3><span class="muted small">${L("เดโม: ไม่ต้องใช้รหัสผ่าน", "Demo: no password")}</span></div>
      <div class="row"><select class="input" id="ev-pick" style="max-width:420px" aria-label="${L("งานของคุณ", "Your event")}">${events.map((e) => `<option value="${e.id}">${esc(e.name)} · ${fmtDate(e.date)}</option>`).join("")}</select>
      <button class="btn" data-act="open">${L("เปิด", "Open")}</button></div>
      <p class="xsmall muted" style="margin:8px 0 0">${L("ลองเปิด Nimbus Tech Summit 2026 มีข้อเสนอ 3 รายการรอการตัดสินใจ", "Tip: Nimbus Tech Summit 2026 has three proposals waiting for a decision.")}</p>
    </div>`;
  startCarousel();
}

// hero carousel: swipe on phones, arrows on desktop, advances on its own until someone touches it
let carTimer = null;
function carStep(dir) {
  const t = document.getElementById("car-track");
  if (!t) return clearInterval(carTimer);
  const w = t.querySelector(".car-slide")?.offsetWidth || t.clientWidth;
  const atEnd = t.scrollLeft + t.clientWidth >= t.scrollWidth - 4;
  if (dir > 0 && atEnd) t.scrollTo({ left: 0, behavior: "smooth" });
  else t.scrollBy({ left: dir * (w + 16), behavior: "smooth" });
}
function startCarousel() {
  clearInterval(carTimer);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  carTimer = setInterval(() => carStep(1), 5000);
  const t = document.getElementById("car-track");
  for (const ev of ["pointerdown", "wheel", "focusin"]) t?.addEventListener(ev, () => clearInterval(carTimer), { once: true });
}
on("carousel", (el) => { clearInterval(carTimer); carStep(Number(el.dataset.dir)); });
on("scrollTo", (el) => document.getElementById(el.dataset.to)?.scrollIntoView({ behavior: "smooth", block: "start" }));
on("scGroup", (el) => {
  C.scGroup = C.scGroup === el.dataset.k || el.dataset.k === "all" ? null : el.dataset.k;
  const band = document.getElementById("our-work");
  if (band) { band.innerHTML = showcaseBand(SC, { filters: true, stats: !document.querySelector(".profile") }); band.scrollIntoView({ behavior: "smooth", block: "start" }); }
});
on("open", () => { location.hash = `#/e/${document.getElementById("ev-pick").value}`; });
on("switch", () => { location.hash = "#/"; });

// ---------------------------------------------------------------- sign up
async function renderStart() {
  subnav(L("เริ่มวางแผนงาน", "Plan your event"));
  let me = null;
  if (C.me) me = await api(`/api/customers/${C.me}`).catch(() => null);
  $main.innerHTML = `<section class="start">
    <div class="start-copy">
      <div class="eyebrow">ORCA</div>
      <h1>${L("เล่างานในฝัน<br>แล้ว ORCA จัดการที่เหลือ", "Describe your dream event.<br>ORCA does the rest.")}</h1>
      <ol class="start-steps">
        <li><b>${L("พิมพ์เล่าแบบที่คิด", "Type it the way you think it")}</b><span>${L("ไม่ต้องเรียบเรียง ยาวแค่ไหนก็ได้ ไทยหรืออังกฤษ", "No need to organize it. Thai or English, as long as you like.")}</span></li>
        <li><b>${L("ORCA ถอดเป็น Event DNA", "ORCA decodes it into Event DNA")}</b><span>${L("บรรยากาศ สิ่งที่ไม่เอา จำนวนแขก วันงาน", "The feel, what to avoid, guests, date.")}</span></li>
        <li><b>${L("จองร้านที่ใช่ให้ทันที", "Books the right vendors at once")}</b><span>${L("ส่งออเดอร์ถึงร้าน ร้านยืนยันแล้วแจ้งคุณในแชท", "Orders go to the vendors; you hear back in the chat.")}</span></li>
        <li><b>${L("อยากเปลี่ยนอะไร พิมพ์บอก", "Change anything by typing it")}</b><span>${L("ORCA ปรับออเดอร์ให้เอง ถามร้านหรือถามคุณเฉพาะเมื่อจำเป็น", "ORCA updates the orders itself and only asks when it must.")}</span></li>
      </ol>
    </div>
    <div class="card start-form">
      ${me ? `<h2>${L(`ยินดีต้อนรับกลับ คุณ${esc(me.customer.name)}`, `Welcome back, ${esc(me.customer.name)}`)}</h2>
        <p class="muted small" style="margin:0">${me.event ? L(`งาน: ${esc(me.event.name)} · ${fmtDate(me.event.date)}`, `Your event: ${esc(me.event.name)} · ${fmtDate(me.event.date)}`) : L("ยังไม่ได้เริ่มเล่างาน", "You haven't described your event yet.")}</p>
        <a class="btn lg" href="#/chat">${L("กลับไปแชทกับ ORCA", "Back to my chat")}</a>
        <button class="btn ghost" data-act="signOut">${L("เริ่มใหม่ในชื่ออื่น", "Start over as someone else")}</button>`
      : `<h2>${L("สมัครใช้บริการ", "Create your account")}</h2>
        <p class="muted small" style="margin:0">${L("ใช้เวลาไม่ถึงนาที ORCA ใช้ข้อมูลนี้ติดต่อคุณเรื่องงานเท่านั้น", "Takes under a minute. ORCA only uses this to reach you about your event.")}</p>
        <div class="field"><label for="su-name">${L("ชื่อของคุณ", "Your name")}</label><input id="su-name" class="input" autocomplete="name" placeholder="${L("เช่น มายด์", "e.g. Mild")}"></div>
        <div class="field"><label for="su-phone">${L("เบอร์โทร", "Phone")}</label><input id="su-phone" class="input" type="tel" autocomplete="tel" placeholder="08x-xxx-xxxx"></div>
        <div class="field"><label for="su-line">LINE ID <span class="muted">${L("(ไม่บังคับ)", "(optional)")}</span></label><input id="su-line" class="input" placeholder="@yourname"></div>
        <div class="field"><label for="su-email">${L("อีเมล", "Email")} <span class="muted">${L("(ไม่บังคับ)", "(optional)")}</span></label><input id="su-email" class="input" type="email" autocomplete="email"></div>
        <button class="btn lg" data-act="signUp">${L("เริ่มคุยกับ ORCA", "Start chatting with ORCA")}</button>
        <p class="xsmall muted" style="margin:0">${L("เดโม: ไม่มีรหัสผ่าน ข้อมูลเก็บในเครื่องเดโมเท่านั้น", "Demo: no password; data stays on the demo server.")}</p>`}
    </div>
  </section>`;
}
on("signUp", async (el) => {
  const v = (id) => document.getElementById(id).value.trim();
  if (!v("su-name")) return toast(L("กรุณาใส่ชื่อ", "Please add your name."), "err");
  if (!v("su-phone") && !v("su-email") && !v("su-line")) return toast(L("ใส่เบอร์โทร อีเมล หรือ LINE อย่างน้อยหนึ่งช่อง", "Add a phone, email or LINE ID."), "err");
  busy(el, true, L("กำลังสมัคร…", "Signing up…"));
  try {
    const out = await api("/api/customers", { method: "POST", body: { name: v("su-name"), phone: v("su-phone"), line: v("su-line"), email: v("su-email") } });
    C.me = out.customer.id;
    try { localStorage.setItem("orca.customer", C.me); } catch {}
    location.hash = "#/chat";
  } catch (err) { fail(err); busy(el, false); }
});
// Demo accounts have no password: signing out just forgets this browser's customer, so the next
// person can sign up fresh. The old account and its chat stay on the server.
on("signOut", () => {
  C.me = null; C.cx = null; clearInterval(pollTimer);
  try { localStorage.removeItem("orca.customer"); } catch {}
  nav();
  if (location.hash === "#/start") renderStart(); else location.hash = "#/start";
  toast(L("ออกจากระบบแล้ว สมัครบัญชีใหม่ได้เลย", "Signed out. Create a new account."));
});

// ---------------------------------------------------------------- chat with ORCA
const EXAMPLES = [
  [L("งานแต่ง (ตัวอย่างภาษาอังกฤษ)", "Wedding example"), "We want the wedding to feel elegant and romantic, but not in a way that feels too formal or traditional. We like the idea of something intimate and personal, but we still want enough space for everyone to feel comfortable and for the celebration to have energy. Nothing too over-the-top, nothing too simple, and definitely nothing that feels old-fashioned. We're thinking around 150 guests, and we want the whole day to feel beautiful, warm, modern, and very 'us'."],
  [L("วันเกิดแม่ 60 ปี", "Mum's 60th"), "อยากจัดงานวันเกิดแม่ครบ 60 ปีค่ะ ประมาณ 80 คน อยากได้บรรยากาศอบอุ่น เป็นกันเอง มีดอกไม้สวยๆ แต่ไม่เอาหรูหราเกินไป แม่ชอบสวน อยากมีวงดนตรีเล่นเพลงเก่าๆ งบประมาณ 5 แสน"],
  [L("งานเปิดตัวสินค้า", "Product launch"), "งานเปิดตัวเซรั่มตัวใหม่ แขก 200 คน มีสื่อ KOL พาร์ทเนอร์ อยากได้แบบโมเดิร์น คลีน สนุกนิดๆ ถ่ายรูปสวย ต้องมีเวที จอ LED ดีเจ บาร์ค็อกเทล และบูธถ่ายรูป ไม่เอาห้องบอลรูมโรงแรมแบบเชยๆ"],
];
const STATUS_TONE = { pending: "amber", needs_reply: "blue", needs_customer: "red", accepted: "green", declined: "red" };

async function renderChat() {
  if (!C.me) { location.hash = "#/start"; return; }
  try { C.cx = await api(`/api/customers/${C.me}`); }
  catch { C.me = null; try { localStorage.removeItem("orca.customer"); } catch {} location.hash = "#/start"; return; }
  drawChat();
  pollTimer = setInterval(pollChat, 4000);
}

// The client's own words with the phrases ORCA used highlighted.
function markedBrief(b) {
  let out = ""; let at = 0;
  for (const [s, e] of b.marks || []) { out += esc(b.text.slice(at, s)) + `<mark>${esc(b.text.slice(s, e))}</mark>`; at = e; }
  return out + esc(b.text.slice(at));
}

// ORCA's pick for one box: an order if it's already sent, otherwise the chosen suggestion.
function boxPick(cat) {
  const o = C.cx?.orders?.find((x) => x.category === cat);
  if (o) return { vendorId: o.vendorId, shopName: o.shopName, price: o.total, status: L(o.statusTh, o.statusEn) };
  const p = C.cx?.proposal?.find((x) => x.category === cat);
  const c = p && (p.options.find((x) => x.vendorId === p.chosen) || p.options[0]);
  return c ? { vendorId: c.vendorId, shopName: c.shopName, price: c.estimate, rating: c.rating, reviewCount: c.reviewCount, more: p.options.length - 1 } : null;
}

function dnaBoxes(boxes) {
  return `<div class="dx-boxes">${boxes.map((b) => {
    const v = boxPick(b.category);
    return `<div class="dx-box cat-${b.category}">
      <div class="dx-h">${esc(catLabel(b.category))}</div>
      <ul>${b.items.map((i) => `<li class="${i.source === "client" ? "" : "int"}"${i.quote ? ` data-act="dxQuote" tabindex="0" role="button" aria-expanded="false"` : ""}><span>${esc(L(i.th || i.text, i.text))}</span>${i.quote ? `<q>${esc(i.quote)}</q>` : ""}</li>`).join("")}</ul>
      ${v ? `<div class="dx-pick"><span class="xsmall muted">${v.status ? esc(v.status) : L("ร้านที่ ORCA แนะนำ", "ORCA recommends")}</span>
        <a class="shop-link" href="#/shop/${v.vendorId}"><b>${esc(v.shopName)}</b></a>
        <div class="xsmall">${v.rating ? `${starBar(v.rating)} <b>${Number(v.rating).toFixed(1)}</b> <span class="muted">(${v.reviewCount})</span> · ` : ""}<span class="num">${thb(v.price)}</span></div>
        ${v.more ? `<button class="btn link xs" data-act="cxBoxMore" data-cat="${b.category}">${L(`+ อีก ${v.more} ตัวเลือก`, `+ ${v.more} more options`)}</button>` : ""}</div>` : ""}
    </div>`;
  }).join("")}</div>`;
}

// What a change did: the new details, each shop's outcome with old → new price, and the total.
const CHANGE_KIND = {
  auto: ["ORCA แก้ให้เลย", "Updated by ORCA", "green"], ask: ["ถามร้านแล้ว", "Asked the vendor", "blue"],
  conflict: ["ต้องเช็ค", "Needs a check", "amber"], new: ["เพิ่มใหม่", "New", "blue"], keep: ["คงเดิม", "Unchanged", "gray"], plan: ["อัปเดตในแผน", "Updated in plan", "blue"], held: ["พักไว้", "On hold", "amber"], swap: ["เปลี่ยนร้าน", "New pick", "amber"], rerank: ["จัดอันดับใหม่", "Re-ranked", "gray"],
};
const FRESH_MS = 30000;
const isFresh = (m) => Date.now() - new Date(m.at).getTime() < FRESH_MS && !C.seen?.has(m.id);
function changeCard(m) {
  const g = m.change;
  const anim = isFresh(m);
  const money = (a, b) => (a != null && b != null && a !== b ? `<span class="chg-price"><s>${thb(a)}</s> <b>${thb(b)}</b></span>` : b != null ? `<span class="chg-price"><b>${thb(b)}</b></span>` : "");
  const delta = g.totalBefore != null && g.totalAfter != null ? g.totalAfter - g.totalBefore : 0;
  return `<div class="chg${anim ? " anim" : ""}">
    <div class="chg-steps" aria-hidden="true"><span>${L("อ่านคำขอ", "Read request")}</span><span>${L("เช็คข้อมูลร้าน", "Checked vendors")}</span><span>${L("อัปเดตออเดอร์", "Updated orders")}</span></div>
    ${g.lines.length ? `<div class="chg-lines">${g.lines.map((l) => `<div class="chg-line"><span class="muted">${esc(L(l.labelTh, l.label))}</span>${l.from && !["-", "—"].includes(l.from) ? `<s>${esc(L(l.fromTh, l.from))}</s><span class="arr">→</span>` : ""}<b>${esc(L(l.toTh, l.to))}</b></div>`).join("")}</div>` : ""}
    ${g.rows.length ? `<div class="chg-rows">${g.rows.map((r, i) => { const k = CHANGE_KIND[r.kind] || CHANGE_KIND.auto; return `<div class="chg-row" style="--i:${i}">
      <div class="chg-main"><div class="row" style="gap:6px"><a class="shop-link" href="#/shop/${r.vendorId}"><b>${esc(r.shopName)}</b></a><span class="chip chip-${k[2]}"><i></i>${L(k[0], k[1])}</span></div>
        <div class="xsmall muted">${esc(r.slotTh ? L(r.slotTh, r.slotEn) : catLabel(r.category))} · ${esc(L(r.th, r.en))}</div></div>
      ${money(r.before, r.after)}</div>`; }).join("")}</div>` : ""}
    ${g.untouched ? `<div class="xsmall muted chg-note">✓ ${L(`ร้านอื่นอีก ${g.untouched} ร้านไม่ได้รับผลกระทบ ไม่ต้องแจ้ง`, `${g.untouched} other vendors aren't affected`)}</div>` : ""}
    ${(g.notes || []).map((n) => `<div class="xsmall chg-note">• ${esc(L(n.th, n.en))}</div>`).join("")}
    ${g.budgetOnly ? `<div class="xsmall muted chg-note">🔒 ${L("บันทึกงบใหม่แล้ว เป็นข้อมูลภายใน ไม่แจ้งร้าน", "Budget saved; kept internal")}</div>` : ""}
    ${g.pending ? `<button class="btn sm" data-act="cxBoxMore" data-cat="${esc(g.pending)}">${L("ดูตัวเลือกและยืนยัน →", "See options and confirm →")}</button>` : ""}
    ${g.totalAfter != null ? `<div class="chg-total"><span>${g.pending ? L("ถ้ายืนยัน ยอดรวมจะเป็น", "Total if you confirm") : L("ยอดรวม", "Total")}</span>${money(g.totalBefore, g.totalAfter)}${delta ? `<span class="chg-delta ${delta < 0 ? "down" : "up"}">${delta < 0 ? "−" : "+"}${thb(Math.abs(delta))}</span>` : ""}</div>` : ""}
  </div>`;
}

// The partner ORCA has in a service right now: the order if sent, else the chosen suggestion.
function partnerPick(cat) {
  const o = C.cx?.orders?.find((x) => x.category === cat && !x.slotTh);
  if (o) return { ...o, price: o.total, status: L(o.statusTh, o.statusEn) };
  const p = C.cx?.proposal?.find((x) => (x.slot || x.category) === cat);
  const c = p && (p.options.find((x) => x.vendorId === p.chosen) || p.options[0]);
  return c ? { ...c, price: c.estimate, more: p.options.length - 1 } : null;
}
const ROLE_ORDER = ["venue", "av", "decor", "catering", "entertainment", "photography"];
function creativeBlock(d) {
  const k = d.creative;
  const team = ROLE_ORDER.map((cat) => ({ cat, role: k.roles[cat], v: partnerPick(cat) })).filter((x) => x.role && x.v);
  const names = Object.fromEntries(team.map((x) => [x.v.vendorId, x.v.shopName]));
  const spend = (cat) => team.find((x) => x.cat === cat)?.v.price;
  const total = k.budget.reduce((t, r) => t + r.amount, 0);
  return `<section class="cr">
    <div class="cr-h"><b>DNA EXTRACTION</b><span>${L("คำสำคัญที่ไฮไลต์ → สิ่งที่ AI ตีความ", "Highlighted keywords → AI interpretation")}</span></div>
    <div class="cr-themes">${k.themes.map((t) => `<div class="cr-theme">
      <div class="cr-k">${esc(t.label)}</div><div class="cr-q">“${esc(t.quotes.join(" · "))}”</div>
      <div class="cr-ai"><span>AI interprets:</span> <b>${esc(t.en)}</b></div><div class="cr-th">${esc(t.th)}</div></div>`).join("")}</div>

    <div class="cr-dna">
      <div class="row between"><b class="cr-title">${esc((k.name || "EVENT").toUpperCase())} — EVENT DNA</b><span class="cr-draft">AI-generated draft</span></div>
      <div class="cr-facts">
        <div><span>Event type</span><b>${esc(L(k.type.th, k.type.en))}</b></div>
        <div><span>Audience</span><b>${d.guests ? `${d.guests} ${L("คน", "guests")}` : "—"}</b></div>
        <div><span>Budget ceiling</span><b>${d.budget ? thb(d.budget) : "—"}</b></div>
        <div><span>Location</span><b>${esc(d.location || "—")}</b></div>
      </div>
      <div class="cr-row"><span class="dx-label">CORE AESTHETIC</span><div class="row">${k.core.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div></div>
      <div class="cr-row"><span class="dx-label">EXPERIENCE DNA</span><div class="row">${k.experience.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div></div>
      <div class="cr-row"><span class="dx-label">NON-NEGOTIABLES</span><ul>${k.musts.map((m) => `<li>${esc(L(m.th, m.en))}</li>`).join("")}</ul></div>
    </div>

    <div class="cr-h"><b>AI SUGGESTIONS</b><span>${L("จาก DNA สู่ข้อเสนอที่คุณอาจนึกไม่ถึง", "From DNA to ideas you may not have thought of")}</span></div>
    <div class="cr-ideas">${k.ideas.map((i, n) => `<div class="cr-idea">
      <div class="cr-k">AI Suggestion 0${n + 1}</div><b class="cr-it">${esc(i.kicker)}: ${esc(i.title)}</b>
      <p>${esc(L(i.th, i.en))}</p><div class="cr-why"><b>${esc(L(i.whyLabel[0], i.whyLabel[1]))}:</b> ${esc(L(i.whyTh, i.whyEn))}</div></div>`).join("")}</div>
    <p class="cr-note">${L("ข้อเสนอเหล่านี้เป็นแนวทางที่ AI สร้างจากบรีฟ ไม่ใช่ข้อสรุปที่ต้องยอมรับ เลือก ปรับ หรือปฏิเสธได้ก่อนสร้างแผนฉบับสุดท้าย", "These are AI-generated directions, not decisions. Pick, adjust or reject them before the final plan.")}</p>

    ${team.length ? `<div class="cr-h"><b>DNA MATCHING</b><span>${L("ชุดพาร์ตเนอร์ที่ทำงานร่วมกันได้ ไม่ใช่แค่ร้านที่ดีที่สุดแยกหมวด", "A set of partners that work well together, not just the best shop per category")}</span></div>
    <div class="cr-team">${team.map(({ cat, role, v }, n) => { const mates = Object.entries(v.workedWith || {}).filter(([id]) => names[id]); return `<div class="cr-p">
      <div class="cr-k">0${n + 1} · ${esc(role.role)}</div>
      <div class="row between" style="gap:6px"><a class="shop-link" href="#/shop/${v.vendorId}"><b>${esc(v.shopName)}</b></a><b class="num">${thb(v.price)}</b></div>
      <div class="xsmall muted">${esc(L(role.catTh, role.catEn))}${v.rating ? ` · ${starBar(v.rating)} <b>${Number(v.rating).toFixed(1)}</b>` : ""}${v.status ? ` · ${esc(v.status)}` : ""}</div>
      ${v.desc ? `<p>${esc(L(v.descTh || v.desc, v.desc))}</p>` : ""}
      <div class="cr-why"><b>${L("เหตุผลที่ Match", "Why it matches")}:</b> ${esc(L(role.th, role.en))}</div>
      ${mates.length ? `<div class="cr-mates">${mates.map(([id, c]) => `<span>${L(`เคยทำงานกับ ${esc(names[id])} ${c} งาน`, `${c} events with ${esc(names[id])}`)}</span>`).join("")}</div>` : ""}
      ${v.more ? `<button class="btn link xs" data-act="cxBoxMore" data-cat="${cat}">${L(`+ ดูอีก ${v.more} ตัวเลือก`, `+ ${v.more} more options`)}</button>` : ""}
    </div>`; }).join("")}</div>` : ""}

    ${k.budget.length ? `<div class="cr-h"><b>${L("ตัวอย่างการจัดงบประมาณ", "Budget split")}</b><span>${L("ลงเงินกับช่วงเปิดตัวและโชว์ก่อน", "Hero moment first")}</span></div>
    <table class="cr-budget"><thead><tr><th>${L("หมวด", "Category")}</th><th>${L("งบประมาณ", "Budget")}</th><th>${L("ร้านที่เลือก", "Chosen partner")}</th></tr></thead><tbody>
      ${k.budget.map((r) => `<tr${r.hero ? ' class="is-hero"' : ""}><td>${esc(L(r.th, r.en))}${r.hero ? ` <span class="cr-hero">Hero</span>` : ""}</td><td class="num">${thb(r.amount)}</td><td class="num muted">${spend(r.category) != null ? thb(spend(r.category)) : "—"}</td></tr>`).join("")}
      <tr class="sum"><td>${L("รวม", "Total")}</td><td class="num">${thb(total)}</td><td class="num muted">${thb(team.reduce((t, x) => t + (x.v.price || 0), 0))}</td></tr></tbody></table>
    <p class="cr-note">${L("ตัวเลขเป็นงบประมาณจำลองสำหรับเดโม ไม่ใช่ใบเสนอราคาจริงจากร้าน และค่าศิลปินอาจเปลี่ยนแปลงตามข้อตกลง", "Demo budget only, not real vendor quotes; artist fees may change by agreement.")}</p>` : ""}
  </section>`;
}

// More guests on a fixed budget: impact → options → new budget → drafts, waiting for approval.
const IMPACT = { cost: ["คำนวณแล้ว", "Priced", "amber"], ask: ["ต้องให้ร้านยืนยัน", "Vendor to confirm", "blue"], risk: ["ไม่พอ", "Won't fit", "red"], info: ["ข้อแนะนำ", "Tip", "gray"] };
function planCard(m, last) {
  const p = m.plan;
  const money = (a, b) => (a != null && b != null && a !== b ? `<span class="chg-price"><s>${thb(a)}</s> <b>${thb(b)}</b></span>` : "");
  const diff = (n) => (n ? `<span class="chg-delta ${n < 0 ? "down" : "up"}">${n < 0 ? "−" : "+"}${thb(Math.abs(n))}</span>` : `<span class="muted xsmall">—</span>`);
  const opt = (key, o, title, reco) => {
    const over = o.reserve < 0;
    return `<div class="pl-opt${reco ? " reco" : ""}${over ? " over" : ""}"><div class="row between"><b>${L(`แผน ${key}`, `Plan ${key}`)}</b>${reco ? `<span class="chip chip-green"><i></i>${L("แนะนำ", "Recommended")}</span>` : ""}</div>
      <div class="small">${title}</div>
      <div class="pl-num"><span>${L("ใช้จริง", "Spend")}</span><b>${thb(o.total)}</b></div>
      <div class="pl-num"><span>${L("เหลือสำรอง", "Contingency")}</span><b class="${over ? "bad" : ""}">${over ? L(`เกินงบ ${thb(-o.reserve)}`, `${thb(-o.reserve)} over`) : thb(o.reserve)}</b></div></div>`;
  };
  return `<div class="chg pl${isFresh(m) ? " anim" : ""}">
    <div class="chg-steps" aria-hidden="true"><span>${L("ประเมินผลกระทบ", "Impact")}</span><span>${L("เสนอทางเลือก", "Options")}</span><span>${L("คำนวณงบใหม่", "New budget")}</span><span>${L("ร่างข้อความถึงร้าน", "Vendor drafts")}</span></div>
    <div class="chg-lines"><div class="chg-line"><span class="muted">${L("ผู้ร่วมงาน", "Guests")}</span><s>${p.g0}</s><span class="arr">→</span><b>${p.g1} ${L("คน", "")}</b></div>
      <div class="chg-line"><span class="muted">${L("งบสูงสุด", "Budget cap")}</span><b>${thb(p.budget)}</b><span class="xsmall muted">${L("คงเดิม", "unchanged")}</span></div></div>

    <div class="pl-h">1 · ${L("ประเมินผลกระทบ", "What it affects")}</div>
    <div class="chg-rows">${p.impacts.map((i, n) => { const k = IMPACT[i.kind] || IMPACT.info; return `<div class="chg-row" style="--i:${n}">
      <div class="chg-main"><div class="row" style="gap:6px"><b>${esc(i.shopName || "ORCA")}</b><span class="chip chip-${k[2]}"><i></i>${L(k[0], k[1])}</span></div>
        <div class="xsmall muted">${esc(L(i.th, i.en))}</div></div>${money(i.before, i.after)}</div>`; }).join("")}</div>
    ${p.untouched.length ? `<div class="xsmall muted chg-note">✓ ${L(`ไม่กระทบ: ${p.untouched.join(", ")}`, `Not affected: ${p.untouched.join(", ")}`)}</div>` : ""}

    <div class="pl-h">2 · ${L("ทางเลือก", "Options")}</div>
    <div class="pl-opts">
      ${opt("A", p.planA, L(`คง ${esc(p.planA.venue || "สถานที่เดิม")} ปรับผังเป็นแบบยืน และลดส่วนที่ไม่ใช่จุดสำคัญ`, `Keep ${esc(p.planA.venue || "the venue")} in a standing layout and trim what isn't key`), !p.planB || p.planA.reserve >= p.planB.reserve)}
      ${p.planB ? opt("B", p.planB, L(`ย้ายไป ${esc(p.planB.shopName)} (รับได้ ${p.planB.capacity} คน, ${p.planB.delta >= 0 ? "+" : "−"}${thb(Math.abs(p.planB.delta))} ค่าสถานที่)`, `Move to ${esc(p.planB.shopName)} (holds ${p.planB.capacity}, ${p.planB.delta >= 0 ? "+" : "−"}${thb(Math.abs(p.planB.delta))} venue)`), p.planB.reserve > p.planA.reserve) : ""}
    </div>

    <div class="pl-h">3 · ${L("งบใหม่ (แผน A)", "New budget (plan A)")}</div>
    <table class="cr-budget pl-table"><thead><tr><th>${L("หมวด", "Category")}</th><th>${L("เดิม", "Before")}</th><th>${L("ใหม่", "After")}</th><th>${L("ส่วนต่าง", "Change")}</th></tr></thead><tbody>
      ${p.table.map((r) => `<tr><td>${esc(L(r.th, r.en))}${r.hero ? ` <span class="cr-hero">Hero · ${L("ไม่แตะ", "kept")}</span>` : ""}${r.shopName ? `<div class="xsmall muted">${esc(r.shopName)}</div>` : ""}${(r.cut || []).map((c) => `<div class="xsmall pl-cut">✂ ${esc(L(c.th, c.en))}</div>`).join("")}</td>
        <td class="num">${thb(r.before)}</td><td class="num"><b>${thb(r.after)}</b></td><td class="num">${diff(r.after - r.before)}</td></tr>`).join("")}
      <tr><td>${L("เงินสำรอง", "Contingency")}</td><td class="num">${thb(p.reserveBefore)}</td><td class="num"><b>${thb(p.reserveAfter)}</b></td><td class="num">${diff(p.reserveAfter - p.reserveBefore)}</td></tr>
      <tr class="sum"><td>${L("รวม", "Total")}</td><td class="num">${thb(p.budget)}</td><td class="num">${thb(p.budget)}</td><td class="num"><span class="muted xsmall">${L("ไม่เกินงบ", "on budget")}</span></td></tr></tbody></table>
    ${p.growth ? `<div class="xsmall chg-note">${L(`ต้นทุนเพิ่มจากคนที่มากขึ้น ${thb(p.growth)} · ลดส่วนที่ไม่ใช่จุดสำคัญได้ ${thb(p.cuts.reduce((t, c) => t + c.saving, 0))} (ร้านเสนอไว้แล้ว) · ไม่ลดงบเวที แสง เสียง และโชว์`, `More guests cost ${thb(p.growth)} · trims the vendors offered save ${thb(p.cuts.reduce((t, c) => t + c.saving, 0))} · stage, light, sound and show untouched`)}</div>` : ""}

    <div class="pl-h">4 · ${L("ร่างข้อความถึงร้าน", "Messages to vendors")} <span class="chip chip-amber"><i></i>${L("รอคุณอนุมัติก่อนส่ง", "Waiting for your approval")}</span></div>
    <div class="pl-drafts">${p.drafts.map((d) => `<div class="pl-draft"><b>${esc(d.shopName)}</b>${d.ask ? ` <span class="xsmall muted">· ${L("ต้องให้ร้านตอบ", "needs an answer")}</span>` : ""}${!d.ordered ? ` <span class="xsmall muted">· ${L("จะแนบไปกับออเดอร์", "goes with the order")}</span>` : ""}<div class="xsmall">${esc(L(d.th, d.en))}</div></div>`).join("")}</div>
    <p class="pl-warn">${L(`ORCA ยังไม่รับประกันว่าจะรองรับ ${p.g1} คนในงบเดิมได้ จนกว่าร้านจะยืนยันราคาและความพร้อมจริง ตัวเลขด้านบนคือสิ่งที่ ORCA รู้ตอนนี้`, `I can't promise ${p.g1} guests on the same budget until the vendors confirm prices and availability; the numbers above are what I know now.`)}</p>
    ${last ? `<div class="row" style="gap:6px"><button class="btn sm" data-act="cxQuick" data-t="อนุมัติแผน A">${L("อนุมัติแผน A และส่งให้ร้าน", "Approve plan A and send")}</button>${p.planB ? `<button class="btn sm pearl" data-act="cxQuick" data-t="เลือกแผน B">${L("เลือกแผน B", "Choose plan B")}</button>` : ""}<button class="btn sm ghost" data-act="cxQuick" data-t="ยังไม่เปลี่ยน">${L("ยังไม่เปลี่ยน", "Not now")}</button></div>` : ""}
  </div>`;
}

function chatMsg(m, last) {
  if (m.from === "customer") return `<div class="cx-m me"><div class="bubble">${esc(m.th)}</div><div class="cx-at">${ago(m.at)}</div></div>`;
  const d = m.dna;
  const creative = d?.creative ? d : null;
  const boxes = !creative && d?.boxes?.length ? d.boxes : null;
  return `<div class="cx-m orca${boxes || creative || m.plan ? " wide" : ""}"><span class="cx-av">${LOGO}</span><div class="cx-body">
    <div class="bubble">${esc(m.change ? L(m.change.intro.th, m.change.intro.en) : m.plan && m.intro ? L(m.intro.th, m.intro.en) : L(m.th, m.en))}</div>
    ${m.change ? changeCard(m) : ""}
    ${m.plan ? planCard(m, last) : ""}
    ${m.brief ? `<blockquote class="dx-brief">${markedBrief(m.brief)}</blockquote>` : ""}
    ${creative ? creativeBlock(creative) : ""}
    ${d && !creative ? `<div class="cx-dna"><div class="dx-label">${L("Event DNA · ตัวตนของงานคุณ", "Event DNA")}</div><div class="row">${(L(d.chipsTh, d.chips) || d.chips).map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div>
      ${d.avoid.length ? `<div class="small"><span class="muted">${L("ไม่เอา:", "Avoid:")}</span> ${esc(L((d.avoidTh || d.avoid).join(", "), d.avoid.join(", ")))}</div>` : ""}
      ${boxes ? "" : `${d.mood.length ? `<div class="small"><span class="muted">Mood:</span> ${esc(d.mood.join(", "))}</div>` : ""}
      ${d.look.length ? `<div class="small"><span class="muted">Look:</span> ${esc(d.look.join(", "))}</div>` : ""}
      ${d.needs.length ? `<div class="small"><span class="muted">Must-haves:</span> ${esc(d.needs.join(" · "))}</div>` : ""}`}</div>` : ""}
    ${boxes ? `${dnaBoxes(boxes)}<p class="dx-tag">${L("ทุกข้อมาจากคำพูดของคุณเอง แตะที่ข้อไหนก็ได้เพื่อดูว่ามาจากประโยคไหน · ✦ คือสิ่งที่ ORCA ตีความจากบรรยากาศที่คุณเล่า", "“Every requirement traced back to the client’s own words.” Tap a line to see the words · ✦ = read between the lines")}</p>` : ""}
    ${m.after ? `<div class="bubble">${esc(L(m.after.th, m.after.en))}</div>` : ""}
    ${m.proposal && !m.change?.pending && C.cx?.proposal?.length ? `<button class="btn sm ghost" data-act="cxSeeProp">${L("ดูร้านที่แนะนำ ↓", "See suggested vendors ↓")}</button>` : ""}
    ${last && m.quick?.length && !m.plan ? `<div class="cx-quick">${m.quick.map((q) => `<button class="btn sm pearl" data-act="cxQuick" data-t="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : ""}
    <div class="cx-at">ORCA · ${ago(m.at)}</div></div></div>`;
}

function orderCard(o) {
  const upd = o.lastChange && o.lastChange.at === C.lastChangeAt;
  const fresh = upd && Date.now() - new Date(o.lastChange.at).getTime() < FRESH_MS && !C.flashed?.has(o.vendorId + o.lastChange.at);
  return `<div class="ox ${o.status}${upd ? " updated" : ""}${fresh ? " flash" : ""}">
    <div class="ox-thumb">${portfolioTile({ shopName: o.shopName, palette: o.palette, portfolio: o.portfolio }, 0, "sq")}</div>
    <div class="ox-main"><div class="row between" style="gap:6px"><a class="shop-link" href="#/shop/${o.vendorId}"><b>${esc(o.shopName)}</b></a><span class="chip chip-${STATUS_TONE[o.status] || "gray"}"><i></i>${esc(L(o.statusTh, o.statusEn))}</span></div>
      <div class="xsmall muted">${esc(o.slotTh ? L(o.slotTh, o.slotEn) : catLabel(o.category))} · ${esc(L(o.itemTh || o.item || "", o.item || ""))}${o.qty > 1 ? ` × ${o.qty}` : ""}</div>
      ${o.extras.map((x) => `<div class="xsmall muted">${x.amount < 0 ? "−" : "+"} ${esc(L(x.itemTh || x.item, x.item).replace(/^Extra: /, L("เพิ่มเติม: ", "Extra: ")))} ${thb(Math.abs(x.amount))}</div>`).join("")}
      ${upd ? `<div class="ox-upd">${L("ORCA อัปเดตล่าสุด", "Just updated by ORCA")}${o.lastChange.before != null && o.lastChange.before !== o.total ? ` · ${L("เดิม", "was")} <s>${thb(o.lastChange.before)}</s>` : ""}</div>` : ""}
      <div class="row between"><span class="xsmall muted">#${esc(o.no)}</span><b class="num">${thb(o.total)}</b></div></div>
  </div>`;
}

function drawChat() {
  const x = C.cx;
  const e = x.event;
  subnav(L("แชทกับ ORCA", "Chat with ORCA"), [], `<button class="btn sm pearl" data-act="signOut">${L("+ บัญชีใหม่", "+ New account")}</button> <a class="btn sm ghost" href="/vendor.html${x.orders[0] ? `#/shop/${x.orders[0].vendorId}/orders` : ""}" target="_blank" rel="noopener">${L("ดูฝั่งร้านค้า ↗", "Vendor side ↗")}</a>`);
  const draft = document.getElementById("cx-in")?.value || "";
  const oldBox = document.getElementById("cx-msgs");
  const keepChat = oldBox && C.chatLen === x.chat.length ? oldBox.scrollTop : null;
  const keepSide = document.querySelector(".cx-side")?.scrollTop || 0;
  C.lastChangeAt = x.orders.reduce((a, o) => (o.lastChange?.at > a ? o.lastChange.at : a), "");
  const newChange = C.chatLen != null && C.chatLen !== x.chat.length && x.chat.at(-1)?.change;
  $main.innerHTML = `<div class="cx">
    <section class="cx-chat card">
      <div class="cx-head"><span class="cx-av">${LOGO}</span><div><b>ORCA</b><div class="xsmall muted">${L("ผู้ช่วยจัดงาน AI · ตอบทันที", "AI event concierge · replies instantly")}</div></div></div>
      <div class="cx-msgs" id="cx-msgs" aria-live="polite">${x.chat.map((m, i) => chatMsg(m, i === x.chat.length - 1)).join("")}</div>
      <div class="cx-compose">
        ${!e ? `<div class="cx-ex"><span class="xsmall muted">${L("ลองใช้ตัวอย่าง:", "Try an example:")}</span>${EXAMPLES.map(([l, t], i) => `<button class="btn xs pearl" data-act="cxEx" data-i="${i}">${esc(l)}</button>`).join("")}</div>` : ""}
        <div class="cx-row"><textarea id="cx-in" class="input" rows="2" placeholder="${e ? L("อยากเปลี่ยนอะไร พิมพ์บอกได้เลย เช่น ขอเพิ่มแขกเป็น 200 คน", "Type any change, e.g. make it 200 guests") : L("อยากได้อะไร บอก ORCA มาเลยครับ…", "Tell ORCA what kind of event you want…")}" aria-label="${L("ข้อความถึง ORCA", "Message to ORCA")}">${esc(draft)}</textarea>
          <button class="btn" data-act="cxSend">${L("ส่ง", "Send")}</button></div>
      </div>
    </section>
    <aside class="cx-side">
      ${e ? `<div class="card cx-event"><div class="eyebrow">${L("งานของคุณ", "Your event")}</div><b>${esc(L(e.nameTh || e.name, e.name))}</b>
        <div class="small muted">${fmtDate(e.date, { weekday: true })} · ${e.guests} ${L("ท่าน", "guests")} · ${esc(placeL(e.location))}</div>
        <div class="row">${(L(e.chipsTh, e.chips) || e.chips).map((c) => `<span class="tag" style="font-size:12px;padding:3px 9px">${esc(c)}</span>`).join("")}</div></div>` : ""}
      ${x.proposal.length ? proposalCard(x) : ""}
      ${x.orders.length || !x.proposal.length ? `<div class="card cx-orders">
        <div class="card-head"><h3>${L("ออเดอร์ของคุณ", "Your orders")}</h3><span class="count">${x.orders.length}</span></div>
        ${x.orders.map(orderCard).join("") || `<div class="muted small">${L("ยังไม่มีออเดอร์ เล่างานให้ ORCA ฟังก่อน แล้ว ORCA จะคัดร้านมาให้เลือก", "No orders yet. Tell ORCA about your event and it will pick vendors for you to choose from.")}</div>`}
        ${x.orders.length ? `<div class="row between cx-total"><b>${L("ยอดรวม", "Total")}</b><b class="num">${thb(x.total)}</b></div>
          ${e?.budget ? `<div class="bar"><i class="${x.total > e.budget ? "over" : ""}" style="width:${Math.min(100, (x.total / e.budget) * 100)}%"></i></div><div class="xsmall muted">${L(`จากงบ ${thb(e.budget)}`, `of ${thb(e.budget)} budget`)}</div>` : ""}` : ""}
        ${x.waiting ? `<button class="btn sm ghost" data-act="cxSim">${L(`จำลองให้ร้านตอบกลับ (เดโม) · ${x.waiting}`, `Simulate vendor replies (demo) · ${x.waiting}`)}</button>` : ""}
      </div>` : ""}
      ${x.payment.paid || x.payment.depositDue || x.payment.balanceDue ? payCard(x) : ""}
    </aside>
  </div>`;
  const box = document.getElementById("cx-msgs");
  const lastMsg = box.lastElementChild;
  box.scrollTop = keepChat ?? (lastMsg ? lastMsg.offsetTop - 12 : box.scrollHeight);
  C.chatLen = x.chat.length;
  const side = document.querySelector(".cx-side");
  if (side) side.scrollTop = keepSide;
  const firstUpd = side?.querySelector(".ox.updated");
  if (newChange && firstUpd && matchMedia("(min-width: 861px)").matches) side.scrollTo({ top: Math.max(0, firstUpd.offsetTop - side.offsetTop - 60), behavior: "smooth" });
  // animate a fresh change only once
  C.seen ??= new Set(); C.flashed ??= new Set();
  setTimeout(() => { for (const m of x.chat) C.seen.add(m.id); for (const o of x.orders) if (o.lastChange) C.flashed.add(o.vendorId + o.lastChange.at); }, 0);
}


// ---------- suggested vendors (before ordering)
const stars = (r) => (r ? `★ ${Number(r).toFixed(1)}` : "");
function optionCard(p, o, chosen) {
  return `<div class="po ${chosen ? "chosen" : ""}">
    <div class="po-thumb">${portfolioTile({ shopName: o.shopName, palette: o.palette, portfolio: o.portfolio }, 0)}</div>
    <div class="po-main">
      <div class="row between" style="gap:6px"><a class="shop-link" href="#/shop/${o.vendorId}"><b>${esc(o.shopName)}</b></a>${chosen ? `<span class="chip chip-green"><i></i>${L("เลือกแล้ว", "Chosen")}</span>` : ""}</div>
      <div class="xsmall muted">${o.rating ? `${starBar(o.rating)} <b>${Number(o.rating).toFixed(1)}</b> (${o.reviewCount} ${L("รีวิว", "reviews")})` : ""}${o.verified ? ` · ✔ ${L("ยืนยันแล้ว", "Verified")}` : ""} · ${o.eventsDone} ${L("งาน", "events")}</div>
      ${o.score != null ? `<div class="po-match"><span class="dots-mini" style="--p:${Math.round((o.score / 5) * 100)}%"></span>${L("เข้ากับงาน", "Match")} ${o.score}/5</div>` : ""}
      ${o.why ? `<div class="xsmall po-why">${esc(L(o.whyTh || o.why, o.why))}</div>` : ""}
      <div class="row between"><span class="xsmall muted">${esc(L(o.itemTh || o.item, o.item))}</span><b class="num">${thb(o.estimate)}</b></div>
      <div class="row" style="gap:6px"><button class="btn xs pearl" data-act="vProfile" data-id="${o.vendorId}" data-cat="${p.slot || p.category}">${L("ดูผลงานและรีวิว", "Work & reviews")}</button>
        ${chosen ? "" : `<button class="btn xs" data-act="cxChoose" data-cat="${p.slot || p.category}" data-id="${o.vendorId}">${L("เลือกร้านนี้", "Choose")}</button>`}</div>
    </div>
  </div>`;
}
function proposalCard(x) {
  return `<div class="card cx-prop" id="cx-prop">
    <div class="card-head"><h3>${L("ร้านที่ ORCA แนะนำ", "Vendors ORCA suggests")}</h3><span class="count">${x.proposal.length} ${L("หมวด", "services")}</span></div>
    <p class="xsmall muted" style="margin:0">${L("ยังไม่ได้สั่งจองนะครับ ดูผลงาน รีวิว แล้วเลือกร้านที่ชอบ จากนั้นกดยืนยันเพื่อส่งออเดอร์", "Nothing is booked yet. Check work and reviews, pick the ones you like, then confirm to send the orders.")}</p>
    ${x.proposal.map((p) => {
      const chosen = p.options.find((o) => o.vendorId === p.chosen) || p.options[0];
      const others = p.options.filter((o) => o.vendorId !== chosen.vendorId);
      const open = C.propOpen === (p.slot || p.category);
      return `<div class="pc">
        <div class="row between"><div class="eyebrow">${esc(p.slotTh ? L(p.slotTh, p.slotEn) : catLabel(p.category))}${p.reason === "replacement" ? ` · ${L("ร้านแทน", "replacement")}` : p.reason === "new" ? ` · ${L("เพิ่มใหม่", "new")}` : ""}</div>
          ${others.length ? `<button class="btn link xs" data-act="cxOthers" data-cat="${p.slot || p.category}">${open ? L("ซ่อนตัวเลือก", "Hide options") : L(`ดูตัวเลือกอื่น (${others.length})`, `Other options (${others.length})`)}</button>` : ""}</div>
        ${optionCard(p, chosen, true)}
        ${open ? `<div class="pc-others">${others.map((o) => optionCard(p, o, false)).join("")}</div>` : ""}
      </div>`;
    }).join("")}
    <div class="row between cx-total"><b>${L("ประมาณการรวม", "Estimated total")}</b><b class="num">${thb(x.proposalTotal)}</b></div>
    ${(() => { const miss = [!x.event?.date && L("วันจัดงาน", "the date"), !x.event?.guests && L("จำนวนแขก", "the guest count")].filter(Boolean); return miss.length ? `<p class="xsmall pc-need">${L(`บอก ${miss.join(" และ ")} ในแชทก่อน แล้ว ORCA จะส่งออเดอร์ให้ครับ`, `Tell ORCA ${miss.join(" and ")} in the chat first, then send the orders.`)}</p><button class="btn lg" disabled>${L("ยืนยันร้านและส่งออเดอร์", "Confirm and send orders")}</button>` : `<button class="btn lg" data-act="cxConfirm">${L("ยืนยันร้านและส่งออเดอร์", "Confirm and send orders")}</button>`; })()}
  </div>`;
}

// ---------- payment
function payCard(x) {
  const p = x.payment;
  return `<div class="card cx-pay">
    <div class="card-head"><h3>${L("การชำระเงิน", "Payment")}</h3>${p.paid ? `<span class="chip chip-green"><i></i>${L("ชำระแล้ว", "Paid")} ${thb(p.paid)}</span>` : ""}</div>
    <div class="pay-rows">
      <div><span>${L("ยอดรวมที่ร้านยืนยัน", "Confirmed total")}</span><b class="num">${thb(x.orders.filter((o) => o.status === "accepted").reduce((s, o) => s + o.total, 0))}</b></div>
      <div><span>${L(`มัดจำ ${Math.round(p.depositRate * 100)}%`, `Deposit ${Math.round(p.depositRate * 100)}%`)}</span><b class="num">${p.depositDue ? thb(p.depositDue) : p.paid ? "✓" : "—"}</b></div>
      <div><span>${L("ยอดคงเหลือ", "Balance")}${p.balanceDate ? ` <span class="muted xsmall">${L("ครบกำหนด", "due")} ${fmtDate(p.balanceDate)}</span>` : ""}</span><b class="num">${p.balanceDue ? thb(p.balanceDue) : "—"}</b></div>
    </div>
    ${p.depositDue ? `<button class="btn lg shopee" data-act="payOpen" data-k="deposit">${L(`ชำระมัดจำ ${thb(p.depositDue)}`, `Pay deposit ${thb(p.depositDue)}`)}</button>`
      : p.balanceDue ? `<button class="btn ghost" data-act="payOpen" data-k="balance">${L(`ชำระยอดคงเหลือ ${thb(p.balanceDue)}`, `Pay the balance ${thb(p.balanceDue)}`)}</button>` : ""}
    <div class="xsmall muted">🔒 ${L("ORCA ถือเงินไว้ให้ จนกว่างานจะจบ แล้วจึงโอนให้ร้าน ถ้าร้านยกเลิก คุณได้เงินคืนเต็มจำนวน", "ORCA holds your money until the event is over, then pays the vendors. If a vendor cancels, you get a full refund.")}</div>
    ${p.history.length ? `<details><summary class="small">${L("ประวัติการชำระ", "Payment history")} (${p.history.length})</summary>${p.history.map((h) => `<div class="row between xsmall" style="padding:4px 0"><span>${h.kind === "deposit" ? L("มัดจำ", "Deposit") : L("ยอดคงเหลือ", "Balance")} · ${esc(h.id)} · ${fmtDate(h.at)}</span><b>${thb(h.amount)}</b></div>`).join("")}</details>` : ""}
  </div>`;
}

const fakeQR = () => {
  // decorative only: not a scannable code
  let cells = ""; let seed = 7;
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) { seed = (seed * 16807) % 2147483647; const corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13); if (corner ? (x % 6 === 0 || y % 6 === 0 || (x % 7 > 1 && x % 7 < 5 && y % 7 > 1 && y % 7 < 5)) : seed % 2) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }
  return `<svg viewBox="-1 -1 23 23" class="qr" role="img" aria-label="${L("QR ตัวอย่าง", "Sample QR")}"><rect x="-1" y="-1" width="23" height="23" fill="#fff"/><g fill="#1d1d1f">${cells}</g></svg>`;
};
on("payOpen", (el) => {
  const kind = el.dataset.k;
  const p = C.cx.payment;
  const amount = kind === "deposit" ? p.depositDue : p.balanceDue;
  C.payKind = kind; C.payMethod = "promptpay";
  drawer(`<div class="dh"><h2>${kind === "deposit" ? L("ชำระมัดจำ", "Pay the deposit") : L("ชำระยอดคงเหลือ", "Pay the balance")}</h2><button class="icon-btn" data-close aria-label="${L("ปิด", "Close")}">✕</button></div>
    <div class="db">
      <div class="pay-amount"><span>${L("ยอดที่ต้องชำระ", "Amount due")}</span><b class="num">${thb(amount)}</b></div>
      <div class="field"><span class="lbl">${L("วิธีชำระเงิน", "Payment method")}</span>
        <div class="choice pay-methods">${[["promptpay", L("พร้อมเพย์ (QR)", "PromptPay (QR)")], ["banking", L("โมบายแบงก์กิ้ง", "Mobile banking")], ["card", L("บัตรเครดิต / เดบิต", "Credit / debit card")]].map(([k, l]) => `<label><input type="radio" name="paym" value="${k}" ${k === "promptpay" ? "checked" : ""} data-change="payMethod"><span>${l}</span></label>`).join("")}</div></div>
      <div class="pay-box" id="pay-box">${payBox("promptpay")}</div>
      <div class="card flat small">🔒 ${L("เงินจะถูกพักไว้กับ ORCA (escrow) จนจบงาน ร้านเห็นว่าคุณชำระแล้ว แต่ได้รับเงินหลังงานเสร็จ", "Your money is held by ORCA (escrow) until the event is over. Vendors see that you've paid, and receive it after the event.")}</div>
    </div>
    <div class="df"><span class="xsmall muted" style="flex:1;align-self:center">${L("เดโม: ไม่มีการตัดเงินจริง", "Demo: no real money is charged.")}</span><button class="btn shopee" data-act="payDo">${L(`ยืนยันการชำระ ${thb(amount)}`, `Pay ${thb(amount)}`)}</button></div>`);
});
function payBox(m) {
  if (m === "promptpay") return `<div class="row" style="gap:16px;align-items:center">${fakeQR()}<div class="small">${L("สแกนด้วยแอปธนาคาร<br><span class=\"xsmall muted\">QR ตัวอย่างสำหรับเดโม สแกนไม่ได้จริง</span>", "Scan with your banking app<br><span class=\"xsmall muted\">Sample QR for the demo; it can't be scanned.</span>")}</div></div>`;
  if (m === "banking") return `<div class="row">${["K PLUS", "SCB EASY", "Krungthai NEXT", "Bualuang mBanking"].map((b) => `<span class="tag">${b}</span>`).join("")}</div><div class="xsmall muted" style="margin-top:6px">${L("ระบบจะเปิดแอปธนาคารให้ยืนยัน (เดโม)", "Opens your banking app to confirm (demo).")}</div>`;
  return `<div class="small">${L("ชำระผ่านหน้าชำระเงินที่ปลอดภัยของผู้ให้บริการ (เช่น Omise / 2C2P) ORCA ไม่เก็บเลขบัตร", "Pay on the provider's secure payment page (e.g. Omise / 2C2P). ORCA never stores card numbers.")}</div><div class="xsmall muted" style="margin-top:6px">${L("เดโม: ยังไม่ได้ต่อกับผู้ให้บริการจริง", "Demo: not connected to a real provider yet.")}</div>`;
}
on("payMethod", (el) => { C.payMethod = el.value; document.getElementById("pay-box").innerHTML = payBox(el.value); });
on("payDo", async (el) => {
  busy(el, true, L("กำลังชำระ…", "Paying…"));
  try {
    C.cx = await api(`/api/customers/${C.me}/pay`, { method: "POST", body: { kind: C.payKind, method: C.payMethod } });
    closeDrawerSafe();
    toast(L(`ชำระแล้ว ใบเสร็จ ${esc(C.cx.receipt.id)}`, `Paid. Receipt ${esc(C.cx.receipt.id)}`));
    drawChat();
  } catch (err) { fail(err); busy(el, false); }
});
const closeDrawerSafe = () => document.querySelectorAll(".drawer-wrap").forEach((w) => w.remove());

// ---------- vendor profile: portfolio, reviews, trust
on("vProfile", (el) => { location.hash = `#/shop/${el.dataset.id}`; });
on("cxOthers", (el) => { C.propOpen = C.propOpen === el.dataset.cat ? null : el.dataset.cat; drawChat(); document.getElementById("cx-prop")?.scrollIntoView({ block: "nearest" }); });
on("cxChoose", async (el) => {
  busy(el, true, "…");
  try { C.cx = await api(`/api/customers/${C.me}/choose`, { method: "POST", body: { category: el.dataset.cat, vendorId: el.dataset.id } }); closeDrawerSafe(); C.propOpen = null; toast(L("เปลี่ยนร้านแล้ว", "Vendor changed.")); if (location.hash.startsWith("#/shop/")) location.hash = "#/chat"; else drawChat(); }
  catch (err) { fail(err); busy(el, false); }
});
on("cxConfirm", async (el) => {
  busy(el, true, L("กำลังส่งออเดอร์…", "Sending orders…"));
  try { C.cx = await api(`/api/customers/${C.me}/confirm`, { method: "POST", body: {} }); toast(L("ส่งออเดอร์แล้ว รอร้านยืนยัน", "Orders sent. Waiting for vendors.")); drawChat(); }
  catch (err) { fail(err); busy(el, false); }
});
on("dxQuote", (el) => { const open = el.classList.toggle("open"); el.setAttribute("aria-expanded", String(open)); });
on("cxBoxMore", (el) => { C.propOpen = el.dataset.cat; drawChat(); document.getElementById("cx-prop")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
on("cxSeeProp", () => document.getElementById("cx-prop")?.scrollIntoView({ behavior: "smooth", block: "start" }));

async function pollChat() {
  if (!location.hash.startsWith("#/chat") || !C.me) return clearInterval(pollTimer);
  if (document.activeElement?.id === "cx-in" && document.getElementById("cx-in").value) return; // don't redraw while typing
  try {
    const next = await api(`/api/customers/${C.me}`);
    const sig = (x) => `${x.chat.length}|${x.orders.map((o) => o.status + o.total + o.paid).join()}|${x.proposal.map((p) => p.chosen).join()}`;
    if (sig(next) !== sig(C.cx)) { C.cx = next; drawChat(); }
  } catch {}
}

async function sendChat(text, el) {
  text = text.trim();
  if (!text) return toast(L("พิมพ์ข้อความก่อนนะครับ", "Type a message first."), "err");
  const box = document.getElementById("cx-msgs");
  box.insertAdjacentHTML("beforeend", `<div class="cx-m me"><div class="bubble">${esc(text)}</div></div><div class="cx-m orca typing"><span class="cx-av">${LOGO}</span><div class="cx-body"><div class="bubble"><span class="dots3"><i></i><i></i><i></i></span> <span id="cx-think">${THINK[0]()}</span></div></div></div>`);
  box.scrollTop = box.scrollHeight;
  let step = 0;
  const thinking = setInterval(() => { const t = document.getElementById("cx-think"); if (!t) return clearInterval(thinking); step = Math.min(step + 1, THINK.length - 1); t.textContent = THINK[step](); }, 800);
  document.getElementById("cx-in").value = "";
  busy(el, true, "…");
  try {
    C.cx = await api(`/api/customers/${C.me}/messages`, { method: "POST", body: { text } });
    if (C.cx.aiError) toast(L("Claude ไม่ว่าง ใช้เครื่องมือออฟไลน์แทน", "Claude was unavailable; used the offline engine."), "err");
    clearInterval(thinking);
    drawChat();
  } catch (err) { clearInterval(thinking); fail(err); busy(el, false); document.querySelector(".cx-m.typing")?.remove(); document.getElementById("cx-in").value = text; }
}
const THINK = [() => L("ORCA กำลังอ่านข้อความ…", "Reading your message…"), () => L("เช็คข้อมูลร้านในระบบ…", "Checking vendor records…"), () => L("อัปเดตออเดอร์และราคา…", "Updating orders and prices…")];
on("cxSend", (el) => sendChat(document.getElementById("cx-in").value, el));
on("cxQuick", (el) => sendChat(el.dataset.t, el));
on("cxEx", (el) => { const t = document.getElementById("cx-in"); t.value = EXAMPLES[Number(el.dataset.i)][1]; t.focus(); });
on("cxSim", async (el) => {
  busy(el, true, L("ร้านกำลังตอบ…", "Vendors are replying…"));
  try { C.cx = await api(`/api/customers/${C.me}/simulate`, { method: "POST", body: {} }); drawChat(); }
  catch (err) { fail(err); busy(el, false); }
});
document.addEventListener("keydown", (e) => {
  if (e.target.id === "cx-in" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); document.querySelector('[data-act="cxSend"]')?.click(); }
  if (e.target.matches?.('li[role="button"][data-act]') && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.target.click(); }
});

// ---------------------------------------------------------------- event (organizer-led)
async function load(id) {
  C.id = id;
  C.data = await api(`/api/client-portal/${id}`);
  return C.data;
}

async function renderEvent(id, tab) {
  await load(id);
  nav();
  const d = C.data;
  subnav(d.event.name, [
    ["overview", L("ภาพรวม", "Overview")], ["ideas", L("คอนเซปต์และตัวเลือก", "Concepts & options")], ["approvals", L("ข้อเสนอ", "Proposals"), d.outstanding.length], ["files", L("ไฟล์", "Files")], ["work", L("ผลงาน ORCA", "ORCA's work")],
  ].map(([k, label, n]) => ({ href: `#/e/${id}/${k}`, label, n, on: tab === k })));
  await showcase();
  ({ overview: renderOverview, ideas: renderIdeas, approvals: renderProposals, files: renderFiles, work: renderWork }[tab] || renderOverview)();
  window.scrollTo(0, 0);
}
const rerender = () => renderEvent(C.id, (location.hash.split("/")[3]) || "overview");

const commentsFor = (kind, id) => C.data.comments.filter((c) => c.target.kind === kind && c.target.id === String(id));
function commentBlock(kind, id, list) {
  return `<div class="comments">${list.map((c) => `<div class="cm ${c.fromOrganizer ? "" : "client"}"><div class="row xsmall"><b>${esc(c.who)}</b>${c.fromOrganizer ? `<span class="muted">${L("ผู้จัดงาน", "Organizer")}</span>` : ""}<span class="muted">${ago(c.at)}</span></div><div class="small">${esc(c.text)}</div></div>`).join("")}</div>
    <div class="row"><input class="input" id="c-${kind}-${esc(id)}" style="flex:1;min-width:0" placeholder="${L("คอมเมนต์ตรงนี้", "Comment on this")}" aria-label="${L("คอมเมนต์", "Comment")}" ${PREVIEW ? "disabled" : ""}>
    <button class="btn sm ghost" data-act="comment" data-kind="${kind}" data-id="${esc(id)}" ${PREVIEW ? "disabled" : ""}>${L("ส่ง", "Comment")}</button></div>`;
}

function decideBox(a, compact = false) {
  if (a.status !== "pending") return `<div class="decide"><div>${statusChip(a.status)}</div><div class="small muted">${a.status === "approved" ? L(`คุณอนุมัติ ${esc(a.version)} แล้ว`, `You approved ${esc(a.version)}.`) : a.status === "revision" ? L("ผู้จัดงานกำลังทำเวอร์ชันใหม่", "Your organizer is preparing a new version.") : L("ข้อเสนอนี้ถูกปฏิเสธ", "This proposal was declined.")}</div></div>`;
  return `<div class="decide">
    <b>${L(`อนุมัติ ${esc(a.version)} ไหม?`, `Approve ${esc(a.version)}?`)}</b>${a.dueBy ? `<span class="xsmall muted">${L(`กรุณาตัดสินใจภายใน ${fmtDate(a.dueBy)}`, `Please decide by ${fmtDate(a.dueBy)}`)}</span>` : ""}
    <button class="btn" data-act="decide" data-id="${a.id}" data-d="approve" ${PREVIEW ? "disabled" : ""}>${L(`อนุมัติ ${esc(a.version)}`, `Approve ${esc(a.version)}`)}</button>
    ${compact ? "" : `<textarea class="input" id="rv-${a.id}" style="min-height:60px" placeholder="${L("อยากให้แก้อะไร?", "What should change?")}" aria-label="${L("อยากให้แก้อะไร", "What should change")}" ${PREVIEW ? "disabled" : ""}></textarea>`}
    <button class="btn ghost" data-act="decide" data-id="${a.id}" data-d="revision" ${PREVIEW ? "disabled" : ""}>${L("ขอแก้ไข", "Request revision")}</button>
  </div>`;
}

function renderOverview() {
  const d = C.data; const e = d.event;
  const pending = d.approvals.filter((a) => a.status === "pending");
  $main.innerHTML = `
    <section class="client-hero">
      <div class="eyebrow">${esc(e.type || L("งาน", "Event"))} · ${L("บรีฟ", "brief")} v${e.briefVersion}</div>
      <h1>${esc(e.name)}</h1>
      <div class="row">${e.chips.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div>
      <p style="margin:0;max-width:760px">${esc(e.summary)}</p>
      <dl class="kvlist" style="max-width:520px"><dt>${L("วันงาน", "Date")}</dt><dd>${fmtDate(e.date, { weekday: true })}</dd><dt>${L("สถานที่", "Location")}</dt><dd>${esc(e.location || L("รอยืนยัน", "To be confirmed"))}</dd><dt>${L("แขก", "Guests")}</dt><dd>${e.guests ?? L("รอยืนยัน", "To be confirmed")}</dd><dt>${L("ขั้นตอน", "Planning stage")}</dt><dd>${esc(e.stage || "")}</dd></dl>
    </section>
    <div class="grid g2" style="margin-top:22px;align-items:start">
      <div class="card stack"><div class="card-head"><h3>${L("รอคุณตัดสินใจ", "Waiting for your decision")}</h3><span class="count">${pending.length}</span></div>
        ${pending.map((a) => `<div class="proposal-grid" style="padding:10px 0;border-bottom:1px solid var(--divider)">
          <div><div class="eyebrow">${esc(TYPE_LABEL[a.type] || a.type)}</div><b>${esc(a.title)}</b> <span class="version-badge light">${esc(a.version)}</span>
            <div class="small muted">${esc(a.summary)}</div><a class="small" href="#/e/${C.id}/approvals">${L("ดูรายละเอียด", "See details")}</a></div>
          ${decideBox(a, true)}</div>`).join("") || `<div class="muted small">${L("ตอนนี้ยังไม่มี จะแจ้งเมื่อมีครับ", "Nothing right now. We will let you know when there is.")}</div>`}
      </div>
      <div class="card stack"><h3>${L("ความรู้สึกที่เรากำลังออกแบบ", "The feeling we're designing for")}</h3>
        <div class="style-rows" style="margin-top:0">${[["Mood", e.style.mood], ["Feel", e.style.feel], ["Look", e.style.look], ["Avoid", e.style.avoid, "avoid"]].map(([k, list, cls]) => `<div class="style-row"><div class="k" style="color:var(--ink-48)">${k}</div><div class="v">${list.map((t) => `<span class="tag ${cls || ""}">${esc(t)}</span>`).join("") || "—"}</div></div>`).join("")}</div>
        <details><summary>${L("สิ่งที่เรากำลังวางแผน", "What we're planning")} (${e.brief.length})</summary><ul class="clean">${e.brief.map((r) => `<li><span class="muted">${esc(r.category)}:</span> ${r.kind === "requirement" ? `<b>${esc(r.text)}</b>` : esc(r.text)}</li>`).join("")}</ul></details>
      </div>
    </div>
    ${showcaseBand(SC, { limit: 3, title: L("บรีฟของคุณอยู่ในมือที่ใช่", "Your brief is in good hands"), sub: L("บรีฟที่แปลกที่สุดบางส่วนที่ ORCA เคยอ่าน และสิ่งที่มันกลายเป็น", "Some of the strangest briefs ORCA has read, and what they became."), more: `#/e/${C.id}/work` })}`;
}

function renderIdeas() {
  const d = C.data;
  const board = (c) => portfolioTile({ shopName: c.title, palette: c.palette, portfolio: [{ title: c.title }] });
  $main.innerHTML = `
    <div class="page-head"><div><h1>${L("คอนเซปต์และตัวเลือก", "Concepts & options")}</h1><p>${L("บอกเราว่าชอบอะไร อะไรที่ยังไม่ใช่ คอมเมนต์ได้ทุกคอนเซปต์ ทุกรูป ทุกร้าน", "Tell us what you love and what feels off. Comment on any concept, image or vendor.")}</p></div></div>
    <h2 style="font-size:24px;margin-bottom:12px">${L("คอนเซปต์", "Concepts")}</h2>
    <div class="grid g2">${d.concepts.map((c) => `<article class="card concept">${board(c)}<h3>${esc(c.title)}</h3><p class="small" style="margin:0">${esc(c.description)}</p>
      <div class="row">${c.tags.map((t) => `<span class="tag" style="font-size:12px;padding:3px 9px">${esc(t)}</span>`).join("")}</div>${commentBlock("concept", c.id, commentsFor("concept", c.id))}</article>`).join("") || `<div class="empty">${L("คอนเซปต์จะแสดงที่นี่เมื่อผู้จัดงานแชร์", "Concepts will appear here once your organizer shares them.")}</div>`}</div>
    ${d.references.length ? `<h2 style="font-size:24px;margin:28px 0 12px">${L("ภาพอ้างอิงของคุณ", "Your reference images")}</h2><div class="grid g3">${d.references.map((r, i) => `<div class="card concept"><img src="${esc(r.url)}" alt="${L("ภาพอ้างอิง", "Reference")} ${i + 1}" style="border-radius:var(--r-md)">${commentBlock("reference", r.id, commentsFor("reference", r.id))}</div>`).join("")}</div>` : ""}
    <h2 style="font-size:24px;margin:28px 0 12px">${L("ตัวเลือกร้าน", "Vendor options")}</h2>
    ${d.options.map((o) => `<h3 style="margin:16px 0 10px">${esc(catLabel(o.category))}</h3><div class="grid g3">${o.vendors.map((v) => `<article class="card opt">${portfolioTile(v)}
      <div class="row between"><h3>${esc(v.shopName)}</h3>${v.proposed ? chip("granted", L("แนะนำ", "Recommended")) : chip("outline", L("ตัวเลือก", "Option"))}</div>
      <div class="xsmall muted">${esc(v.area)}</div><p class="small" style="margin:0">${esc(v.description)}</p>
      <div class="row">${v.style.map((t) => `<span class="tag" style="font-size:12px;padding:3px 9px">${esc(t)}</span>`).join("")}</div>
      ${commentBlock("option", v.id, commentsFor("option", v.id))}</article>`).join("")}</div>`).join("") || `<div class="empty">${L("ยังไม่มีตัวเลือกร้านที่แชร์", "No vendor options shared yet.")}</div>`}`;
}

function renderProposals() {
  const d = C.data;
  const card = (a) => `<article class="card proposal" id="p-${a.id}">
    <div class="appr-head"><div class="grow"><div class="eyebrow">${esc(TYPE_LABEL[a.type] || a.type)}</div><h3>${esc(a.title)}</h3></div><span class="version-badge">${esc(a.version)}</span>${statusChip(a.status)}</div>
    <div class="proposal-grid">
      <div class="stack">
        ${a.summary ? `<p class="small" style="margin:0">${esc(a.summary)}</p>` : ""}
        ${a.diffs.length ? `<div class="cmp"><div class="cmp-h"><span></span><span>${L("ตอนนี้", "Current")}</span><span>${L("ที่เสนอ", "Proposed")}</span></div>${a.diffs.map((x) => `<div class="cmp-r"><span class="k">${esc(x.label)}</span><span class="from">${esc(x.from)}</span><span class="to">${esc(x.to)}</span></div>`).join("")}</div>`
          : `<div><div class="eyebrow">${L("สิ่งที่คุณกำลังอนุมัติ", "What you're approving")}</div><dl class="kvlist appr-items">${a.items.map((i) => `<dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd>`).join("")}</dl></div>`}
        ${a.files.length ? `<div><div class="eyebrow">${L("เอกสาร", "Documents")}</div>${a.files.map((f) => `<div class="file-mini"><span class="ext">${esc(f.name.split(".").pop().slice(0, 4).toUpperCase())}</span><span class="grow">${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)} <span class="xsmall muted">v${f.version}</span></span></div>`).join("")}</div>` : ""}
        <details ${a.comments.length ? "open" : ""}><summary>${L("คอมเมนต์", "Comments")} <span class="muted">${a.comments.length}</span></summary>
          <div class="comments">${a.comments.map((c) => `<div class="cm client"><div class="row xsmall"><b>${esc(c.who)}</b><span class="muted">${ago(c.at)}</span></div><div class="small">${esc(c.text)}</div></div>`).join("")}</div>
          <div class="row"><input class="input" id="c-approval-${a.id}" style="flex:1;min-width:0" placeholder="${L("ถามหรือฝากข้อความ", "Ask a question or leave a note")}" aria-label="${L("คอมเมนต์", "Comment")}" ${PREVIEW ? "disabled" : ""}><button class="btn sm ghost" data-act="comment" data-kind="approval" data-id="${a.id}" ${PREVIEW ? "disabled" : ""}>${L("ส่ง", "Comment")}</button></div></details>
        <details><summary>${L("ประวัติ", "History")} <span class="muted">${a.history.length}</span></summary><ol class="history">${a.history.map((h) => `<li><b>${esc(ACTION_LABEL[h.action] || h.action)}</b> · ${esc(h.who)} <span class="muted">· ${fmtDateTime(h.at)}</span></li>`).join("")}</ol></details>
      </div>
      ${decideBox(a)}
    </div>
  </article>`;
  const open = d.approvals.filter((a) => a.status === "pending");
  const rest = d.approvals.filter((a) => a.status !== "pending");
  $main.innerHTML = `
    <div class="page-head"><div><h1>${L("ข้อเสนอ", "Proposals")}</h1><p>${L("อนุมัติเมื่อใช่ หรือบอกเราว่าอยากแก้อะไร ไม่มีการจองใดๆ ถ้าคุณยังไม่ตกลง", "Approve a version when it's right, or tell us what to change. Nothing is booked without your OK.")}</p></div></div>
    ${open.length ? `<section class="appr-group"><h2>${L("รอคุณตัดสินใจ", "Your decision")} <span class="count">${open.length}</span></h2>${open.map(card).join("")}</section>` : ""}
    ${rest.length ? `<section class="appr-group"><h2>${L("ตัดสินใจแล้วหรือกำลังดำเนินการ", "Decided or in progress")} <span class="count">${rest.length}</span></h2>${rest.map(card).join("")}</section>` : ""}
    ${d.approvals.length ? "" : `<div class="empty">${L("ยังไม่มีข้อเสนอ", "No proposals yet.")}</div>`}`;
}

function renderFiles() {
  const d = C.data;
  const groups = Object.keys(GROUP_LABEL).filter((g) => d.files.some((f) => f.group === g));
  $main.innerHTML = `
    <div class="page-head"><div><h1>${L("ไฟล์", "Files")}</h1><p>${L("เอกสารที่ผู้จัดงานแชร์ให้คุณ", "Documents your organizer has shared with you.")}</p></div></div>
    ${groups.map((g) => `<section class="file-group"><h2>${GROUP_LABEL[g]}</h2><div class="card files">${d.files.filter((f) => f.group === g).map((f) => `<div class="file"><span class="ext">${esc(f.name.split(".").pop().slice(0, 4).toUpperCase())}</span>
      <div class="grow"><div class="ttl">${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)} <span class="version-badge light">v${f.version}</span></div><div class="sub">${L("แชร์", "Shared")} ${ago(f.at)}${f.url ? "" : L(" · ไฟล์ตัวอย่าง", " · sample file")}</div></div></div>`).join("")}</div></section>`).join("") || `<div class="empty">${L("ยังไม่มีไฟล์ที่แชร์", "Nothing shared yet.")}</div>`}`;
}


// ---------------------------------------------------------------- shop pages (portfolio, stars, credit)
const starBar = (r, cls = "") => `<span class="stars ${cls}" style="--r:${Number(r) || 0}" role="img" aria-label="${L(`คะแนน ${r} จาก 5`, `${r} out of 5 stars`)}"></span>`;
let SHOPS = null;
const shops = async () => (SHOPS ||= await api("/api/shops"));
const shopIdByName = (name) => SHOPS?.find((s) => s.shopName === name)?.id;
const initials = (n) => String(n).replace(/^The /, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function shopCardHTML(s) {
  return `<a class="shop-card" href="#/shop/${s.id}">
    ${portfolioTile({ shopName: s.shopName, palette: s.palette, portfolio: s.portfolio })}
    <span class="shop-card-body">
      <span class="row between" style="gap:6px"><b>${esc(s.shopName)}</b>${s.verified ? `<span class="chip chip-green"><i></i>${L("ยืนยันแล้ว", "Verified")}</span>` : ""}</span>
      <span class="small">${s.rating ? `${starBar(s.rating)} <b>${s.rating.toFixed(1)}</b> <span class="muted">(${s.reviewCount})</span>` : `<span class="muted">${L("ร้านใหม่ ยังไม่มีรีวิว", "New shop, no reviews yet")}</span>`}</span>
      <span class="xsmall muted">${esc(catLabel(s.category))} · ${esc(placeL(s.area))} · ${s.eventsDone} ${L("งาน", "events")}</span>
      ${s.priceFrom != null ? `<span class="small">${L("เริ่มต้น", "From")} <b>${thb(s.priceFrom)}</b></span>` : ""}
    </span></a>`;
}

async function renderShops() {
  subnav(L("ร้านค้าบน ORCA", "Shops on ORCA"));
  const list = await shops();
  const cats = [...new Set(list.map((s) => s.category))];
  C.shopCat ??= ""; C.shopSort ??= "rating";
  const sorters = { rating: (a, b) => (b.rating || 0) - (a.rating || 0) || b.reviewCount - a.reviewCount, events: (a, b) => b.eventsDone - a.eventsDone, price: (a, b) => (a.priceFrom ?? 1e12) - (b.priceFrom ?? 1e12) };
  const shown = list.filter((s) => !C.shopCat || s.category === C.shopCat).sort(sorters[C.shopSort]);
  $main.innerHTML = `
    <div class="page-head"><div><h1>${L("ร้านค้าบน ORCA", "Shops on ORCA")}</h1><p>${L("ดูผลงาน คะแนน และเครดิตของทุกร้านก่อนเลือก ORCA คัดร้านที่เข้ากับงานคุณให้อัตโนมัติเมื่อคุณเล่างาน", "See every shop's work, stars and credit before you choose. ORCA picks the ones that fit when you describe your event.")}</p></div>
      <select class="input pill" style="width:auto" data-change="shopSort" aria-label="${L("เรียงตาม", "Sort by")}">${[["rating", L("คะแนนสูงสุด", "Top rated")], ["events", L("จัดงานมากที่สุด", "Most events")], ["price", L("ราคาเริ่มต้นต่ำสุด", "Lowest starting price")]].map(([k, l]) => `<option value="${k}" ${C.shopSort === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="seg" style="margin-bottom:18px"><button class="${!C.shopCat ? "on" : ""}" data-act="shopCat" data-k="">${L("ทั้งหมด", "All")} <span class="muted">${list.length}</span></button>${cats.map((c) => `<button class="${C.shopCat === c ? "on" : ""}" data-act="shopCat" data-k="${c}">${esc(catLabel(c))}</button>`).join("")}</div>
    <div class="shop-grid">${shown.map(shopCardHTML).join("")}</div>`;
}
on("shopCat", (el) => { C.shopCat = el.dataset.k; renderShops(); });
on("shopSort", (el) => { C.shopSort = el.value; renderShops(); });

async function renderShop(id) {
  const [v] = await Promise.all([api(`/api/vendors/${id}/public`), shops()]);
  if (C.me && !C.cx) C.cx = await api(`/api/customers/${C.me}`).catch(() => null);
  const p = C.cx?.proposal?.find((x) => x.options.some((o) => o.vendorId === v.id)) || C.cx?.proposal?.find((x) => x.category === v.category && !String(x.slot).includes("+"));
  const ordered = C.cx?.orders?.find((o) => o.vendorId === v.id);
  const t = v.trust || {};
  const real = v.portfolio.map((ph, i) => ({ ph, i })).filter((x) => x.ph.url);
  const own = real.length ? real : v.portfolio.map((ph, i) => ({ ph, i }));
  const work = v.orcaWork || [];
  // gallery: the shop's own photos first, then events it did with ORCA
  const gallery = [...own.map(({ ph, i }) => `<figure>${portfolioTile(v, i)}<figcaption>${esc(ph.title)}</figcaption></figure>`),
    ...work.map((w) => `<figure><a href="#/work/${w.id}"><div class="pf"><img src="${esc(w.image)}" alt="${esc(w.title)}" loading="lazy"></div></a><figcaption>${L("งานกับ ORCA", "With ORCA")}: ${esc(w.title)}</figcaption></figure>`)].slice(0, real.length ? 5 : Math.max(3, own.length));
  const b = v.breakdown;
  const docName = { "Business registration": L("จดทะเบียนธุรกิจ", "Business registration"), "ID checked": L("ยืนยันตัวตนเจ้าของ", "Owner ID checked"), "Bank account verified": L("บัญชีธนาคารยืนยันแล้ว", "Bank account verified") };
  subnav(v.shopName, [], `<button class="btn sm ghost" data-act="back">← ${L("กลับ", "Back")}</button>`);
  const cta = p ? (p.chosen === v.id
      ? `<div class="chip chip-green" style="justify-self:start"><i></i>${L("ร้านนี้คือที่คุณเลือกไว้", "This is your current choice")}</div><a class="btn lg" href="#/chat">${L("กลับไปยืนยันในแชท", "Back to confirm in chat")}</a>`
      : `<button class="btn lg" data-act="cxChoose" data-cat="${p.slot || v.category}" data-id="${v.id}">${L("เลือกร้านนี้สำหรับงานของฉัน", "Choose this shop for my event")}</button><a class="btn ghost" href="#/chat">${L("กลับไปแชท", "Back to chat")}</a>`)
    : ordered ? `<div class="chip chip-green" style="justify-self:start"><i></i>${L(`ออเดอร์ #${ordered.no} · ${ordered.statusTh}`, `Order #${ordered.no} · ${ordered.statusEn}`)}</div><a class="btn ghost" href="#/chat">${L("กลับไปแชท", "Back to chat")}</a>`
    : `<a class="btn lg" href="${C.me ? "#/chat" : "#/start"}">${C.me ? L("กลับไปแชทกับ ORCA", "Back to my chat") : L("เริ่มวางแผนงานกับ ORCA", "Plan my event with ORCA")}</a><span class="xsmall muted">${L("เล่างานให้ ORCA ฟัง ถ้าร้านนี้เข้ากับงานคุณ ORCA จะแนะนำให้", "Describe your event; if this shop fits, ORCA will suggest it.")}</span>`;
  $main.innerHTML = `
    <section class="shop-gallery n${Math.min(gallery.length, 5)}">${gallery.join("")}</section>
    <section class="shop-head">
      <div class="shop-logo" style="--a:${v.palette[0] || "#d2d2d7"};--b:${v.palette[3] || v.palette[1] || "#1d1d1f"}">${esc(initials(v.shopName))}</div>
      <div class="shop-main">
        <div class="profile-cats"><span>${esc(catLabel(v.category))}</span><span>${esc(placeL(v.area))}</span>${v.verified ? `<span class="chip chip-green"><i></i>${L("ยืนยันโดย ORCA", "Verified by ORCA")}</span>` : ""}</div>
        <h1>${esc(v.shopName)}</h1>
        <div class="shop-rating">${v.rating ? `${starBar(v.rating, "lg")}<b>${v.rating.toFixed(1)}</b><a href="#s-reviews" data-act="jump" data-to="s-reviews">${v.reviewCount} ${L("รีวิว", "reviews")}</a>` : `<span class="muted">${L("ยังไม่มีรีวิว", "No reviews yet")}</span>`}<span class="muted">· ${v.eventsDone} ${L("งานที่จบแล้ว", "events done")} · ${L("ตอบกลับ", "replies")} ${esc(v.responseTime || "—")}</span></div>
        <p>${esc(v.description)}</p>
        <div class="row">${v.style.slice(0, 8).map((s) => `<span class="tag" style="font-size:12px;padding:3px 9px">${esc(s)}</span>`).join("")}</div>
      </div>
      <div class="profile-cta card">
        ${v.priceFrom != null ? `<div><div class="eyebrow">${L("ราคาเริ่มต้น", "Starting price")}</div><div class="shop-price">${thb(v.priceFrom)} <span class="muted small">${esc(v.priceUnit || "")}</span></div></div>` : ""}
        ${cta}
        <div class="xsmall muted">🔒 ${L("จองผ่าน ORCA: มัดจำถูกพักไว้กับ ORCA จนจบงาน ร้านยกเลิกได้เงินคืนเต็มจำนวน", "Booked through ORCA: your deposit is held until the event; full refund if the shop cancels.")}</div>
      </div>
    </section>
    <nav class="shop-tabs">${[["s-work", L("ผลงาน", "Portfolio")], ["s-credit", L("เครดิตร้าน", "Shop credit")], ["s-packages", L("แพ็กเกจและราคา", "Packages")], ["s-reviews", L("รีวิว", "Reviews")], ["s-info", L("ข้อมูลร้าน", "About")]].map(([k, l]) => `<a href="#${k}" data-act="jump" data-to="${k}">${l}</a>`).join("")}</nav>
    <section class="shop-sec" id="s-work"><h2>${L("ผลงาน", "Portfolio")}</h2>
      <div class="shop-work">${own.map(({ ph, i }) => `<figure>${portfolioTile(v, i)}<figcaption>${esc(ph.title)}</figcaption></figure>`).join("")}</div>
      ${work.length ? `<h3 style="margin:22px 0 10px">${L(`งานที่ร่วมกับ ORCA (${work.length})`, `Events with ORCA (${work.length})`)}</h3><div class="shop-work">${work.map((w) => `<a class="orca-work" href="#/work/${w.id}"><div class="pf"><img src="${esc(w.image)}" alt="${esc(w.title)}" loading="lazy"></div><b>${esc(w.title)}</b><span class="xsmall muted">${esc(L(w.typeTh, w.type))} · ${w.guests.toLocaleString("en-US")} ${L("ท่าน", "guests")} · ${esc(L(w.whenTh, w.when))}</span></a>`).join("")}</div>` : ""}</section>
    <section class="shop-sec" id="s-credit"><h2>${L("เครดิตร้าน", "Shop credit")}</h2>
      <div class="vp-trust shop-trust">
        <div><b>${t.completion ?? "—"}%</b><span>${L("งานสำเร็จตามสัญญา", "jobs completed as agreed")}</span></div>
        <div><b>${t.onTime ?? "—"}%</b><span>${L("มาตรงเวลา", "on time")}</span></div>
        <div><b>${t.repeat ?? "—"}%</b><span>${L("ลูกค้ากลับมาใช้ซ้ำ", "repeat customers")}</span></div>
        <div><b>${t.cancellations ?? 0}</b><span>${L("ยกเลิกงานใน 12 เดือน", "cancellations in 12 months")}</span></div>
        <div><b>${v.eventsDone}</b><span>${L("งานที่จบผ่าน ORCA", "events done through ORCA")}</span></div>
        <div><b>${t.sinceYear ?? "—"}</b><span>${L("อยู่กับ ORCA ตั้งแต่", "on ORCA since")}</span></div>
      </div>
      ${(t.docs || []).length ? `<div class="row" style="margin-top:12px">${t.docs.map((d) => `<span class="chip chip-green-outline">✓ ${esc(docName[d] || d)}</span>`).join("")}</div>` : `<p class="small muted">${L("ร้านยังไม่ได้ยืนยันเอกสาร", "This shop hasn't verified documents yet.")}</p>`}
      <p class="xsmall muted">${L("เครดิตคำนวณจากงานที่จบผ่าน ORCA และรีวิวจากลูกค้าที่จองจริงเท่านั้น", "Credit is calculated from events completed through ORCA and reviews from verified bookings only.")}</p></section>
    ${v.packages.length ? `<section class="shop-sec" id="s-packages"><h2>${L("แพ็กเกจและราคา", "Packages & prices")}</h2><div class="grid g2">${v.packages.map((pk) => `<div class="card stack"><div class="row between"><h3>${esc(pk.name)}</h3><b class="num">${thb(pk.price)} <span class="muted xsmall">${esc(pk.unit || "")}</span></b></div>
      ${pk.includes.length ? `<div><div class="eyebrow">${L("รวม", "Includes")}</div><ul class="clean">${pk.includes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      ${pk.excludes.length ? `<div><div class="eyebrow">${L("ไม่รวม", "Not included")}</div><ul class="clean muted">${pk.excludes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}</div>`).join("")}</div></section>` : ""}
    <section class="shop-sec" id="s-reviews"><h2>${L("รีวิวจากลูกค้า", "Customer reviews")}</h2>
      <div class="shop-reviews">
        ${b ? `<div class="rv-summary"><div class="rv-big">${v.rating.toFixed(1)}</div>${starBar(v.rating, "lg")}<div class="small muted">${v.reviewCount} ${L("รีวิว", "reviews")}</div>
          <div class="rv-bars">${[5, 4, 3, 2, 1].map((k) => `<div><span>${k} ★</span><i><b style="width:${Math.round((b[k] / v.reviewCount) * 100)}%"></b></i><span class="muted">${b[k]}</span></div>`).join("")}</div></div>` : ""}
        <div class="rv-list">${v.reviews.map((r) => `<div class="vp-review"><div class="row between"><b class="small">${esc(r.name)}</b>${starBar(r.stars)}</div><div>${esc(r.text)}</div><div class="xsmall muted">${esc(r.event)} · ${fmtDate(r.date)} · ${L("จองผ่าน ORCA", "booked via ORCA")}</div></div>`).join("") || `<div class="small muted">${L("ยังไม่มีรีวิว", "No reviews yet.")}</div>`}
          ${v.reviewCount > v.reviews.length ? `<div class="xsmall muted">${L(`แสดง ${v.reviews.length} จาก ${v.reviewCount} รีวิวล่าสุด`, `Showing the latest ${v.reviews.length} of ${v.reviewCount} reviews`)}</div>` : ""}</div>
      </div></section>
    <section class="shop-sec" id="s-info"><h2>${L("ข้อมูลร้าน", "About the shop")}</h2>
      <dl class="kvlist" style="max-width:640px"><dt>${L("บริการ", "Service")}</dt><dd>${esc(catLabel(v.category))}</dd><dt>${L("ที่ตั้ง", "Based in")}</dt><dd>${esc(placeL(v.area))}${v.location && v.location !== v.area ? `, ${esc(placeL(v.location))}` : ""}</dd>
        <dt>${L("พื้นที่ให้บริการ", "Serves")}</dt><dd>${esc(v.serviceArea.map(placeL).join(", ") || "—")}</dd>
        ${v.capacity ? `<dt>${L("รองรับแขก", "Capacity")}</dt><dd>${v.capacity.min}–${v.capacity.max} ${L("ท่าน", "guests")}</dd>` : ""}
        ${v.setting ? `<dt>${L("ลักษณะพื้นที่", "Setting")}</dt><dd>${esc(v.setting)}</dd>` : ""}
        <dt>${L("เวลาตอบกลับ", "Reply time")}</dt><dd>${esc(v.responseTime || "—")}</dd></dl>
      <p class="xsmall muted">${L("ติดต่อร้านผ่าน ORCA เท่านั้น เพื่อให้การจองและเงินมัดจำได้รับความคุ้มครอง", "Contact the shop through ORCA so your booking and deposit stay protected.")}</p></section>
    ${v.similar?.length ? `<section class="shop-sec"><h2>${L(`ร้าน${catLabel(v.category)}อื่นที่น่าสนใจ`, `Other ${catLabel(v.category).toLowerCase()} shops`)}</h2><div class="shop-grid">${v.similar.map(shopCardHTML).join("")}</div></section>` : ""}`;
  window.scrollTo(0, 0);
}
on("jump", (el) => document.getElementById(el.dataset.to)?.scrollIntoView({ behavior: "smooth", block: "start" }));
on("back", () => (history.length > 1 ? history.back() : (location.hash = "#/shops")));

// ---------------------------------------------------------------- ORCA's past work
let SC = null;
const showcase = async () => (SC ||= await api("/api/showcase"));
const scImg = (c) => c.image || `showcase/${c.id}.svg`;

function scCard(c) {
  return `<button class="sc-card" data-act="case" data-id="${c.id}" aria-label="${esc(c.title)}">
    <span class="sc-img" style="background-image:url('${scImg(c)}')"><span class="sc-type">${esc(caseT(c, "type"))} · ${c.guests.toLocaleString("en-US")} ${L("ท่าน", "guests")}</span></span>
    <span class="sc-body">
      <span class="sc-label">${"The brief"}</span>
      <span class="sc-brief" ${c.briefLang === "th" ? 'lang="th"' : ""}>“${esc(c.brief)}”</span>
      ${c.briefEn && LANG !== "th" ? `<span class="sc-tr">“${esc(c.briefEn)}”</span>` : ""}
      <span class="sc-arrow">${L("ORCA ทำออกมาเป็น", "ORCA made it")} <b>${esc(c.title)}</b> →</span>
    </span>
  </button>`;
}

function showcaseBand(sc, { limit = 0, title = "From “what?” to “wow.”", sub = L("บรีฟที่กำกวม แปลก และขัดกันเอง ที่ ORCA ถอดความได้ และงานที่ออกมา", "Vague, strange and contradictory briefs ORCA has decoded, and what they became."), more = "", filters = false, stats = false } = {}) {
  if (!sc) return "";
  const s = sc.summary;
  const all = filters && C.scGroup ? sc.cases.filter((c) => c.group === C.scGroup) : sc.cases;
  const list = limit ? all.slice(0, limit) : all;
  const chips = filters ? `<div class="sc-filters" role="group" aria-label="${L("ประเภทงาน", "Kind of event")}">${[["all", L("ทั้งหมด", "All events")], ...sc.groups.map(([k, l]) => [k, gLabel(sc, k, l)])].map(([k, l]) => `<button class="${(C.scGroup || "all") === k ? "on" : ""}" data-act="scGroup" data-k="${k}" aria-pressed="${(C.scGroup || "all") === k}">${esc(l)}</button>`).join("")}</div>` : "";
  return `<section class="sc-band" aria-label="${L("ผลงานของ ORCA", "ORCA's past work")}">
    <div class="sc-head">
      <div class="eyebrow">ORCA's past work</div>
      <h2>${title}</h2>
      <p>${sub}</p>
      ${!stats ? "" : `<div class="sc-stats"><div><b>${s.cases}</b><span>${"“impossible” briefs"}</span></div><div><b>${s.guests.toLocaleString("en-US")}</b><span>${"guests wowed"}</span></div><div><b>~${s.avgDecode}s</b><span>to decode a brief</span></div><div><b>0</b><span>${"“what?” left"}</span></div></div>`}
    </div>
    ${chips}
    <div class="sc-grid">${list.map(scCard).join("")}</div>
    ${more ? `<div class="sc-more"><a class="btn ghost on-dark" href="${more}">${L(`ดูทั้งหมด ${sc.cases.length} งาน`, `See all ${sc.cases.length} stories`)}</a></div>` : ""}
  </section>`;
}

function renderWork() {
  $main.innerHTML = `<div id="our-work">${showcaseBand(SC, { filters: true, stats: true })}</div>`;
}

on("case", async (el) => {
  await shops().catch(() => null);
  const i = SC.cases.findIndex((c) => c.id === el.dataset.id);
  const c = SC.cases[i];
  const next = SC.cases[(i + 1) % SC.cases.length];
  const tags = (list, cls = "") => list.map((t) => `<span class="tag ${cls}">${esc(t)}</span>`).join("");
  const quote = LANG === "th" ? c.th?.quote || c.quote : c.quoteEn || c.quote;
  const quoteSub = LANG === "th" ? "" : c.quoteEn ? c.quote : "";
  drawer(`<div class="dh"><h2>${esc(c.title)}</h2><button class="icon-btn" data-close aria-label="${L("ปิด", "Close")}">✕</button></div>
    <div class="db sc-detail">
      <div class="sc-hero"><img src="${scImg(c)}" alt="${esc(c.title)}">
        <div class="sc-hero-cap"><div class="eyebrow">${esc(caseT(c, "type"))} · ${c.guests.toLocaleString("en-US")} ${L("ท่าน", "guests")} · ${esc(caseT(c, "place"))} · ${esc(caseT(c, "when"))}</div><h3>${esc(c.title)}</h3><div class="small">${L("สำหรับ", "for")} ${esc(c.client)}</div></div></div>
      <div class="sc-split">
        <div class="sc-said"><div class="eyebrow">${"What the client said"}</div>
          <blockquote ${c.briefLang === "th" ? 'lang="th"' : ""}>“${esc(c.brief)}”</blockquote>${c.briefEn && LANG !== "th" ? `<p class="small muted" style="margin:0">“${esc(c.briefEn)}”</p>` : ""}</div>
        <div class="tile-dark sc-heard"><div class="eyebrow" style="color:#c7c7cc">${"What ORCA heard"}</div>
          <div class="style-row"><div class="k">Mood</div><div class="v">${tags(c.heard.mood)}</div></div>
          <div class="style-row"><div class="k">Look</div><div class="v">${tags(c.heard.look)}</div></div>
          <div class="style-row"><div class="k">Avoid</div><div class="v">${tags(c.heard.avoid, "avoid")}</div></div></div>
      </div>
      <div><div class="eyebrow">${"What ORCA did"}</div><ol class="sc-did">${caseT(c, "did").map((d) => `<li>${esc(d)}</li>`).join("")}</ol></div>
      <div class="sc-details">${c.details.map(([label, pos], k) => `<figure><span style="background-image:url('${scImg(c)}');background-position:${pos}" role="img" aria-label="${esc(LANG === "th" ? c.th?.details?.[k] || label : label)}"></span><figcaption>${esc(LANG === "th" ? c.th?.details?.[k] || label : label)}</figcaption></figure>`).join("")}</div>
      <div class="sc-numbers"><div><b>${c.stats.decode}${L(" วิ", "s")}</b><span>${L("ถอดบรีฟ", "to decode the brief")}</span></div><div><b>${c.vendors.length}</b><span>${L("ร้านที่จับคู่", "vendors matched")}</span></div><div><b>${c.stats.messages}</b><span>${L("ข้อความถึงร้าน (ภาษาไทย)", "vendor messages, in Thai")}</span></div><div><b>${c.stats.changes}</b><span>${L("ครั้งที่ลูกค้าเปลี่ยนใจ", "client changes absorbed")}</span></div></div>
      <div><div class="eyebrow">${"The team ORCA put together"}</div><div class="row" style="margin-top:8px">${c.vendors.map((n) => shopIdByName(n) ? `<a class="tag shop-tag" href="#/shop/${shopIdByName(n)}" data-close>${esc(n)} →</a>` : `<span class="tag">${esc(n)}</span>`).join("")}</div></div>
      <figure class="sc-quote"><blockquote>“${esc(quote)}”</blockquote>${quoteSub ? `<p class="small muted" style="margin:4px 0 0">“${esc(quoteSub)}”</p>` : ""}<figcaption>${esc(caseT(c, "quoteBy"))}</figcaption></figure>
    </div>
    <div class="df"><span class="xsmall muted grow" style="flex:1;align-self:center">${L("ภาพประกอบของงาน เปลี่ยนชื่อลูกค้าแล้ว", "Illustration of the event. Client names changed.")}</span><button class="btn" data-act="case" data-id="${next.id}">${L("ถัดไป", "Next")}: ${esc(next.title)} →</button></div>`, { wide: true });
});

on("comment", async (el) => {
  const { kind, id } = el.dataset;
  const input = document.getElementById(`c-${kind}-${id}`);
  const text = input?.value.trim();
  if (!text) return toast(L("พิมพ์คอมเมนต์ก่อนนะครับ", "Write your comment first."), "err");
  busy(el, true, L("กำลังส่ง…", "Sending…"));
  try { C.data = await api(`/api/client-portal/${C.id}/comments`, { method: "POST", body: { target: { kind, id }, text } }); toast(L("ส่งถึงผู้จัดงานแล้ว", "Sent to your organizer.")); rerender(); }
  catch (err) { fail(err); busy(el, false); }
});
on("decide", async (el) => {
  const { id, d } = el.dataset;
  const note = document.getElementById(`rv-${id}`)?.value.trim() || "";
  if (d === "revision" && !note) {
    if (!document.getElementById(`rv-${id}`)) { location.hash = `#/e/${C.id}/approvals`; setTimeout(() => document.getElementById(`rv-${id}`)?.focus(), 200); return; }
    return toast(L("บอกผู้จัดงานว่าอยากแก้อะไร", "Tell your organizer what to change."), "err");
  }
  busy(el, true, d === "approve" ? L("กำลังอนุมัติ…", "Approving…") : L("กำลังส่ง…", "Sending…"));
  try {
    C.data = await api(`/api/client-portal/${C.id}/approvals/${id}/decision`, { method: "POST", body: { decision: d, note } });
    toast(d === "approve" ? L("อนุมัติแล้ว ขอบคุณครับ ผู้จัดงานได้รับแจ้งแล้ว", "Approved. Thank you! Your organizer has been told.") : L("ส่งแล้ว ผู้จัดงานจะทำเวอร์ชันใหม่ให้", "Sent. Your organizer will prepare a new version."));
    rerender();
  } catch (err) { fail(err); busy(el, false); }
});

route();
