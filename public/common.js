// Shared UI helpers for the organizer app, the vendor portal and the client site.

// Language: pages marked <html data-i18n> (client + vendor) are Thai by default with an
// English toggle; the organizer back office stays English.
export const LANG = (() => {
  if (!document.documentElement.hasAttribute("data-i18n")) return "en";
  try { return localStorage.getItem("orca.lang") || "th"; } catch { return "th"; }
})();
document.documentElement.lang = LANG;
export const L = (th, en) => (LANG === "th" ? th : en);
export function setLang(lang) {
  try { localStorage.setItem("orca.lang", lang); } catch {}
  location.reload();
}
export const langToggle = () => `<button class="nl lang-toggle" data-act="lang" data-k="${LANG === "th" ? "en" : "th"}" aria-label="${LANG === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}">${LANG === "th" ? "EN" : "ไทย"}</button>`;

export async function api(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) } };
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== "string") init.body = JSON.stringify(opts.body);
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "");

export const thb = (n) => (n == null || Number.isNaN(Number(n)) ? "—" : "฿" + Math.round(Number(n)).toLocaleString("en-US"));

export function fmtDate(iso, opts = {}) {
  if (!iso) return L("ยังไม่กำหนดวัน", "Date not set");
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(L("th-TH", "en-GB"), { weekday: opts.weekday ? "short" : undefined, day: "numeric", month: "short", year: "numeric" });
}

export function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return L("เมื่อสักครู่", "just now");
  if (s < 3600) return L(`${Math.floor(s / 60)} นาทีที่แล้ว`, `${Math.floor(s / 60)} min ago`);
  if (s < 86400) return L(`${Math.floor(s / 3600)} ชม. ที่แล้ว`, `${Math.floor(s / 3600)} h ago`);
  const d = Math.floor(s / 86400);
  return d < 30 ? L(`${d} วันที่แล้ว`, `${d} d ago`) : fmtDate(iso);
}

export function fmtDateTime(iso) {
  if (!iso) return L("ไม่เคย", "never");
  const d = new Date(iso);
  return d.toLocaleString(L("th-TH", "en-GB"), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso + "T00:00:00") - new Date()) / 86400000);
}

// One chip component for every state in the app: color + label (+ dot), never color alone.
const STATE = {
  // sources
  client: ["blue", "Provided by client"],
  interpreted: ["purple", "Interpreted by ORCA"],
  suggested: ["purple-soft", "Suggested"],
  unknown: ["gray", "Unknown"],
  // message
  draft: ["gray", "Draft"],
  awaiting_approval: ["amber", "Awaiting approval"],
  approved: ["green-outline", "Approved · not sent"],
  sending: ["blue", "Sending"],
  sent: ["green", "Sent"],
  failed: ["red", "Failed"],
  // replies
  awaiting: ["blue", "Awaiting reply"],
  replied: ["green", "Replied"],
  // costs
  estimate: ["gray", "Estimate"],
  quoted: ["amber", "Quoted · review"],
  committed: ["blue", "Committed"],
  paid: ["green", "Paid"],
  needs: ["amber", "Needs confirmation"],
  // availability
  available: ["green", "Available"],
  booked: ["red", "Booked"],
  unconfirmed: ["amber", "Unconfirmed"],
  // requirement type
  requirement: ["ink", "Requirement"],
  preference: ["outline", "Preference"],
  // tasks + run sheet
  todo: ["gray", "To do"],
  doing: ["blue", "In progress"],
  blocked: ["red", "Blocked"],
  done: ["green", "Done"],
  overdue: ["red", "Overdue"],
  live: ["blue", "Now"],
  urgent: ["red", "Urgent"],
  watch: ["amber", "Watch"],
  resolved: ["green", "Resolved"],
  // approvals + changes
  pending: ["amber", "Awaiting decision"],
  revision: ["amber", "Revision requested"],
  declined: ["red", "Declined"],
  granted: ["green", "Approved"],
  open: ["amber", "Needs decision"],
  accepted: ["green", "Accepted"],
  drafted: ["amber", "Draft · approve in Inbox"],
  waiting: ["blue", "Waiting for client"],
  // file visibility
  internal: ["gray", "Internal team"],
  shared: ["blue", "Client"],
};

// Thai labels for the states the client site and vendor portal show
const STATE_TH = {
  sent: "ส่งแล้ว", awaiting: "รอตอบกลับ", replied: "ตอบแล้ว", estimate: "ประมาณการ", quoted: "เสนอราคาแล้ว", committed: "ยืนยันแล้ว", paid: "ชำระแล้ว",
  needs: "ต้องยืนยัน", available: "ว่าง", booked: "ไม่ว่าง", unconfirmed: "ยังไม่ยืนยัน", requirement: "ต้องมี", preference: "อยากได้", draft: "ร่าง",
  pending: "รอการตัดสินใจ", revision: "ขอแก้ไข", declined: "ปฏิเสธ", granted: "อนุมัติแล้ว", done: "เสร็จแล้ว",
};
export function chip(state, label) {
  const [tone, base] = STATE[state] || ["gray", state];
  const text = LANG === "th" && STATE_TH[state] ? STATE_TH[state] : base;
  return `<span class="chip chip-${tone}"><i></i>${esc(label || text)}</span>`;
}

export const STAGES = ["Briefing", "Sourcing", "Quoting", "Proposal", "Confirmed", "Event day", "Completed"];
export function stageChip(stage) {
  const tone = stage === "Completed" ? "green" : stage === "Confirmed" || stage === "Event day" ? "blue" : stage === "Briefing" ? "gray" : "amber-soft";
  return `<span class="chip chip-${tone}"><i></i>${esc(stage)}</span>`;
}

export function dots(score) {
  const full = Math.round(score);
  return `<span class="dots" title="Match ${score.toFixed(1)} / 5" aria-label="Match ${score.toFixed(1)} out of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= full ? "on" : ""}"></i>`).join("")}</span>`;
}

// Portfolio tile: a real photo if the vendor uploaded one, otherwise a mood board from their palette.
export function portfolioTile(vendor, idx = 0, cls = "") {
  const p = vendor.portfolio?.[idx];
  if (p?.url) return `<div class="pf ${cls}"><img src="${esc(p.url)}" alt="${esc(p.title || vendor.shopName)}" loading="lazy"></div>`;
  const pal = vendor.palette?.length ? vendor.palette : ["#f5f5f7", "#d2d2d7", "#7a7a7a", "#1d1d1f"];
  const [a, b, c, d] = [pal[(idx) % pal.length], pal[(idx + 1) % pal.length], pal[(idx + 2) % pal.length], pal[(idx + 3) % pal.length]];
  return `<div class="pf pf-board ${cls}" style="--a:${a};--b:${b};--c:${c};--d:${d}" role="img" aria-label="${esc(p?.title || vendor.shopName)} mood board">
    <span></span><span></span><span></span><span></span>
    ${p?.title ? `<em>${esc(p.title)}</em>` : ""}
  </div>`;
}

export const CATEGORY_LABEL = {
  venue: "Venue", catering: "Catering", entertainment: "Entertainment", decor: "Decor & design",
  photography: "Photography", experience: "Experience", av: "AV & stage", transport: "Transport",
};

// ORCA's mark: a grey orca with a white belly on a dark tile.
const CATEGORY_TH = { venue: "สถานที่", catering: "อาหาร", entertainment: "ดนตรี/บันเทิง", decor: "ตกแต่ง", photography: "ถ่ายภาพ", experience: "กิจกรรม", av: "แสงเสียง", transport: "รถรับส่ง" };
export const catLabel = (k) => (LANG === "th" ? CATEGORY_TH[k] : CATEGORY_LABEL[k]) || k;

export const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
  <rect width="64" height="64" rx="15" fill="#1f211e"/>
  <g transform="translate(-5.5 12.5) scale(.142)"><path d="M132,40 C230,62 360,96 440,118 C468,126 474,146 458,152 C380,158 270,176 182,212 L78,240 C108,196 150,150 180,108 C166,82 150,58 132,40 Z" fill="#50555b"/><path d="M228,207 C300,170 380,152 456,152 C430,182 370,200 312,206 C280,209 252,209 228,207 Z" fill="#fff"/><path d="M352,122 C368,120 384,124 396,132 C380,135 364,131 352,122 Z" fill="#1f211e"/></g>
</svg>`;

let toastTimer;
export function toast(msg, tone = "") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.className = `toast show ${tone}`;
  el.innerHTML = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 4200);
}

export function drawer(html, { wide = false } = {}) {
  closeDrawer();
  const wrap = document.createElement("div");
  wrap.className = "drawer-wrap";
  wrap.innerHTML = `<div class="drawer-scrim" data-close></div><aside class="drawer ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</aside>`;
  wrap.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeDrawer(); });
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("open"));
  return wrap.querySelector(".drawer");
}

export function closeDrawer() {
  document.querySelectorAll(".drawer-wrap").forEach((w) => w.remove());
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

export function busy(btn, on, label = "Working…") {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = `<span class="spin"></span>${label}`; btn.disabled = true; }
  else { btn.innerHTML = btn.dataset.label || btn.innerHTML; btn.disabled = false; }
}
