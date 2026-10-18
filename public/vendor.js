// Vendor portal: register a shop (like opening a store on Shopee/Lazada), receive orders
// that ORCA books for customers, keep style DNA and prices current, and answer
// organizer enquiries in one form. Thai by default, with an English toggle.
import { api, esc, thb, fmtDate, ago, chip, portfolioTile, CATEGORY_LABEL, LOGO, toast, busy, L, setLang, langToggle, catLabel } from "./common.js";

const $main = document.getElementById("main");
const $sub = document.getElementById("subnav");
const $nav = document.getElementById("gnav");

const MOODS = ["elegant", "romantic", "warm", "playful", "luxurious", "professional", "relaxed", "bold", "inspiring", "calm", "formal", "fun"];
const FEELS = ["intimate", "lively", "energetic", "spacious", "cozy", "personal", "social", "organised", "ceremonial", "airy"];
const LOOKS = ["modern", "minimal", "garden", "rooftop", "rustic", "boho", "beach", "industrial", "classic", "gold", "floral", "warm lighting", "soft muted palette", "natural", "tech", "vintage"];
const UNITS = ["per event", "per guest", "per day", "per hour", "per vehicle"];
const UNIT_TH = { "per event": "ต่องาน", "per guest": "ต่อท่าน", "per day": "ต่อวัน", "per hour": "ต่อชั่วโมง", "per vehicle": "ต่อคัน" };
const unitL = (u) => L(UNIT_TH[u] || u, u);
const TYPE_TH = { wedding: "งานแต่งงาน", birthday: "งานวันเกิด", conference: "งานสัมมนา", party: "ปาร์ตี้", launch: "งานเปิดตัวสินค้า", corporate: "งานบริษัท", event: "งานอีเวนต์" };
const placeL = (p) => L(/^bangkok$/i.test(p || "") ? "กรุงเทพฯ" : p || "—", p || "—");
const typeL = (t) => L(TYPE_TH[t] || t || "", t || "");

const ACTS = {};
const on = (n, f) => (ACTS[n] = f);
document.addEventListener("click", (e) => { const el = e.target.closest("[data-act]"); if (el && ACTS[el.dataset.act]) { e.preventDefault(); ACTS[el.dataset.act](el, e); } });
document.addEventListener("change", (e) => { const el = e.target.closest("[data-change]"); if (el && ACTS[el.dataset.change]) ACTS[el.dataset.change](el, e); });
const fail = (err) => toast(esc(err.message || err), "err");

let shopId = null;
try { shopId = localStorage.getItem("orca.shop"); } catch {}
const R = { step: 1, form: null, openEnquiry: null, oTab: "todo" };

function nav() {
  $nav.innerHTML = `<a class="brand" href="#/">${LOGO}<span>ORCA</span></a><span class="nl hide-sm" style="opacity:.7">${L("สำหรับร้านค้า", "for Vendors")}</span><span class="grow"></span>
    ${shopId ? `<a class="nl" href="#/shop/${shopId}/orders">${L("ร้านของฉัน", "My shop")}</a><a class="nl hide-sm" href="#/" data-act="logout">${L("เปลี่ยนร้าน", "Switch shop")}</a>` : `<a class="nl" href="#/register">${L("สมัครร้านค้า", "Register")}</a>`}
    <a class="nl hide-sm" href="/client.html" target="_blank" rel="noopener">${L("หน้าเว็บลูกค้า ↗", "Customer site ↗")}</a>
    ${langToggle()}`;
}
function subnav(title, tabs = [], cta = "") {
  $sub.innerHTML = `<div class="in"><div class="title">${esc(title)}</div><div class="tabs">${tabs.map((t) => `<a href="${t.href}" class="${t.on ? "on" : ""}">${esc(t.label)}${t.n ? `<span class="n">${t.n}</span>` : ""}</a>`).join("")}</div>${cta}</div>`;
}
on("lang", (el) => setLang(el.dataset.k));

async function route() {
  nav();
  const p = (location.hash || "#/").slice(2).split("/");
  try {
    if (p[0] === "register") return renderRegister();
    if (p[0] === "shop" && p[1]) return await renderShop(p[1], p[2] || "orders");
    return await renderLanding();
  } catch (err) { fail(err); }
}
window.addEventListener("hashchange", route);

// ---------------------------------------------------------------- landing
async function renderLanding() {
  subnav("ORCA for Vendors", [], `<a class="btn sm" href="#/register">${L("สมัครร้านค้า", "Register your shop")}</a>`);
  const vendors = await api("/api/vendors");
  $main.innerHTML = `
    <section class="hero">
      ${LOGO.replace('class="logo"', 'class="logo" style="width:64px;height:64px"')}
      <h1>${L("ให้ลูกค้าเจอร้านคุณเพราะสไตล์ ไม่ใช่แค่ราคา", "Get found for your style, not only your price.")}</h1>
      <p>${L("เปิดร้านบน ORCA ลูกค้าเล่าว่าอยากให้งานรู้สึกแบบไหน ORCA จับคู่กับร้านที่สไตล์ใช่ แล้วส่งออเดอร์ถึงคุณโดยตรง ลงร้านฟรี", "Open your shop on ORCA. Customers describe the feeling they want; ORCA matches them to vendors whose creative DNA fits and sends you the order. Free to list.")}</p>
      <div class="row" style="justify-content:center"><a class="btn lg" href="#/register">${L("สมัครร้านค้า", "Register your shop")}</a></div>
    </section>
    <div class="grid g3" style="margin-top:28px">
      <div class="card"><div class="eyebrow">1 · ${L("เปิดร้าน", "Open your shop")}</div><h3 style="margin-top:6px">${L("บอกสไตล์ร้านให้ ORCA รู้", "Tell ORCA your style")}</h3><p class="small muted">${L("บริการ แพ็กเกจ หน่วยราคา จำนวนแขกที่รับได้ พร้อมอารมณ์ ฟีล และลุคของงาน อัปโหลดรูปผลงาน", "Services, packages, price unit, capacity, plus your mood, feel and look. Upload portfolio photos.")}</p></div>
      <div class="card"><div class="eyebrow">2 · ${L("รับออเดอร์", "Get orders")}</div><h3 style="margin-top:6px">${L("ออเดอร์ที่ใช่เท่านั้น", "Only orders that fit")}</h3><p class="small muted">${L("ORCA อ่าน DNA ของงาน แล้วส่งออเดอร์ที่เข้ากับร้าน พร้อมวันงาน จำนวนแขก และสิ่งที่ลูกค้าไม่อยากได้", "ORCA reads each event's DNA and sends you the orders that fit, with the date, guests and what the client wants to avoid.")}</p></div>
      <div class="card"><div class="eyebrow">3 · ${L("กดรับ จบ", "Accept in one tap")}</div><h3 style="margin-top:6px">${L("เหมือนรับออเดอร์ Shopee", "Like a Shopee order")}</h3><p class="small muted">${L("กดรับหรือปฏิเสธ ถ้าลูกค้าเปลี่ยนแผน ORCA ปรับออเดอร์ให้เอง และถามคุณเฉพาะเมื่อจำเป็น", "Accept or decline. If the customer changes plans, ORCA updates the order and only asks you when it must.")}</p></div>
    </div>
    <div class="card" style="margin-top:28px">
      <div class="card-head"><h3>${L("มีร้านอยู่แล้ว? เข้าร้านของคุณ", "Already have a shop? Open it")}</h3><span class="muted small">${L("เดโม: ไม่ต้องใช้รหัสผ่าน", "Demo: no password")}</span></div>
      <div class="row"><select class="input" id="shop-pick" style="max-width:420px" aria-label="${L("ร้านของคุณ", "Your shop")}">${vendors.map((v) => `<option value="${v.id}" ${v.id === shopId ? "selected" : ""}>${esc(v.shopName)} · ${esc(catLabel(v.category))}</option>`).join("")}</select>
      <button class="btn" data-act="login">${L("เข้าร้าน", "Open shop")}</button></div>
      <p class="xsmall muted" style="margin:8px 0 0">${L("ลองให้ลูกค้าเล่างานในหน้า “เริ่มวางแผนงาน” แล้วกลับมาดูออเดอร์ที่ร้าน Glasshouse, Saffron & Salt หรือ Velvet Lane", "Tip: start an event as a customer, then open The Glasshouse Rooftop, Saffron & Salt or The Velvet Lane Band to see the order.")}</p>
    </div>`;
}
on("login", () => {
  shopId = document.getElementById("shop-pick").value;
  try { localStorage.setItem("orca.shop", shopId); } catch {}
  location.hash = `#/shop/${shopId}/orders`;
});
on("logout", () => { shopId = null; try { localStorage.removeItem("orca.shop"); } catch {} location.hash = "#/"; route(); });

// ---------------------------------------------------------------- shop form (register + edit)
function blankForm() {
  return {
    shopName: "", category: "venue", location: "Bangkok", area: "", serviceArea: "Bangkok", description: "",
    contact: { line: "", email: "", phone: "" },
    priceUnit: "per event", priceFrom: "", priceTo: "", capMin: "", capMax: "", setting: "",
    packages: [{ name: "", price: "", unit: "per event", includes: "", excludes: "" }],
    mood: [], feel: [], look: [], tags: "", palette: ["#f4e8e1", "#e3c4b8", "#8a9a7b", "#1d1d1f"],
  };
}
function formFromVendor(v) {
  return {
    shopName: v.shopName, category: v.category, location: v.location, area: v.area || "", serviceArea: (v.serviceArea || []).join(", "), description: v.description || "",
    contact: { line: "", email: "", phone: "", ...(v.contact || {}) },
    priceUnit: v.priceUnit || "per event", priceFrom: v.priceFrom ?? "", priceTo: v.priceTo ?? "", capMin: v.capacity?.min ?? "", capMax: v.capacity?.max ?? "", setting: v.setting || "",
    packages: (v.packages || []).map((p) => ({ name: p.name, price: p.price, unit: p.unit, includes: (p.includes || []).join("\n"), excludes: (p.excludes || []).join("\n") })),
    mood: v.dna?.mood || [], feel: v.dna?.feel || [], look: v.dna?.look || [], tags: (v.tags || []).join(", "), palette: v.palette || blankForm().palette,
  };
}
function formToVendor(f) {
  const n = (x) => (x === "" || x == null ? null : Number(x));
  const lines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
  return {
    shopName: f.shopName.trim(), category: f.category, location: f.location.trim(), area: f.area.trim(),
    serviceArea: f.serviceArea.split(",").map((s) => s.trim()).filter(Boolean), description: f.description.trim(), contact: f.contact,
    priceUnit: f.priceUnit, priceFrom: n(f.priceFrom), priceTo: n(f.priceTo) ?? n(f.priceFrom),
    capacity: f.capMax ? { min: n(f.capMin) || 0, max: n(f.capMax) } : null, setting: f.setting || null,
    packages: f.packages.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), price: n(p.price), unit: p.unit, includes: lines(p.includes), excludes: lines(p.excludes) })),
    dna: { mood: f.mood, feel: f.feel, look: f.look },
    tags: f.tags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    palette: f.palette,
  };
}

// read every input with data-f="path" back into the form object
function collect(f) {
  $main.querySelectorAll("[data-f]").forEach((el) => {
    const path = el.dataset.f.split(".");
    let o = f;
    while (path.length > 1) { const k = path.shift(); o = o[isNaN(k) ? k : Number(k)]; }
    o[path[0]] = el.value;
  });
  $main.querySelectorAll("[data-multi]").forEach((box) => {
    f[box.dataset.multi] = [...box.querySelectorAll("input:checked")].map((i) => i.value);
  });
  return f;
}

const inp = (path, val, opts = {}) => `<input class="input" id="f-${path}" data-f="${path}" value="${esc(val ?? "")}" ${opts.type ? `type="${opts.type}"` : ""} placeholder="${esc(opts.ph || "")}">`;
const fieldWrap = (path, label, html) => `<div class="field"><label for="f-${path}">${label}</label>${html}</div>`;
const multi = (name, options, selected) => `<div class="choice" data-multi="${name}">${options.map((o) => `<label><input type="checkbox" value="${esc(o)}" ${selected.includes(o) ? "checked" : ""}><span>${esc(o)}</span></label>`).join("")}</div>`;

function stepShop(f) {
  return `<div class="grid g2">
    ${fieldWrap("shopName", L("ชื่อร้าน", "Shop name"), inp("shopName", f.shopName, { ph: L("เช่น Bloom Theory Studio", "e.g. Bloom Theory Studio") }))}
    <div class="field"><span class="lbl">${L("บริการหลัก", "Main service")}</span><div class="choice">${Object.keys(CATEGORY_LABEL).map((k) => `<label><input type="radio" name="cat" value="${k}" data-change="cat" ${f.category === k ? "checked" : ""}><span>${esc(catLabel(k))}</span></label>`).join("")}</div></div>
    ${fieldWrap("location", L("จังหวัด", "City"), inp("location", f.location))}
    ${fieldWrap("area", L("ย่าน / เขต", "Area / district"), inp("area", f.area, { ph: L("เช่น สาทร", "e.g. Sathorn") }))}
    ${fieldWrap("serviceArea", L("พื้นที่ให้บริการ (คั่นด้วยจุลภาค)", "Cities you serve (comma separated)"), inp("serviceArea", f.serviceArea))}
    ${fieldWrap("contact.line", "LINE ID", inp("contact.line", f.contact.line, { ph: "@yourshop" }))}
    ${fieldWrap("contact.email", L("อีเมล", "Email"), inp("contact.email", f.contact.email))}
    ${fieldWrap("contact.phone", L("เบอร์โทร", "Phone"), inp("contact.phone", f.contact.phone))}
  </div>
  <div class="field" style="margin-top:14px"><label for="f-description">${L("เล่างานของร้านใน 1-2 ประโยค", "Describe your work in one or two sentences")}</label><textarea class="input" id="f-description" data-f="description" placeholder="${L("ทำอะไร ให้ความรู้สึกแบบไหน ลูกค้าแบบไหนชอบ", "What you do, what it feels like, who loves it")}">${esc(f.description)}</textarea></div>`;
}

function stepPricing(f) {
  const capacity = ["venue", "catering"].includes(f.category);
  return `<div class="grid g3">
    <div class="field"><label for="f-priceUnit">${L("หน่วยราคา", "Price unit")}</label><select class="input" id="f-priceUnit" data-f="priceUnit">${UNITS.map((u) => `<option value="${u}" ${f.priceUnit === u ? "selected" : ""}>${esc(unitL(u))}</option>`).join("")}</select></div>
    ${fieldWrap("priceFrom", L("ราคาเริ่มต้น (บาท)", "Starting price (THB)"), inp("priceFrom", f.priceFrom, { type: "number" }))}
    ${fieldWrap("priceTo", L("สูงสุด (บาท)", "Up to (THB)"), inp("priceTo", f.priceTo, { type: "number" }))}
    ${capacity ? fieldWrap("capMin", L("แขกขั้นต่ำ", "Min guests"), inp("capMin", f.capMin, { type: "number" })) + fieldWrap("capMax", L("แขกสูงสุด", "Max guests"), inp("capMax", f.capMax, { type: "number" })) : ""}
    ${f.category === "venue" ? `<div class="field"><label for="f-setting">${L("ลักษณะพื้นที่", "Setting")}</label><select class="input" id="f-setting" data-f="setting">${[["", L("เลือก", "Choose")], ["indoor", L("ในร่ม", "indoor")], ["outdoor", L("กลางแจ้ง", "outdoor")], ["indoor + outdoor", L("ในร่ม + กลางแจ้ง", "indoor + outdoor")]].map(([s, l]) => `<option ${f.setting === s ? "selected" : ""} value="${s}">${l}</option>`).join("")}</select></div>` : ""}
  </div>
  <h3 style="margin:22px 0 10px">${L("แพ็กเกจ", "Packages")}</h3>
  <div class="stack">${f.packages.map((p, i) => `<div class="card flat stack">
    <div class="grid g3">${fieldWrap(`packages.${i}.name`, L("ชื่อแพ็กเกจ", "Package name"), inp(`packages.${i}.name`, p.name, { ph: L("เช่น งานเลี้ยงช่วงเย็น", "e.g. Evening reception") }))}
      ${fieldWrap(`packages.${i}.price`, L("ราคา (บาท)", "Price (THB)"), inp(`packages.${i}.price`, p.price, { type: "number" }))}
      <div class="field"><label for="f-packages.${i}.unit">${L("หน่วย", "Unit")}</label><select class="input" id="f-packages.${i}.unit" data-f="packages.${i}.unit">${UNITS.map((u) => `<option value="${u}" ${p.unit === u ? "selected" : ""}>${esc(unitL(u))}</option>`).join("")}</select></div></div>
    <div class="grid g2"><div class="field"><label for="f-packages.${i}.includes">${L("รวม (บรรทัดละรายการ)", "Includes (one per line)")}</label><textarea class="input" id="f-packages.${i}.includes" data-f="packages.${i}.includes">${esc(p.includes)}</textarea></div>
      <div class="field"><label for="f-packages.${i}.excludes">${L("ไม่รวม (บรรทัดละรายการ)", "Excludes (one per line)")}</label><textarea class="input" id="f-packages.${i}.excludes" data-f="packages.${i}.excludes">${esc(p.excludes)}</textarea></div></div>
    ${f.packages.length > 1 ? `<button class="btn xs danger" style="justify-self:start" data-act="rmPkg" data-i="${i}">${L("ลบแพ็กเกจ", "Remove package")}</button>` : ""}
  </div>`).join("")}</div>
  <button class="btn ghost sm" style="margin-top:12px" data-act="addPkg">${L("เพิ่มแพ็กเกจ", "Add package")}</button>
  <p class="small muted">${L("ถ้าราคาหรือสิ่งที่ไม่รวมยังว่าง ลูกค้าจะเห็นว่า “ต้องยืนยัน” กรอกให้ครบจะได้ออเดอร์เร็วขึ้น", "Organizers see “Needs confirmation” wherever a price or exclusion is missing, so filling these in gets you orders faster.")}</p>`;
}

function stepDNA(f) {
  return `<p class="muted" style="margin-top:0">${L("นี่คือสิ่งที่ ORCA ใช้จับคู่ร้าน เลือกตามจริง ลูกค้าที่อยากได้สไตล์ตรงข้ามจะไม่ถูกส่งมา ประหยัดเวลาทุกฝ่าย", "This is how ORCA matches you. Pick what honestly describes your work. Clients who want the opposite won't be sent to you, which saves everyone time.")}</p>
    <div class="stack" style="gap:18px">
      <div class="field"><span class="lbl">${"Mood"}</span>${multi("mood", MOODS, f.mood)}</div>
      <div class="field"><span class="lbl">${"Feel"}</span>${multi("feel", FEELS, f.feel)}</div>
      <div class="field"><span class="lbl">${"Look"}</span>${multi("look", LOOKS, f.look)}</div>
      ${fieldWrap("tags", L("คำที่ลูกค้าอาจใช้ค้นหา (คั่นด้วยจุลภาค)", "Keywords clients might use (comma separated)"), inp("tags", f.tags, { ph: "garden, live band, wedding, signature drinks" }))}
      <div class="field"><span class="lbl">${L("โทนสีของร้าน", "Your palette")}</span><div class="swatches">${f.palette.map((c, i) => `<input type="color" value="${esc(c)}" data-f="palette.${i}" aria-label="${L("สี", "Palette colour")} ${i + 1}">`).join("")}</div>
        <span class="xsmall muted">${L("ใช้เป็นมู้ดบอร์ดจนกว่าจะอัปโหลดรูปผลงาน", "Used for your mood board until you upload photos.")}</span></div>
    </div>`;
}

function preview(f) {
  const v = { ...formToVendor(f), portfolio: [] };
  return `<article class="vcard" style="max-width:360px">${portfolioTile(v)}<div class="body"><h3>${esc(v.shopName || L("ร้านของคุณ", "Your shop"))}</h3>
    <div class="small muted">${esc(catLabel(v.category))} · ${esc(v.area || v.location)}</div>
    <div class="price">${v.priceFrom != null ? `${L("เริ่มต้น", "From")} <b>${thb(v.priceFrom)}</b> <span class="muted">${esc(unitL(v.priceUnit))}</span>` : chip("needs", L("ต้องยืนยันราคา", "Price needs confirmation"))}</div>
    <div class="ev">${[...v.dna.look, ...v.dna.mood].slice(0, 5).map((t) => `<span>${esc(t)}</span>`).join("")}</div></div></article>`;
}

function completeness(v) {
  const checks = [
    [Boolean(v.description), L("คำอธิบายร้าน", "Description")], [v.priceFrom != null, L("ราคาเริ่มต้น", "Starting price")], [(v.packages || []).length > 0, L("แพ็กเกจอย่างน้อย 1", "At least one package")],
    [(v.dna?.mood || []).length > 0 && (v.dna?.look || []).length > 0, "Style DNA"], [(v.portfolio || []).some((p) => p.url), L("รูปผลงาน", "Portfolio photos")],
    [Boolean(v.contact?.line), "LINE ID"], [Object.keys(v.availability || {}).length > 0, L("วันว่าง", "Availability dates")],
  ];
  return { pct: Math.round((checks.filter((c) => c[0]).length / checks.length) * 100), missing: checks.filter((c) => !c[0]).map((c) => c[1]) };
}

// ---------------------------------------------------------------- register
function renderRegister() {
  R.form ||= blankForm();
  const f = R.form;
  subnav(L("สมัครร้านค้า", "Register your shop"), [], `<a class="btn ghost sm" href="#/">${L("ยกเลิก", "Cancel")}</a>`);
  const names = [L("ข้อมูลร้าน", "Shop info"), L("บริการและราคา", "Services & pricing"), "Style DNA", L("ตรวจสอบ", "Review")];
  const body = [stepShop, stepPricing, stepDNA, (f) => `<div class="grid g2" style="align-items:start"><div>${preview(f)}</div>
    <div class="card flat stack"><h3>${L("พร้อมเปิดร้าน", "Ready to open")}</h3><p class="small" style="margin:0">${L("หลังเปิดร้าน อัปโหลดรูปผลงานและวันที่ไม่ว่างได้ ORCA เริ่มจับคู่คุณกับงานทันที", "After publishing you can upload portfolio photos and mark your booked dates. ORCA starts matching you to events right away.")}</p></div></div>`][R.step - 1];
  $main.innerHTML = `
    <div class="steps">${names.map((n, i) => `<span class="s ${R.step === i + 1 ? "on" : R.step > i + 1 ? "done" : ""}"><b>${R.step > i + 1 ? "✓" : i + 1}</b>${n}</span>${i < 3 ? '<span class="arrow">→</span>' : ""}`).join("")}</div>
    <div class="card">${body(f)}</div>
    <div class="row between" style="margin-top:18px">
      ${R.step > 1 ? `<button class="btn ghost" data-act="regStep" data-d="-1">${L("ย้อนกลับ", "Back")}</button>` : "<span></span>"}
      ${R.step < 4 ? `<button class="btn" data-act="regStep" data-d="1">${L("ถัดไป", "Continue")}</button>` : `<button class="btn lg" data-act="publish">${L("เปิดร้าน", "Publish shop")}</button>`}
    </div>`;
}
on("cat", (el) => { collect(R.form); R.form.category = el.value; });
on("regStep", (el) => {
  collect(R.form);
  if (R.step === 1 && !R.form.shopName.trim()) return toast(L("ใส่ชื่อร้านก่อน", "Add your shop name first."), "err");
  R.step = Math.min(4, Math.max(1, R.step + Number(el.dataset.d)));
  renderRegister();
});
on("addPkg", () => { const f = collect(currentForm()); f.packages.push({ name: "", price: "", unit: f.priceUnit, includes: "", excludes: "" }); rerenderForm(); });
on("rmPkg", (el) => { const f = collect(currentForm()); f.packages.splice(Number(el.dataset.i), 1); rerenderForm(); });
const currentForm = () => (location.hash.startsWith("#/register") ? R.form : R.editForm);
const rerenderForm = () => (location.hash.startsWith("#/register") ? renderRegister() : renderShop(shopId, "profile"));

on("publish", async (el) => {
  busy(el, true, L("กำลังเปิดร้าน…", "Publishing…"));
  try {
    const v = await api("/api/vendors", { method: "POST", body: formToVendor(R.form) });
    shopId = v.id;
    try { localStorage.setItem("orca.shop", shopId); } catch {}
    R.form = null; R.step = 1;
    toast(L(`ร้าน <b>${esc(v.shopName)}</b> เปิดแล้ว ต่อไปเพิ่มรูปผลงาน`, `Your shop <b>${esc(v.shopName)}</b> is live. Add portfolio photos next.`));
    location.hash = `#/shop/${v.id}/portfolio`;
  } catch (err) { fail(err); busy(el, false); }
});

// ---------------------------------------------------------------- shop dashboard
async function renderShop(id, tab) {
  shopId = id;
  try { localStorage.setItem("orca.shop", id); } catch {}
  nav();
  const [v, enquiries, orders] = await Promise.all([api(`/api/vendors/${id}`), api(`/api/vendor-portal/${id}/enquiries`), api(`/api/vendor-portal/${id}/orders`)]);
  const waiting = enquiries.filter((e) => e.stage === "Reply needed").length;
  const todo = orders.filter((o) => ["pending", "needs_reply"].includes(o.status)).length;
  const tabs = [["orders", L("คำสั่งซื้อ", "Orders"), todo], ["enquiries", L("ข้อความจากผู้จัดงาน", "Organizer enquiries"), waiting], ["profile", L("โปรไฟล์ร้าน", "Shop profile")], ["portfolio", L("ผลงาน", "Portfolio")], ["calendar", L("ปฏิทิน", "Calendar")], ["performance", L("ภาพรวมร้าน", "Performance")]]
    .map(([k, l, n]) => ({ href: `#/shop/${id}/${k}`, label: l, on: k === tab, n }));
  subnav(v.shopName, tabs, v.verified ? chip("available", L("ร้านยืนยันแล้ว", "Verified shop")) : chip("draft", L("ร้านใหม่", "New shop")));
  const c = completeness(v);
  const banner = c.pct < 100 && tab !== "orders" ? `<div class="card flat row between" style="margin-bottom:18px"><div style="flex:1;min-width:220px"><b>${L(`โปรไฟล์ครบ ${c.pct}%`, `Profile ${c.pct}% complete.`)}</b> <span class="small muted">${L("ORCA จับคู่ได้ดีขึ้นถ้ามี:", "ORCA matches you better with:")} ${esc(c.missing.join(", "))}</span><div class="progress" style="margin-top:8px"><i style="width:${c.pct}%"></i></div></div></div>` : "";
  const views = { orders: () => ordersView(v, orders), enquiries: () => enquiriesView(v, enquiries), profile: () => profileView(v), portfolio: () => portfolioView(v), calendar: () => calendarView(v), performance: () => performanceView(v, c) };
  $main.innerHTML = banner + (views[tab] || views.orders)();
}

// ---------------------------------------------------------------- orders (Shopee-style)
const O_STATUS = {
  pending: [L("ที่ต้องยืนยัน", "To confirm")], needs_reply: [L("รอคุณตอบ", "Needs your answer")], accepted: [L("ยืนยันแล้ว", "Confirmed")],
  declined: [L("ปฏิเสธแล้ว", "Declined")], cancelled: [L("ยกเลิก", "Cancelled")], needs_customer: [L("รอลูกค้าตัดสินใจ", "Waiting for the customer")],
};
const O_TABS = [
  ["todo", L("ที่ต้องดำเนินการ", "To do"), (o) => ["pending", "needs_reply"].includes(o.status)],
  ["accepted", L("ยืนยันแล้ว", "Confirmed"), (o) => o.status === "accepted"],
  ["closed", L("ยกเลิก / ปฏิเสธ", "Cancelled / declined"), (o) => ["declined", "cancelled", "needs_customer"].includes(o.status)],
  ["all", L("ทั้งหมด", "All"), () => true],
];

function ordersView(v, orders) {
  const [, , test] = O_TABS.find((t) => t[0] === R.oTab) || O_TABS[0];
  const list = orders.filter(test);
  const card = (o) => `<article class="vo" id="vo-${o.eventId}">
    <div class="vo-head"><div class="who"><b>${esc(o.customer)}</b><span class="muted">· ${esc(o.event.name)}</span></div>
      <div class="row" style="gap:10px"><span class="xsmall muted">${L("คำสั่งซื้อ", "Order")} #${esc(o.no)} · ${ago(o.updatedAt || o.at)}</span><span class="vo-status ${o.status}">${esc(O_STATUS[o.status]?.[0] || o.status)}</span></div></div>
    <div class="vo-body">
      <div class="vo-event"><div><span>${L("วันงาน", "Date")}</span><b>${fmtDate(o.event.date, { weekday: true })}</b></div><div><span>${L("จำนวนแขก", "Guests")}</span><b>${o.event.guests ?? "—"} ${L("ท่าน", "")}</b></div>
        <div><span>${L("สถานที่", "Location")}</span><b>${esc(placeL(o.event.location))}</b></div><div><span>${L("ประเภทงาน", "Event type")}</span><b>${esc(typeL(o.event.type))}</b></div></div>
      ${o.event.needs.length ? `<div class="small"><span class="muted">${L("ลูกค้าต้องการจากร้าน:", "What they need from you:")}</span> <b>${esc(o.event.needs.join(" · "))}</b></div>` : ""}
      <div class="row">${[...o.event.style.mood, ...o.event.style.look].slice(0, 6).map((t) => `<span class="tag" style="font-size:12px;padding:3px 9px">${esc(t)}</span>`).join("")}${o.event.style.avoid.slice(0, 3).map((t) => `<span class="tag avoid" style="font-size:12px;padding:3px 9px">${L("ไม่เอา", "avoid")} ${esc(t)}</span>`).join("")}</div>
      <table class="vo-lines"><tbody>${o.lines.map((l) => `<tr><td>${esc(l.extra ? l.item.replace(/^Extra: /, L("เพิ่มเติม: ", "Extra: ")) : l.item)}${l.qty > 1 ? ` <span class="muted">× ${l.qty}</span>` : ""}</td><td class="r muted">${l.qty > 1 ? `${thb(l.unitPrice)}/${L("ท่าน", "guest")}` : ""}</td><td class="r"><b>${thb(l.total)}</b></td></tr>`).join("")}</tbody></table>
      <div class="vo-total">${L("ยอดคำสั่งซื้อ", "Order total")} <b>${thb(o.total)}</b></div>
      <div class="vo-pay ${o.paid ? "paid" : ""}">${o.paid ? L(`💰 ลูกค้าชำระแล้ว ${thb(o.paid)} จาก ${thb(o.total)} · ORCA ถือเงินไว้ จะโอนให้ร้านหลังจบงาน`, `💰 Customer paid ${thb(o.paid)} of ${thb(o.total)} · held by ORCA, paid out to you after the event`)
        : o.status === "accepted" ? L(`รอลูกค้าชำระมัดจำ ${thb(o.depositDue)} (30%)`, `Waiting for the customer's deposit of ${thb(o.depositDue)} (30%)`) : L("ลูกค้าชำระมัดจำหลังร้านรับออเดอร์", "The customer pays a deposit after you accept")}</div>
      ${o.status === "needs_reply" ? `<div class="vo-ask"><b>${L("ORCA ถาม (ลูกค้าเปลี่ยนแผน):", "ORCA asks (the customer changed plans):")}</b>
        <ol class="clean">${o.questions.map((q) => `<li>${esc(L(q.th, q.en))}</li>`).join("")}</ol>
        <div class="choice"><label><input type="radio" name="ok-${o.eventId}" value="yes" checked><span>${L("ได้", "Yes, we can")}</span></label><label><input type="radio" name="ok-${o.eventId}" value="no"><span>${L("ทำไม่ได้", "We can't")}</span></label></div>
        <div class="row"><input class="input" type="number" min="0" id="ex-${o.eventId}" placeholder="${L("ค่าใช้จ่ายเพิ่ม (บาท) ถ้ามี", "Extra cost (THB), if any")}" style="flex:1;min-width:150px"><input class="input" id="nt-${o.eventId}" placeholder="${L("ข้อความถึงลูกค้า (ไม่บังคับ)", "Note to the customer (optional)")}" style="flex:2;min-width:180px"></div></div>` : ""}
      ${o.message ? `<details><summary class="small">${L("ข้อความล่าสุดจาก ORCA", "Latest message from ORCA")}</summary><div class="bubble" style="white-space:pre-wrap;background:var(--parchment);border-radius:12px;padding:12px;font-size:14px;margin-top:6px">${esc(L(o.message.th, o.message.en || o.message.th))}</div></details>` : ""}
    </div>
    <div class="vo-foot">
      ${o.status === "pending" ? `<input class="input" id="dn-${o.eventId}" placeholder="${L("เหตุผลถ้าปฏิเสธ (ไม่บังคับ)", "Reason if declining (optional)")}" style="flex:1;min-width:180px">
        <button class="btn ghost" data-act="oAct" data-ev="${o.eventId}" data-a="decline">${L("ปฏิเสธ", "Decline")}</button><button class="btn shopee" data-act="oAct" data-ev="${o.eventId}" data-a="accept">${L("รับออเดอร์", "Accept order")}</button>`
      : o.status === "needs_reply" ? `<button class="btn shopee" data-act="oAct" data-ev="${o.eventId}" data-a="answer">${L("ส่งคำตอบ", "Send answer")}</button>`
      : o.status === "accepted" ? `<span class="small muted">${L("ยืนยันแล้ว · ลูกค้าได้รับแจ้งแล้ว", "Confirmed · the customer has been told")}</span>`
      : `<span class="small muted">${esc(o.history[o.history.length - 1]?.note || "")}</span>`}
    </div>
  </article>`;
  return `<div class="vo-tabs" role="tablist">${O_TABS.map(([k, l, t]) => `<button class="${R.oTab === k ? "on" : ""}" data-act="oTab" data-k="${k}">${l}<span class="n">${orders.filter(t).length}</span></button>`).join("")}</div>
    ${list.map(card).join("") || `<div class="empty">${R.oTab === "todo" ? L("ไม่มีออเดอร์ที่ต้องดำเนินการ ORCA จะส่งมาที่นี่เมื่อมีลูกค้าที่เข้ากับร้าน", "Nothing to do. ORCA sends orders here when a customer fits your shop.") : L("ไม่มีออเดอร์ในหมวดนี้", "No orders here.")}</div>`}`;
}
on("oTab", (el) => { R.oTab = el.dataset.k; renderShop(shopId, "orders").catch(fail); });
on("oAct", async (el) => {
  const ev = el.dataset.ev; const a = el.dataset.a;
  const body = { action: a };
  if (a === "decline") body.note = document.getElementById(`dn-${ev}`)?.value || "";
  if (a === "answer") {
    body.ok = document.querySelector(`input[name="ok-${ev}"]:checked`)?.value !== "no";
    body.extra = Number(document.getElementById(`ex-${ev}`)?.value) || 0;
    body.note = document.getElementById(`nt-${ev}`)?.value || "";
  }
  busy(el, true, "…");
  try {
    await api(`/api/vendor-portal/${shopId}/orders/${ev}`, { method: "POST", body });
    toast(a === "accept" ? L("รับออเดอร์แล้ว ลูกค้าได้รับแจ้งทันที", "Order accepted. The customer has been told.") : a === "decline" ? L("ปฏิเสธแล้ว ORCA จะหาร้านอื่นให้ลูกค้า", "Declined. ORCA will find the customer another vendor.") : L("ส่งคำตอบแล้ว", "Answer sent."));
    await renderShop(shopId, "orders");
  } catch (err) { fail(err); busy(el, false); }
});

// ---------------------------------------------------------------- organizer enquiries
function enquiriesView(v, list) {
  if (!list.length) return `<div class="empty">${L("ยังไม่มีข้อความจากผู้จัดงาน เมื่อ Event DNA ของผู้จัดงานเข้ากับร้านและสอบถามมา จะแสดงที่นี่", "No enquiries yet. When an organizer's Event DNA fits your shop and they ask about you, it shows up here.")}</div>`;
  R.openEnquiry ||= list[0].id;
  const cur = list.find((x) => x.id === R.openEnquiry) || list[0];
  const e = cur.event || {};
  const replied = cur.status === "replied";
  const STAGES = ["Reply needed", "Selection pending", "Confirmation pending", "Confirmed"];
  const STAGE_L = { "Reply needed": L("รอคุณตอบ", "Reply needed"), "Selection pending": L("รอผู้จัดงานเลือก", "Selection pending"), "Confirmation pending": L("รอยืนยัน", "Confirmation pending"), Confirmed: L("ยืนยันแล้ว", "Confirmed"), "Clarification requested": L("ผู้จัดงานถามเพิ่ม", "Clarification requested") };
  return `<div class="grid g2" style="grid-template-columns:300px minmax(0,1fr);align-items:start">
    <div class="stack">${list.map((q) => `<div class="card ${q.id === cur.id ? "" : "flat"}" style="padding:14px;cursor:pointer" data-act="openEnq" data-id="${q.id}">
      <div class="row between"><b class="small">${esc(q.event?.name || q.topic)}</b>${q.stage === "Reply needed" ? chip("awaiting_approval", STAGE_L["Reply needed"]) : chip("awaiting", STAGE_L[q.stage] || q.stage)}</div>
      <div class="xsmall muted">${fmtDate(q.event?.date)} · ${q.event?.guests ?? "—"} ${L("ท่าน", "guests")}</div></div>`).join("")}</div>
    <div class="stack">
      <div class="card">
        <div class="row between"><h3>${esc(e.name || "")}</h3>${replied ? chip("replied") : `<span class="chip chip-amber"><i></i>${L("ตอบภายใน", "Reply by")} ${fmtDate(cur.deadline)}</span>`}</div>
        <dl class="kvlist" style="margin-top:12px"><dt>${L("วันงาน", "Date")}</dt><dd>${fmtDate(e.date, { weekday: true })}</dd><dt>${L("สถานที่", "Location")}</dt><dd>${esc(e.location || "—")}</dd><dt>${L("แขก", "Guests")}</dt><dd>${e.guests ?? "—"}</dd><dt>${L("ประเภทงาน", "Event type")}</dt><dd>${esc(e.type || "")}</dd>
          <dt>${L("สิ่งที่ต้องการจากร้าน", "What they need from you")}</dt><dd>${(e.requirements || []).map((r) => `<div>${r.kind === "requirement" ? `<b>${esc(r.text)}</b> ${chip("requirement")}` : esc(r.text)}</div>`).join("") || "—"}</dd>
          <dt>${L("สไตล์", "Style")}</dt><dd>${[...(e.style?.mood || []), ...(e.style?.look || [])].map((t) => `<span class="tag" style="font-size:12px;padding:3px 9px;margin:0 4px 4px 0">${esc(t)}</span>`).join("")}</dd>
          <dt>${L("ไม่เอา", "Please avoid")}</dt><dd>${(e.style?.avoid || []).map((t) => `<span class="tag avoid" style="font-size:12px;padding:3px 9px;margin:0 4px 4px 0">${esc(t)}</span>`).join("") || "—"}</dd></dl>
        ${(e.references || []).length ? `<div class="refs" style="margin-top:12px">${e.references.map((r) => `<div class="ref like"><img src="${r.url}" alt="${L("ภาพอ้างอิงจากลูกค้า", "Client reference")}">${r.comment ? `<div class="cm">${esc(r.comment)}</div>` : ""}</div>`).join("")}</div>` : ""}
        ${(e.files || []).length ? `<div style="margin-top:12px"><div class="eyebrow">${L("ไฟล์ที่แชร์ให้คุณ", "Files shared with you")}</div>${e.files.map((f) => `<div class="file-mini"><span class="ext">${esc(f.name.split(".").pop().slice(0, 4).toUpperCase())}</span><span class="grow">${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)} <span class="xsmall muted">v${f.version}</span></span></div>`).join("")}</div>` : ""}
      </div>
      <div class="card stack">${cur.messages.map((m) => `<div class="msg ${m.from === "vendor" ? "out" : "in"}" style="max-width:100%"><div class="bubble">${esc(m.text)}</div><div class="mm">${m.from === "vendor" ? L("คุณ", "You") : L("ORCA แทนผู้จัดงาน", "ORCA for the organizer")} · ${ago(m.at)}</div></div>`).join("")}</div>
      ${replied ? `<div class="card stack"><h3>${L("ขั้นตอนต่อไป", "What happens next")}</h3><div class="steps" style="margin:0">${STAGES.map((s, i) => { const at = STAGES.indexOf(cur.stage); return `<span class="s ${i === at ? "on" : i < at ? "done" : ""}"><b>${i < at ? "✓" : i + 1}</b>${STAGE_L[s]}</span>${i < 3 ? '<span class="arrow">→</span>' : ""}`; }).join("")}</div>
        <p class="small muted" style="margin:0">${cur.stage === "Selection pending" ? L("ผู้จัดงานกำลังเทียบตัวเลือกกับลูกค้า ถ้าต้องการข้อมูลเพิ่มจะส่งข้อความมาที่นี่", "The organizer is comparing options with their client. You'll get a message here if they need clarification.") : cur.stage === "Confirmation pending" ? L("คุณได้รับเลือกแล้ว ผู้จัดงานจะยืนยันการจองและมัดจำ", "You've been chosen. The organizer will confirm the booking and deposit.") : cur.stage === "Clarification requested" ? L("ผู้จัดงานถามเพิ่มด้านบน", "The organizer asked a follow-up question above.") : L("ยืนยันการจองแล้ว", "Booking confirmed.")}</p></div>`
      : replyForm(cur, v)}
    </div></div>`;
}

function replyForm(cur, v) {
  const pkg = v.packages?.[0];
  return `<form class="card stack" id="reply-form" data-tid="${cur.id}">
    <h3>${L("คำตอบของคุณ", "Your reply")}</h3>
    <div class="field"><span class="lbl">${L(`ว่างวันที่ ${fmtDate(cur.event?.date)} ไหม?`, `Available on ${fmtDate(cur.event?.date)}?`)}</span>
      <div class="choice">${[["yes", L("ว่าง", "Yes, available")], ["no", L("ไม่ว่าง", "Not available")], ["partly", L("ว่างแบบมีเงื่อนไข", "Available with conditions")]].map(([k, l]) => `<label><input type="radio" name="available" value="${k}" ${k === "yes" ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></div>
    <div class="field"><span class="lbl">${L("ราคาแยกรายการ", "Itemized pricing")}</span>
      <div class="stack" id="items">${itemRow(pkg?.name || "", 1, pkg?.price || "")}</div>
      <button class="btn link sm" type="button" data-act="addItem" style="justify-self:start">${L("+ เพิ่มรายการ", "+ Add line")}</button></div>
    <div class="grid g2">
      <div class="field"><label for="r-inc">${L("รวมในราคา", "Included")}</label><textarea id="r-inc" class="input" name="includes">${esc((pkg?.includes || []).join(", "))}</textarea></div>
      <div class="field"><label for="r-exc">${L("ไม่รวมในราคา", "Not included")}</label><textarea id="r-exc" class="input" name="excludes">${esc((pkg?.excludes || []).join(", "))}</textarea></div>
      <div class="field"><label for="r-valid">${L("ราคานี้ใช้ได้ถึง", "Quote valid until")}</label><input id="r-valid" class="input" type="date" name="validUntil"></div>
      <div class="field"><label for="r-terms">${L("เงื่อนไข", "Terms")}</label><input id="r-terms" class="input" name="terms" placeholder="${L("เช่น มัดจำ 30% ส่วนที่เหลือก่อนงาน 7 วัน", "e.g. 30% deposit to confirm, balance 7 days before")}"></div>
    </div>
    <div class="field"><label for="r-note">${L("ข้อความถึงผู้จัดงาน (ไม่บังคับ)", "Message to the organizer (optional)")}</label><textarea id="r-note" class="input" name="note" placeholder="${L("มีอะไรที่ควรรู้ไหม", "Anything they should know")}"></textarea></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="sendReply">${L("ส่งคำตอบ", "Send reply")}</button></div>
  </form>`;
}
const itemRow = (name = "", qty = 1, price = "") => `<div class="row item-row"><input class="input" placeholder="${L("รายการ", "Item")}" value="${esc(name)}" style="flex:3;min-width:160px" aria-label="${L("รายการ", "Item")}"><input class="input" type="number" value="${qty}" style="flex:1;min-width:70px" aria-label="${L("จำนวน", "Quantity")}"><input class="input" type="number" placeholder="${L("ราคาต่อหน่วย (บาท)", "Unit price THB")}" value="${esc(price)}" style="flex:2;min-width:120px" aria-label="${L("ราคาต่อหน่วย", "Unit price")}"></div>`;
on("addItem", () => document.getElementById("items").insertAdjacentHTML("beforeend", itemRow()));
on("openEnq", (el) => { R.openEnquiry = el.dataset.id; renderShop(shopId, "enquiries").catch(fail); });
on("sendReply", async (el) => {
  const form = document.getElementById("reply-form");
  const fd = new FormData(form);
  const items = [...form.querySelectorAll(".item-row")].map((r) => { const [n, q, p] = r.querySelectorAll("input"); return { name: n.value.trim(), qty: Number(q.value) || 1, unitPrice: Number(p.value) || 0 }; }).filter((i) => i.name);
  const structured = { available: fd.get("available"), items, includes: fd.get("includes"), excludes: fd.get("excludes"), validUntil: fd.get("validUntil"), terms: fd.get("terms") };
  if (structured.available !== "no" && !items.some((i) => i.unitPrice > 0)) return toast(L("ใส่ราคาอย่างน้อยหนึ่งรายการ หรือเลือกไม่ว่าง", "Add at least one priced item, or choose Not available."), "err");
  const note = String(fd.get("note") || "").trim();
  busy(el, true, L("กำลังส่ง…", "Sending…"));
  try {
    await api(`/api/threads/${form.dataset.tid}/reply`, { method: "POST", body: { structured, text: note, via: "portal" } });
    toast(L("ส่งแล้ว ผู้จัดงานเห็นราคาในงบประมาณทันที", "Reply sent. The organizer sees your quote in their budget."));
    await renderShop(shopId, "enquiries");
  } catch (err) { fail(err); busy(el, false); }
});

function profileView(v) {
  R.editForm = formFromVendor(v);
  return `<div class="grid g2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start">
    <div class="stack"><div class="card">${stepShop(R.editForm)}</div><div class="card">${stepPricing(R.editForm)}</div><div class="card">${stepDNA(R.editForm)}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn lg" data-act="saveProfile">${L("บันทึก", "Save changes")}</button></div></div>
    <div class="stack" style="position:sticky;top:120px"><div class="eyebrow">${L("ลูกค้าเห็นร้านคุณแบบนี้", "How organizers see you")}</div>${preview(R.editForm)}</div></div>`;
}
on("saveProfile", async (el) => {
  busy(el, true, L("กำลังบันทึก…", "Saving…"));
  try { await api(`/api/vendors/${shopId}`, { method: "PATCH", body: formToVendor(collect(R.editForm)) }); toast(L("บันทึกแล้ว ข้อมูลถูกยืนยันเป็นวันนี้", "Saved. Your info is marked as confirmed today.")); renderShop(shopId, "profile"); }
  catch (err) { fail(err); busy(el, false); }
});

function portfolioView(v) {
  return `<div class="card stack" style="margin-bottom:18px"><h3>${L("เพิ่มรูปผลงาน", "Add a photo")}</h3>
      <div class="row"><input class="input" id="pf-title" placeholder="${L("ชื่อรูป เช่น งานเลี้ยงยามเย็น", "Title, e.g. Sunset reception")}" style="flex:1;min-width:200px"><label class="btn" for="pf-file">${L("อัปโหลดรูป", "Upload photo")}</label><input id="pf-file" type="file" accept="image/*" hidden data-change="upload"></div>
      <p class="xsmall muted" style="margin:0">${L("ORCA อ่านโทนสี อารมณ์ และลุคจากรูป เพื่อสร้างโปรไฟล์สไตล์ร้าน JPG, PNG หรือ WebP ไม่เกิน 8 MB", "ORCA reads the palette, mood and look of your photos to build your style profile. JPG, PNG or WebP under 8 MB.")}</p></div>
    <div class="vgrid">${(v.portfolio?.length ? v.portfolio : [{ title: L("มู้ดบอร์ด (เพิ่มรูปเพื่อแทนที่)", "Mood board (add photos to replace)") }]).map((p, i) => `<div class="vcard">${portfolioTile(v, i)}<div class="body"><b class="small">${esc(p.title || "")}</b></div></div>`).join("")}</div>`;
}
on("upload", async (el) => {
  const file = el.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("image", file);
  fd.append("title", document.getElementById("pf-title").value || file.name.replace(/\.\w+$/, ""));
  try { await api(`/api/vendors/${shopId}/portfolio`, { method: "POST", body: fd }); toast(L("เพิ่มรูปแล้ว", "Photo added.")); renderShop(shopId, "portfolio"); }
  catch (err) { fail(err); }
});

function calendarView(v) {
  const dates = Object.entries(v.availability || {}).sort();
  return `<div class="grid g2" style="align-items:start">
    <div class="card stack"><h3>${L("บันทึกวัน", "Mark a date")}</h3>
      <div class="row"><input class="input" type="date" id="cal-date" style="flex:1" aria-label="${L("วันที่", "Date")}"><select class="input" id="cal-status" style="flex:1" aria-label="${L("สถานะ", "Status")}"><option value="booked">${L("ไม่ว่าง", "Booked")}</option><option value="available">${L("ว่าง", "Available")}</option></select><button class="btn" data-act="setDate">${L("บันทึก", "Save")}</button></div>
      <p class="xsmall muted" style="margin:0">${L("ORCA เห็นทันที จะไม่ส่งออเดอร์ในวันที่คุณไม่ว่าง และปรับออเดอร์เองได้ถ้าลูกค้าเลื่อนมาวันที่คุณว่าง", "ORCA sees these instantly: no orders on booked dates, and it can move an order itself when a customer switches to a date you're free.")}</p></div>
    <div class="card stack"><h3>${L("วันของคุณ", "Your dates")}</h3>${dates.map(([d, s]) => `<div class="row between"><span class="num">${fmtDate(d, { weekday: true })}</span><span class="row">${chip(s)}<button class="btn link xs" data-act="clearDate" data-d="${d}">${L("ลบ", "Clear")}</button></span></div>`).join("") || `<div class="muted small">${L("ยังไม่มีวัน", "No dates yet.")}</div>`}</div></div>`;
}
on("setDate", async () => {
  const d = document.getElementById("cal-date").value;
  if (!d) return toast(L("เลือกวันก่อน", "Choose a date."), "err");
  const v = await api(`/api/vendors/${shopId}`);
  const availability = { ...(v.availability || {}), [d]: document.getElementById("cal-status").value };
  try { await api(`/api/vendors/${shopId}`, { method: "PATCH", body: { availability } }); renderShop(shopId, "calendar"); } catch (err) { fail(err); }
});
on("clearDate", async (el) => {
  const v = await api(`/api/vendors/${shopId}`);
  const availability = { ...(v.availability || {}) };
  delete availability[el.dataset.d];
  try { await api(`/api/vendors/${shopId}`, { method: "PATCH", body: { availability } }); renderShop(shopId, "calendar"); } catch (err) { fail(err); }
});

function performanceView(v, c) {
  return `<div class="grid g4">
    <div class="card"><div class="eyebrow">${L("งานกับ ORCA", "Events with ORCA")}</div><div style="font-size:34px;font-weight:600">${v.eventsDone}</div></div>
    <div class="card"><div class="eyebrow">${L("คะแนน", "Rating")}</div><div style="font-size:34px;font-weight:600">${v.rating ? "★ " + v.rating : "—"}</div></div>
    <div class="card"><div class="eyebrow">${L("เวลาตอบกลับ", "Reply time")}</div><div style="font-size:21px;font-weight:600;margin-top:8px">${esc(v.responseTime)}</div></div>
    <div class="card"><div class="eyebrow">${L("โปรไฟล์", "Profile")}</div><div style="font-size:34px;font-weight:600">${c.pct}%</div></div>
  </div>
  <div class="card" style="margin-top:20px"><h3>${L("Style DNA ของร้านในสายตา ORCA", "Your style DNA as ORCA reads it")}</h3>
    <div class="style-rows" style="margin-top:10px">${["mood", "feel", "look"].map((k) => `<div class="style-row"><div class="k" style="color:var(--ink-48)">${k}</div><div class="v">${(v.dna?.[k] || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("") || `<span class="muted small">${L("ยังไม่ได้ตั้ง", "Not set")}</span>`}</div></div>`).join("")}</div>
    <p class="small muted">${L("ทุกงานที่จบ สอน ORCA ว่าร้านไหนเหมาะกับลูกค้าแบบไหน รีวิวดีและตอบไวทำให้ได้ออเดอร์มากขึ้น", "Every completed event teaches ORCA which vendors work for which clients. Good reviews and fast replies move you up in matching.")}</p></div>`;
}

route();
