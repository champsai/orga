import {
  api, esc, cap, thb, fmtDate, fmtDateTime, ago, daysUntil, chip, stageChip, STAGES, dots, portfolioTile,
  CATEGORY_LABEL, LOGO, toast, drawer, closeDrawer, busy,
} from "./common.js";

const ME = "Fah";
const $main = document.getElementById("main");
const $sub = document.getElementById("subnav");
const $nav = document.getElementById("gnav");

const S = {
  status: { mode: "offline" },
  eventsFilter: "upcoming",
  eventsView: "cards",
  ev: null,
  matches: null,
  matchCat: null,
  matchMode: "vendors",
  compare: [],
  filters: {},
  thread: null,
  composeTab: "ask",
  budgetView: "forecast",
  dnaEdit: null,
  draft: null,
};

// ---------------------------------------------------------------- events (delegated)
const ACTS = {};
const on = (name, fn) => (ACTS[name] = fn);
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const fn = ACTS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-change]");
  if (el && ACTS[el.dataset.change]) ACTS[el.dataset.change](el, e);
});
document.addEventListener("input", (e) => {
  const el = e.target.closest("[data-input]");
  if (el && ACTS[el.dataset.input]) ACTS[el.dataset.input](el, e);
});

const fail = (err) => toast(esc(err.message || err), "err");

// ---------------------------------------------------------------- shell
function renderNav() {
  const r = location.hash || "#/events";
  const is = (p) => (r.startsWith(p) ? "on" : "");
  const claude = S.status.mode === "claude";
  $nav.innerHTML = `
    <a class="brand" href="#/events">${LOGO}<span>ORCA</span></a><span class="nl hide-sm" style="opacity:.7">Back office</span>
    <a class="nl ${is("#/concierge")}" href="#/concierge">Concierge</a>
    <a class="nl ${is("#/events") || is("#/event") || is("#/new")}" href="#/events">Events</a>
    <a class="nl ${is("#/vendors")}" href="#/vendors">Vendors</a>
    <a class="nl ${is("#/inbox")}" href="#/inbox">Inbox</a>
    <span class="grow"></span>
    <span class="ai-pill ${claude ? "claude" : ""}" title="${claude ? "Decoding with Claude" : "No ANTHROPIC_API_KEY set: using the offline engine"}"><i></i>${claude ? "Claude AI" : "Offline AI"}</span>
    <a class="nl hide-sm" href="/client.html" target="_blank" rel="noopener">Customer site ↗</a>
    <a class="nl hide-sm" href="/vendor.html" target="_blank" rel="noopener">Vendor portal ↗</a>
    <span class="avatars" title="Signed in as ${ME}"><span>${ME[0]}</span></span>`;
}

function subnav(title, tabs = [], cta = "") {
  $sub.innerHTML = `<div class="in">
    <div class="title">${esc(title)}</div>
    <div class="tabs">${tabs.map((t) => `<a href="${t.href}" class="${t.on ? "on" : ""}">${esc(t.label)}${t.n ? `<span class="n">${t.n}</span>` : ""}</a>`).join("")}</div>
    ${cta}
  </div>`;
  // sticky banners (urgent issues) sit just below the nav + subnav, whatever its height
  document.documentElement.style.setProperty("--sticky-top", `${44 + $sub.offsetHeight + 8}px`);
}

async function route() {
  closeDrawer();
  const h = location.hash || "#/events";
  const parts = h.slice(2).split("/");
  renderNav();
  window.scrollTo(0, 0);
  try {
    if (parts[0] === "new") return renderCreate();
    if (parts[0] === "concierge") return await renderConcierge(parts[1], parts[2]);
    if (parts[0] === "vendors") return renderVendors();
    if (parts[0] === "inbox") return renderGlobalInbox();
    if (parts[0] === "event" && parts[1]) return renderEvent(parts[1], parts[2] || "overview");
    return renderEvents();
  } catch (err) { fail(err); }
}
window.addEventListener("hashchange", route);

// ---------------------------------------------------------------- 1. All events
async function renderEvents() {
  subnav("Events", [], `<a class="btn" href="#/new">Create event</a>`);
  const events = await api("/api/events");
  const today = new Date().toISOString().slice(0, 10);
  const filters = {
    upcoming: (e) => e.status !== "completed" && (!e.date || e.date >= today),
    mine: (e) => (e.team || []).includes(ME) && e.status !== "completed",
    attention: (e) => e.needsAttention,
    selfserve: (e) => e.selfServe,
    completed: (e) => e.status === "completed",
    all: () => true,
  };
  const list = events.filter(filters[S.eventsFilter]).sort((a, b) => (a.date || "9") .localeCompare(b.date || "9"));
  const attn = events.filter(filters.attention).length;
  const segF = [["upcoming", "Upcoming"], ["mine", "Assigned to me"], ["attention", `Needs attention${attn ? ` (${attn})` : ""}`], ["selfserve", "Booked by customer"], ["completed", "Completed"], ["all", "All"]];

  const card = (e) => `
    <a class="card ev-card" href="#/event/${e.id}/overview">
      <div class="row between"><span class="row" style="gap:6px">${stageChip(e.stage)}${e.selfServe ? chip("shared", "Booked by customer") : ""}</span>${e.needsAttention ? chip("needs", "Needs attention") : ""}</div>
      <div><h3>${esc(e.name)}</h3><div class="muted small">${esc(e.client)}</div></div>
      <dl class="ev-meta">
        <dt>Date</dt><dd>${fmtDate(e.date, { weekday: true })}${e.daysLeft != null && e.daysLeft >= 0 && e.status !== "completed" ? ` <span class="muted">· in ${e.daysLeft} d</span>` : ""}</dd>
        <dt>Location</dt><dd>${esc(e.location || "Not set")}</dd>
        <dt>Guests</dt><dd>${e.guests ?? "Not set"}</dd>
      </dl>
      <div class="row">${(e.chips || []).slice(0, 4).map((c) => `<span class="tag" style="font-size:12px;padding:3px 9px">${esc(c)}</span>`).join("")}</div>
      <div class="row between">
        <span class="avatars">${(e.team || []).map((t) => `<span title="${esc(t)}">${esc(t[0])}</span>`).join("")}</span>
        ${outstanding(e)}
      </div>
    </a>`;

  const table = `<div class="table-wrap"><table class="t">
    <thead><tr><th>Event</th><th>Client</th><th>Date</th><th>Location</th><th>Stage</th><th>Team</th><th>Outstanding</th></tr></thead>
    <tbody>${list.map((e) => `<tr class="click" data-act="go" data-href="#/event/${e.id}/overview">
      <td><b>${esc(e.name)}</b></td><td>${esc(e.client)}</td><td class="num">${fmtDate(e.date)}</td><td>${esc(e.location || "—")}</td>
      <td>${stageChip(e.stage)}</td><td>${esc((e.team || []).join(", "))}</td><td>${outstanding(e)}</td></tr>`).join("")}</tbody></table></div>`;

  $main.innerHTML = `
    <div class="page-head">
      <div><h1>Events</h1><p>${events.filter((e) => e.status !== "completed").length} in progress · ${attn} need attention</p></div>
      <div class="row">
        <div class="seg" role="tablist">${segF.map(([k, l]) => `<button data-act="evFilter" data-k="${k}" class="${S.eventsFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="seg">${[["cards", "Cards"], ["table", "Table"]].map(([k, l]) => `<button data-act="evView" data-k="${k}" class="${S.eventsView === k ? "on" : ""}">${l}</button>`).join("")}</div>
      </div>
    </div>
    ${list.length ? (S.eventsView === "cards" ? `<div class="grid g3">${list.map(card).join("")}</div>` : table) : `<div class="empty">No events here. <a href="#/new">Create one from a client message</a>.</div>`}`;
}

function outstanding(e) {
  const o = e.outstanding || {};
  const bits = [];
  if (o.decisions) bits.push(`<span class="attn"><b>${o.decisions}</b> to decide</span>`);
  if (o.waiting) bits.push(`<span><b>${o.waiting}</b> waiting</span>`);
  if (o.openQuestions) bits.push(`<span><b>${o.openQuestions}</b> open questions</span>`);
  return `<span class="outstanding">${bits.join("") || '<span class="muted">Nothing outstanding</span>'}</span>`;
}

on("evFilter", (el) => { S.eventsFilter = el.dataset.k; renderEvents().catch(fail); });
on("evView", (el) => { S.eventsView = el.dataset.k; renderEvents().catch(fail); });
on("go", (el) => (location.hash = el.dataset.href));

// ---------------------------------------------------------------- shared DNA rendering
const SRC_LABEL = { client: "Provided by client", interpreted: "Interpreted by ORCA", suggested: "Suggested", unknown: "Unknown" };

function highlight(text, dna) {
  let html = esc(text);
  const quotes = (dna?.requirements || []).map((r) => r.quote).filter(Boolean).map((q) => q.replace(/^…|…$/g, "").trim()).filter((q) => q.length > 3);
  const words = [...(dna?.style?.mood || []), ...(dna?.style?.feel || []), ...(dna?.style?.look || [])].filter((w) => w.length > 3);
  for (const q of [...new Set(quotes)].sort((a, b) => b.length - a.length)) {
    const e = esc(q);
    if (html.includes(e)) html = html.split(e).join(`<mark>${e}</mark>`);
  }
  for (const w of words) {
    const re = new RegExp(`(?<![\\w>])(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![\\w<])`, "gi");
    html = html.replace(re, (m, g, off, str) => (str.lastIndexOf("<mark>", off) > str.lastIndexOf("</mark>", off) ? m : `<mark>${g}</mark>`));
  }
  return html.replace(/\n/g, "<br>");
}

function tagHTML(dim, t, dna, scope) {
  const key = `${dim}:${t}`;
  const locked = (dna.locked || []).includes(key);
  return `<span class="tag ${dim === "avoid" ? "avoid" : ""} ${locked ? "locked" : ""}">${esc(t)}
    ${dim !== "avoid" ? `<button data-act="lockTag" data-scope="${scope}" data-key="${esc(key)}" class="${locked ? "on" : ""}" title="${locked ? "Kept: ORCA won't change this" : "Keep this"}" aria-label="Keep ${esc(t)}">✓</button>` : ""}
    <button data-act="dropTag" data-scope="${scope}" data-dim="${dim}" data-t="${esc(t)}" title="Remove" aria-label="Remove ${esc(t)}">×</button></span>`;
}

function styleRows(dna, scope) {
  const s = dna.style || {};
  const row = (k, dim) => `<div class="style-row"><div class="k">${k}</div><div class="v">${(s[dim] || []).map((t) => tagHTML(dim, t, dna, scope)).join("") || '<span class="muted small">—</span>'}</div></div>`;
  return `<div class="style-rows">${row("Mood", "mood")}${row("Feel", "feel")}${row("Look", "look")}${row("Avoid", "avoid")}</div>`;
}

function reqHTML(r, dna, scope, { open = false } = {}) {
  const locked = (dna.locked || []).includes(`req:${r.id}`);
  return `<div class="req ${r.kind} ${locked ? "locked" : ""}">
    <div class="txt"><span>${r.kind === "requirement" ? "<b>" + esc(r.text) + "</b>" : esc(r.text)}</span>
      <span class="acts">
        <button data-act="lockReq" data-scope="${scope}" data-id="${r.id}" class="${locked ? "on" : ""}" title="Keep this exactly">${locked ? "Kept" : "Keep"}</button>
        <button data-act="editReq" data-scope="${scope}" data-id="${r.id}" title="Edit">Edit</button>
        <button data-act="dropReq" data-scope="${scope}" data-id="${r.id}" title="Remove">Remove</button>
      </span></div>
    <div class="meta">${chip(r.kind)}${chip(r.source || "unknown", SRC_LABEL[r.source])}
      <button class="btn link xs" data-act="toggleSrc" title="Show where this came from">Source</button></div>
    <div class="q" ${open ? "" : "hidden"}>${r.quote ? `“${esc(r.quote)}”` : r.source === "suggested" ? "ORCA's suggestion for this type of event. The client hasn't said this." : "No direct quote."}</div>
  </div>`;
}

function categoryCards(dna, scope) {
  const byCat = {};
  for (const r of dna.requirements || []) (byCat[r.category] ||= []).push(r);
  return `<div class="cat-grid">${Object.entries(byCat).map(([cat, list]) => `
    <div class="cat-card cat-${cat}"><h4>${esc(CATEGORY_LABEL[cat] || cat)} <button class="btn link xs" data-act="addReq" data-scope="${scope}" data-cat="${cat}">+ Add</button></h4>
      ${list.map((r) => reqHTML(r, dna, scope)).join("")}</div>`).join("")}</div>`;
}

on("toggleSrc", (el) => { const q = el.closest(".req").querySelector(".q"); q.hidden = !q.hidden; });

// DNA mutations shared by the create flow ("draft") and the event brief ("edit")
function dnaFor(scope) {
  if (scope === "draft") return S.draft.dna;
  S.dnaEdit ||= structuredClone(S.ev.dna);
  return S.dnaEdit;
}
function rerender(scope) { scope === "draft" ? renderCreate() : renderEventTab("dna"); }

on("lockTag", (el) => {
  const dna = dnaFor(el.dataset.scope);
  dna.locked ||= [];
  const k = el.dataset.key;
  dna.locked = dna.locked.includes(k) ? dna.locked.filter((x) => x !== k) : [...dna.locked, k];
  rerender(el.dataset.scope);
});
on("dropTag", (el) => {
  const dna = dnaFor(el.dataset.scope);
  const { dim, t } = el.dataset;
  dna.style[dim] = dna.style[dim].filter((x) => x !== t);
  if (dim !== "avoid") dna.rejected = [...new Set([...(dna.rejected || []), t])];
  dna.locked = (dna.locked || []).filter((x) => x !== `${dim}:${t}`);
  rerender(el.dataset.scope);
});
on("lockReq", (el) => {
  const dna = dnaFor(el.dataset.scope);
  const k = `req:${el.dataset.id}`;
  dna.locked = (dna.locked || []).includes(k) ? dna.locked.filter((x) => x !== k) : [...(dna.locked || []), k];
  rerender(el.dataset.scope);
});
on("dropReq", (el) => {
  const dna = dnaFor(el.dataset.scope);
  const r = dna.requirements.find((x) => x.id === el.dataset.id);
  dna.requirements = dna.requirements.filter((x) => x.id !== el.dataset.id);
  if (r) dna.rejected = [...new Set([...(dna.rejected || []), r.text])];
  rerender(el.dataset.scope);
});
on("editReq", (el) => {
  const dna = dnaFor(el.dataset.scope);
  const r = dna.requirements.find((x) => x.id === el.dataset.id);
  const box = el.closest(".req");
  box.innerHTML = `<input class="input" value="${esc(r.text)}" aria-label="Requirement text">
    <div class="row"><label class="check"><input type="checkbox" ${r.kind === "requirement" ? "checked" : ""}> Must-have requirement</label>
    <span class="grow"></span><button class="btn sm" data-act="saveReq" data-scope="${el.dataset.scope}" data-id="${r.id}">Done</button></div>`;
  box.querySelector("input").focus();
});
on("saveReq", (el) => {
  const dna = dnaFor(el.dataset.scope);
  const r = dna.requirements.find((x) => x.id === el.dataset.id);
  const box = el.closest(".req");
  r.text = box.querySelector("input.input").value.trim() || r.text;
  r.kind = box.querySelector("input[type=checkbox]").checked ? "requirement" : "preference";
  r.source = r.source === "suggested" || r.source === "interpreted" ? "client" : r.source; // organizer confirmed it
  rerender(el.dataset.scope);
});
on("addReq", (el) => {
  const dna = dnaFor(el.dataset.scope);
  const id = "r" + Date.now().toString(36);
  dna.requirements.push({ id, category: el.dataset.cat, text: "New item", kind: "preference", source: "client", quote: null });
  rerender(el.dataset.scope);
  setTimeout(() => document.querySelector(`[data-act="editReq"][data-id="${id}"]`)?.click(), 0);
});

function dnaBoard(dna, texts, scope, { version, aiMode } = {}) {
  return `<section class="tile-dark" aria-label="Event DNA">
    <div class="quote-box">${highlight(texts.join("\n\n"), dna)}</div>
    <div class="dna-head">
      ${LOGO}<span class="dna-line"></span>
      <h2 style="font-size:28px">Event DNA</h2>
      ${version ? `<span class="version-badge">${esc(version)}</span>` : ""}
      ${aiMode ? `<span class="chip ${aiMode === "claude" ? "chip-purple" : "chip-gray"}"><i></i>${aiMode === "claude" ? "Decoded by Claude" : "Offline engine"}</span>` : ""}
    </div>
    <div class="dna-chips">${(dna.chips || []).map((c, i) => `${i ? '<span class="dot"></span>' : ""}<span class="big">${esc(c)}</span>`).join("")}</div>
    <p class="muted" style="margin:16px 0 0">${esc(dna.summary || "")}</p>
    ${styleRows(dna, scope)}
    ${categoryCards(dna, scope)}
    <p class="muted small" style="margin:14px 0 0">“Every requirement traced back to the client's own words.” Tap <b>Source</b> on any item. <b>Keep</b> locks it, <b>Remove</b> means it won't come back.</p>
  </section>`;
}

// ---------------------------------------------------------------- 2. Create event: Describe → Clarify → Review
const EXAMPLES = {
  wedding: { client: "Mild & Ton", text: "We want the wedding to feel elegant and romantic, but not in a way that feels too formal or traditional. We like the idea of something intimate and personal, but we still want enough space for everyone to feel comfortable and for the celebration to have energy. We want it to feel special and memorable without looking like every other wedding. Nothing too over-the-top, nothing too simple, and definitely nothing that feels old-fashioned. We're thinking around 150 guests, and we want the whole day to feel beautiful, warm, modern, and very 'us'." },
  thai: { client: "คุณแพรว", text: "อยากจัดงานวันเกิดแม่ครบ 60 ปีค่ะ ประมาณ 80 คน ที่กรุงเทพ ช่วงต้นเดือนมีนาคม อยากได้บรรยากาศอบอุ่น เป็นกันเอง มีดอกไม้สวยๆ แต่ไม่เอาหรูหราเกินไป แม่ชอบสวน อยากมีวงดนตรีเล่นเพลงเก่าๆ งบประมาณ 500k" },
  launch: { client: "Lumi Skincare", text: "Product launch for our new serum line. 200 guests: press, KOLs and retail partners. Modern, clean, a bit playful, very photogenic. We need a stage with LED screen, a DJ, cocktail bar and a photo booth for content. Bangkok, late January. Budget around 1.2M baht. No stuffy hotel ballroom please." },
};

function newDraft() {
  return { step: 1, client: "", name: "", input: "", texts: [], dna: null, refs: [], aiMode: null, answers: {}, undecided: {} };
}

function renderCreate() {
  S.draft ||= newDraft();
  const d = S.draft;
  subnav("Create event", [], `<a class="btn ghost sm" href="#/events" data-act="cancelCreate">Cancel</a>`);
  const step = (n, label) => `<span class="s ${d.step === n ? "on" : d.step > n ? "done" : ""}"><b>${d.step > n ? "✓" : n}</b>${label}</span>`;
  const steps = `<div class="steps">${step(1, "Describe")}<span class="arrow">→</span>${step(2, "Clarify")}<span class="arrow">→</span>${step(3, "Review")}</div>`;

  if (d.step === 1) {
    const versions = d.texts.length;
    $main.innerHTML = `${steps}
      <div class="page-head"><div><h1>Your idea in. The right people out.</h1><p>Type the idea or paste what the client sent (LINE, email, Thai or English). ORCA turns it into Event DNA.</p></div></div>
      <div class="grid g2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
        <div class="card stack">
          <div class="grid g2">
            <div class="field"><label for="c-client">Client</label><input id="c-client" class="input" value="${esc(d.client)}" placeholder="e.g. Mild Rattanakorn" data-input="draftField" data-k="client"></div>
            <div class="field"><label for="c-name">Event name <span class="muted">(optional)</span></label><input id="c-name" class="input" value="${esc(d.name)}" placeholder="ORCA can name it" data-input="draftField" data-k="name"></div>
          </div>
          <div class="field"><label for="c-input">${versions ? "Add another client message" : "What does the client want?"}</label>
            <textarea id="c-input" class="input" style="min-height:${versions ? 90 : 180}px" placeholder="“I want it elegant, but not too formal. Around 150 guests…”" data-input="draftField" data-k="input">${esc(d.input)}</textarea></div>
          <div class="row">
            <label class="btn pearl sm" for="c-file">Upload brief (.txt)</label><input id="c-file" type="file" accept=".txt,.md,text/plain" hidden data-change="briefFile">
            <label class="btn pearl sm" for="c-refs">Add reference images</label><input id="c-refs" type="file" accept="image/*" multiple hidden data-change="refFiles">
            <span class="grow"></span>
            <button class="btn lg" data-act="decode">${versions ? "Decode again" : "Decode"}</button>
          </div>
          ${d.refs.length ? `<div class="refs">${d.refs.map((r, i) => `<div class="ref"><img src="${r.url}" alt="Reference ${i + 1}"><div class="acts"><button class="btn link xs" data-act="rmRef" data-i="${i}">Remove</button></div></div>`).join("")}</div>` : ""}
        </div>
        <div class="card flat stack">
          <div class="eyebrow">Try an example</div>
          <button class="btn pearl" data-act="example" data-k="wedding">Wedding: “elegant but not too formal”</button>
          <button class="btn pearl" data-act="example" data-k="thai">ภาษาไทย: งานวันเกิดแม่ 60 ปี</button>
          <button class="btn pearl" data-act="example" data-k="launch">Product launch, 200 guests</button>
          <hr class="sep">
          <div class="small muted">How it works: ORCA reads the words, pulls out guests, date, budget and the feeling, then marks each item as <b>Provided by client</b>, <b>Interpreted</b> or <b>Suggested</b>. Keep what's right, remove what's wrong, and type again until it reads like the client.</div>
        </div>
      </div>
      ${d.dna ? `<div style="margin-top:28px">${dnaBoard(d.dna, d.texts, "draft", { version: `Draft v${versions}`, aiMode: d.aiMode })}</div>
        <div class="row between" style="margin-top:18px"><span class="muted small">Not right yet? Type what to change in the box above and press Decode again. Kept items stay put.</span>
        <button class="btn" data-act="toStep" data-n="2">Next: Clarify</button></div>` : ""}`;
    return;
  }

  if (d.step === 2) {
    const b = d.dna.basics || {};
    const basicsQ = { date: "When is it?", guests: "How many guests?", location: "Where?", budget: "Total budget (THB)?" };
    const qFor = (f) => d.dna.openQuestions?.find((q) => q.field === f)?.question || basicsQ[f];
    const field = (f, type, val) => `<div class="card stack">
      <div class="row between"><label class="lbl" for="q-${f}">${esc(qFor(f))}</label>${val != null && val !== "" ? chip("client", "From the brief") : chip("unknown", "Missing")}</div>
      <input id="q-${f}" class="input" type="${type}" value="${esc(val ?? "")}" data-input="answer" data-k="${f}" ${d.undecided[f] ? "disabled" : ""}>
      <label class="check"><input type="checkbox" data-change="undecided" data-k="${f}" ${d.undecided[f] ? "checked" : ""}> Not decided yet</label></div>`;
    const others = (d.dna.openQuestions || []).filter((q) => !["date", "guests", "location", "budget"].includes(q.field));
    $main.innerHTML = `${steps}
      <div class="page-head"><div><h1>A few things vendors will ask</h1><p>Answer what you know. Choose <b>Not decided yet</b> to continue without it; it stays on the brief as an open question.</p></div></div>
      <div class="grid g2">
        ${field("date", "date", d.answers.date ?? b.date)}
        ${field("guests", "number", d.answers.guests ?? b.guests)}
        ${field("location", "text", d.answers.location ?? b.location)}
        ${field("budget", "number", d.answers.budget ?? b.budget)}
        <div class="card stack"><label class="lbl" for="q-setting">Indoor or outdoor?</label>
          <select id="q-setting" class="input" data-change="answer" data-k="setting">${["", "indoor", "outdoor", "indoor + outdoor"].map((o) => `<option ${(d.answers.setting ?? b.setting ?? "") === o ? "selected" : ""} value="${o}">${o || "Not decided yet"}</option>`).join("")}</select></div>
        ${others.map((q, i) => `<div class="card stack"><label class="lbl" for="q-o${i}">${esc(q.question)}</label>
          <input id="q-o${i}" class="input" value="${esc(d.answers["q:" + q.question] || "")}" placeholder="Leave empty if not decided" data-input="answer" data-k="q:${esc(q.question)}"></div>`).join("")}
      </div>
      <div class="row between" style="margin-top:22px"><button class="btn ghost" data-act="toStep" data-n="1">Back</button><button class="btn" data-act="toStep" data-n="3">Next: Review</button></div>`;
    return;
  }

  // step 3: review
  const dna = d.dna;
  const b = dna.basics;
  const unknown = (dna.openQuestions || []);
  $main.innerHTML = `${steps}
    <div class="page-head"><div><h1>Review the brief</h1><p>Correct anything before the event is created. Labels show where each item came from.</p></div>
      <button class="btn lg" data-act="createEvent">Create event</button></div>
    <div class="grid g2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr)">
      <div class="stack">
        <div class="card stack">
          <div class="field"><label for="r-name">Event name</label><input id="r-name" class="input" value="${esc(d.name || suggestName(d))}" data-input="draftField" data-k="name"></div>
          <div class="field"><label for="r-client">Client</label><input id="r-client" class="input" value="${esc(d.client)}" data-input="draftField" data-k="client"></div>
          <dl class="kvlist">
            <dt>Date</dt><dd>${b.date ? fmtDate(b.date, { weekday: true }) : chip("unknown")}</dd>
            <dt>Guests</dt><dd>${b.guests ?? chip("unknown")}</dd>
            <dt>Location</dt><dd>${esc(b.location || "") || chip("unknown")}</dd>
            <dt>Budget</dt><dd>${b.budget ? thb(b.budget) : chip("unknown")}</dd>
            <dt>Setting</dt><dd>${esc(b.setting || "") || chip("unknown")}</dd>
          </dl>
          <button class="btn link sm" data-act="toStep" data-n="2" style="justify-self:start">Change these</button>
        </div>
        <div class="card stack"><div class="field"><label for="r-sum">Summary for the team</label><textarea id="r-sum" class="input" data-input="draftSummary">${esc(dna.summary)}</textarea></div></div>
        ${unknown.length ? `<div class="card stack"><h3>Still open</h3>${unknown.map((q) => `<div class="row between"><span class="small">${esc(q.question)}</span>${chip("unknown")}</div>`).join("")}</div>` : ""}
      </div>
      <div class="tile-dark">${styleRows(dna, "draft")}${categoryCards(dna, "draft")}</div>
    </div>`;
}

function suggestName(d) {
  const t = d.dna?.eventType || "event";
  return d.client ? `${d.client} ${cap(t)}` : `${cap(t)} ${new Date().getFullYear()}`;
}

on("draftField", (el) => { S.draft[el.dataset.k] = el.value; });
on("draftSummary", (el) => { S.draft.dna.summary = el.value; });
on("cancelCreate", () => { S.draft = null; location.hash = "#/events"; });
on("example", (el) => {
  const ex = EXAMPLES[el.dataset.k];
  S.draft = { ...newDraft(), client: ex.client, input: ex.text };
  renderCreate();
});
on("briefFile", async (el) => {
  const f = el.files?.[0];
  if (!f) return;
  S.draft.input = (S.draft.input ? S.draft.input + "\n\n" : "") + (await f.text());
  renderCreate();
});
on("refFiles", async (el) => {
  for (const f of [...el.files].slice(0, 8)) S.draft.refs.push({ url: await shrink(f), reaction: null, comment: "" });
  renderCreate();
});
on("rmRef", (el) => { S.draft.refs.splice(Number(el.dataset.i), 1); renderCreate(); });

// keep reference images light enough to store in the JSON db
function shrink(file, max = 640) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.8));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

on("decode", async (el) => {
  const d = S.draft;
  const text = (document.getElementById("c-input")?.value || "").trim();
  if (!text) return toast("Type or paste what the client wants first.", "err");
  busy(el, true, S.status.mode === "claude" ? "Claude is reading…" : "Decoding…");
  try {
    const texts = [...d.texts, text];
    const dna = await api("/api/decode", { method: "POST", body: { texts, previous: d.dna } });
    d.aiMode = dna._ai;
    if (dna._aiError) toast(`Claude was unavailable (${esc(dna._aiError)}). Used the offline engine.`, "err");
    delete dna._ai; delete dna._aiError;
    d.dna = dna; d.texts = texts; d.input = "";
    renderCreate();
    document.querySelector(".tile-dark")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) { fail(err); busy(el, false); }
});

on("toStep", (el) => {
  const d = S.draft;
  const n = Number(el.dataset.n);
  if (d.step === 2) applyAnswers();
  d.step = n;
  renderCreate();
});
on("answer", (el) => { S.draft.answers[el.dataset.k] = el.value; });
on("undecided", (el) => { S.draft.undecided[el.dataset.k] = el.checked; renderCreate(); });

function applyAnswers() {
  const d = S.draft;
  const b = d.dna.basics;
  const a = d.answers;
  const set = (k, v) => { if (d.undecided[k]) b[k] = null; else if (v !== undefined && v !== "") b[k] = v; };
  set("date", a.date);
  set("guests", a.guests != null && a.guests !== "" ? Number(a.guests) : undefined);
  set("location", a.location);
  set("budget", a.budget != null && a.budget !== "" ? Number(a.budget) : undefined);
  if (a.setting !== undefined) b.setting = a.setting || null;
  const qs = [];
  for (const f of ["date", "guests", "location", "budget"]) if (!b[f]) qs.push(d.dna.openQuestions?.find((q) => q.field === f) || { field: f, question: `${cap(f)} not decided yet` });
  for (const q of d.dna.openQuestions || []) {
    if (["date", "guests", "location", "budget"].includes(q.field)) continue;
    const ans = a["q:" + q.question];
    if (ans?.trim()) d.dna.requirements.push({ id: "r" + Date.now().toString(36) + qs.length, category: "venue", text: `${q.question.replace(/\?$/, "")}: ${ans.trim()}`, kind: "requirement", source: "client", quote: ans.trim() });
    else qs.push(q);
  }
  d.dna.openQuestions = qs;
  if (b.guests) d.dna.chips = [`${b.guests} PAX`, ...(d.dna.chips || []).filter((c) => !/PAX$/.test(c))];
}

on("createEvent", async (el) => {
  const d = S.draft;
  busy(el, true, "Creating…");
  try {
    const ev = await api("/api/events", { method: "POST", body: { name: d.name || suggestName(d), client: d.client, texts: d.texts, dna: d.dna, team: [ME], references: d.refs } });
    S.draft = null;
    toast(`Created <b>${esc(ev.name)}</b>. Next: match vendors.`);
    location.hash = `#/event/${ev.id}/overview`;
  } catch (err) { fail(err); busy(el, false); }
});

// ---------------------------------------------------------------- 3+. Event workspace
async function loadEvent(id) {
  S.ev = await api(`/api/events/${id}`);
  return S.ev;
}

async function renderEvent(id, tab) {
  if (!S.ev || S.ev.id !== id) { S.matches = null; S.dnaEdit = null; S.compare = []; S.matchCat = null; S.thread = null; S.dayMode = false; S.tlView = null; S.fileGroup = null; }
  await loadEvent(id);
  renderEventTab(tab);
}

function eventSubnav(tab) {
  const e = S.ev;
  const drafts = e.threads.flatMap((t) => t.messages.filter((m) => m.from === "orca" && m.status === "awaiting_approval")).length;
  const quoted = e.quotes.filter((q) => q.status === "quoted").length;
  const late = e.tasks.filter((t) => t.status !== "done" && t.due && t.due < today()).length + e.runSheet.issues.filter((i) => !i.resolved && i.severity === "urgent").length;
  const tabs = [
    ["overview", "Overview"], ["dna", "Brief & DNA", e.dna?.openQuestions?.length], ["match", "Match vendors"],
    ["inbox", "Inbox", drafts], ["budget", "Budget", quoted],
    ["timeline", "Timeline", late], ["approvals", "Approvals", e.approvals.filter((a) => a.status === "revision").length],
    ["changes", "Changes", e.changes.filter((c) => c.status === "open").length], ["files", "Files"],
  ].map(([k, label, n]) => ({ href: `#/event/${e.id}/${k}`, label, on: tab === k, n }));
  const cta = tab === "match" ? `<button class="btn sm" data-act="matchMode" data-k="${S.matchMode === "package" ? "vendors" : "package"}">${S.matchMode === "package" ? "Back to vendors" : "Event package"}</button>`
    : `<a class="btn sm" href="#/event/${e.id}/match">Find vendors</a>`;
  subnav(e.name, tabs, cta);
}

function renderEventTab(tab) {
  eventSubnav(tab);
  const r = { overview: renderOverview, dna: renderDNA, match: renderMatch, inbox: renderEventInbox, budget: renderBudget, timeline: renderTimeline, approvals: renderApprovals, changes: renderChanges, files: renderFiles }[tab] || renderOverview;
  Promise.resolve(r()).catch(fail);
}

// ---------- Overview
function renderOverview() {
  const e = S.ev;
  const dl = daysUntil(e.date);
  const drafts = e.threads.flatMap((t) => t.messages.filter((m) => m.from === "orca" && m.status === "awaiting_approval").map((m) => ({ t, m })));
  const decide = [
    ...e.quotes.filter((q) => q.status === "quoted").map((q) => ({ ttl: `Quotation from ${q.vendorName}`, sub: `${thb(q.total)} · ${esc(q.item)}`, act: `<button class="btn sm" data-act="openQuote" data-id="${q.id}">Review quote</button>` })),
    ...drafts.map(({ t }) => ({ ttl: `Message to ${t.vendorName} is waiting for approval`, sub: esc(t.topic), act: `<button class="btn sm" data-act="openThread" data-id="${t.id}">Review draft</button>` })),
    ...(e.dna?.openQuestions || []).map((q) => ({ ttl: q.question, sub: "Open question on the brief", act: `<a class="btn sm ghost" href="#/event/${e.id}/dna">Answer</a>` })),
  ];
  for (const c of e.changes.filter((c) => c.status === "open")) decide.push({ ttl: `Change requested by ${esc(c.requestedBy)}`, sub: esc(c.message.slice(0, 90)), act: `<a class="btn sm" href="#/event/${e.id}/changes">Review change</a>` });
  for (const a of e.approvals.filter((a) => a.status === "revision")) decide.push({ ttl: `Revision requested: ${esc(a.title)} ${esc(a.version)}`, sub: esc(a.history?.[a.history.length - 1]?.note || ""), act: `<a class="btn sm ghost" href="#/event/${e.id}/approvals">Open approval</a>` });
  const cats = [...new Set((e.dna?.requirements || []).map((r) => r.category))];
  const missing = cats.filter((c) => !e.selected?.[c]);
  if (e.status !== "completed" && missing.length) decide.push({ ttl: `No vendor chosen yet: ${missing.map((c) => CATEGORY_LABEL[c]).join(", ")}`, sub: "ORCA has ranked options for each", act: `<button class="btn sm ghost" data-act="goMatch" data-cat="${missing[0]}">Compare options</button>` });

  const waiting = e.threads.filter((t) => t.status === "awaiting").map((t) => {
    const last = t.messages.filter((m) => m.status === "sent").pop();
    return { ttl: `${t.vendorName}`, sub: `${esc(t.topic)} · asked ${last ? ago(last.at) : ""}`, act: `<button class="btn sm ghost" data-act="openThread" data-id="${t.id}">Open</button>` };
  });
  for (const a of e.approvals.filter((a) => a.status === "pending" && a.sharedWithClient)) waiting.push({ ttl: `Client decision: ${esc(a.title)} ${esc(a.version)}`, sub: a.dueBy ? `Due ${fmtDate(a.dueBy)}` : "Waiting for the client", act: `<a class="btn sm ghost" href="#/event/${e.id}/approvals">Open</a>` });

  const deadlines = [];
  if (e.date && e.status !== "completed") {
    const minus = (n) => { const x = new Date(e.date + "T00:00:00"); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    if (!e.selected?.venue) deadlines.push({ date: minus(90), ttl: "Lock the venue", act: `<button class="btn sm ghost" data-act="goMatch" data-cat="venue">Compare options</button>` });
    deadlines.push({ date: minus(14), ttl: "Final guest count to caterer", act: "" });
    deadlines.push({ date: e.date, ttl: "Event day", act: "" });
  }
  if (e.status !== "completed") for (const t of e.tasks.filter((t) => t.status !== "done" && t.due).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4)) deadlines.push({ date: t.due, ttl: `${t.title} (${t.owner || "unassigned"})`, act: `<a class="btn sm ghost" href="#/event/${e.id}/timeline">Timeline</a>` });
  for (const q of e.quotes) if (q.validUntil) deadlines.push({ date: q.validUntil, ttl: `Quote from ${q.vendorName} expires`, act: `<button class="btn sm ghost" data-act="openQuote" data-id="${q.id}">Review quote</button>` });
  deadlines.sort((a, b) => a.date.localeCompare(b.date));

  const group = (title, items, empty, render) => `<div class="card"><div class="card-head"><h3>${title}</h3><span class="count">${items.length}</span></div>
    ${items.length ? items.map(render).join("") : `<div class="muted small">${empty}</div>`}</div>`;
  const itemRow = (i) => `<div class="item"><div class="grow"><div class="ttl">${i.ttl}</div><div class="sub">${i.sub || ""}</div></div>${i.act || ""}</div>`;

  $main.innerHTML = `
    <div class="ov-head">
      <div class="kv"><span>Date</span><b>${fmtDate(e.date, { weekday: true })}</b>${dl != null && e.status !== "completed" ? `<small class="muted">${dl >= 0 ? `in ${dl} days` : `${-dl} days ago`}</small>` : ""}</div>
      <div class="kv"><span>Location</span><b>${esc(e.location || "Not set")}</b></div>
      <div class="kv"><span>Guests</span><b>${e.guests ?? "—"}</b></div>
      <div class="kv"><span>Budget</span><b>${thb(e.budget)}</b></div>
      <div class="kv"><span>Brief</span><b>v${e.briefVersions?.length || 1}</b></div>
      <div class="kv"><span>Stage</span><select class="input pill" style="height:34px" data-change="setStage" aria-label="Planning stage">${STAGES.map((s) => `<option ${s === e.stage ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    </div>
    <div class="grid g2">
      ${group("Needs your decision", decide, "Nothing waiting on you.", itemRow)}
      ${group("Waiting on others", waiting, "No open requests to vendors or the client.", itemRow)}
      ${group("Upcoming deadlines", deadlines, "No deadlines yet.", (d) => `<div class="item"><div class="grow"><div class="ttl">${esc(d.ttl)}</div><div class="sub num">${fmtDate(d.date, { weekday: true })} · ${daysUntil(d.date) >= 0 ? `in ${daysUntil(d.date)} d` : "passed"}</div></div>${d.act}</div>`)}
      ${group("Recent activity", (e.activity || []).slice(0, 7), "No activity yet.", (a) => `<div class="item"><div class="grow"><div class="ttl" style="font-weight:400">${esc(a.text)}</div><div class="sub">${esc(a.who)} · ${ago(a.at)}</div></div></div>`)}
    </div>
    <div class="card" style="margin-top:20px">
      <div class="card-head"><h3>Event DNA</h3><a class="btn sm ghost" href="#/event/${e.id}/dna">Open brief</a></div>
      <div class="row">${(e.dna?.chips || []).map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div>
      <p class="small" style="margin:10px 0 0">${esc(e.dna?.summary || "")}</p>
      ${(e.feedback || []).length ? `<hr class="sep"><div class="stack">${e.feedback.slice(-3).map((f) => `<div class="learned"><span>“${esc(f.text)}”</span><span>→ <b>ORCA learned:</b> ${esc(f.learned)}</span></div>`).join("")}</div>` : ""}
    </div>`;
}

on("setStage", async (el) => {
  try { S.ev = await api(`/api/events/${S.ev.id}`, { method: "PATCH", body: { stage: el.value, status: el.value === "Completed" ? "completed" : "active" } }); toast(`Stage set to ${esc(el.value)}`); }
  catch (err) { fail(err); }
});
on("goMatch", (el) => { S.matchCat = el.dataset.cat; S.matchMode = "vendors"; location.hash = `#/event/${S.ev.id}/match`; });
on("openThread", (el) => { S.thread = el.dataset.id; location.hash = `#/event/${S.ev.id}/inbox`; if (location.hash.endsWith("/inbox")) renderEventTab("inbox"); });
on("openQuote", (el) => { S.budgetView = "forecast"; const id = el.dataset.id; location.hash = `#/event/${S.ev.id}/budget`; setTimeout(() => quoteDrawer(id), 120); });

// ---------- Brief & DNA
function renderDNA() {
  const e = S.ev;
  const dna = S.dnaEdit || e.dna;
  const b = dna.basics || {};
  const dirty = Boolean(S.dnaEdit);
  const refs = e.references || [];
  $main.innerHTML = `
    ${dirty ? `<div class="setnote" style="position:sticky;top:110px;z-index:5"><span><b>Unsaved changes to the brief.</b> Check what they affect before applying.</span><span class="grow" style="flex:1"></span>
      <button class="btn sm ghost" data-act="discardDNA" style="color:#fff;box-shadow:inset 0 0 0 1px #fff">Discard</button><button class="btn sm" data-act="previewImpact">Preview impact</button></div>` : ""}
    <div class="grid g2" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr)">
      <div class="stack">
        <div class="card stack">
          <div class="card-head"><h3>Event basics</h3><span class="chip chip-gray"><i></i>Brief v${e.briefVersions?.length || 1}</span></div>
          ${[["date", "Date", "date"], ["guests", "Guests", "number"], ["location", "Location", "text"], ["budget", "Budget (THB)", "number"], ["setting", "Setting", "text"]].map(([k, l, t]) => `
            <div class="field"><label for="b-${k}">${l}</label><input id="b-${k}" class="input" type="${t}" value="${esc(b[k] ?? "")}" placeholder="Not decided yet" data-change="basic" data-k="${k}"></div>`).join("")}
        </div>
        <div class="card stack">
          <div class="card-head"><h3>Open questions</h3><span class="count">${dna.openQuestions?.length || 0}</span></div>
          ${(dna.openQuestions || []).map((q, i) => `<div class="stack" style="gap:6px"><div class="small"><b>${esc(q.question)}</b></div>
            <div class="row"><input class="input" id="oq-${i}" placeholder="Answer" style="flex:1"><button class="btn sm" data-act="answerQ" data-i="${i}">Save</button></div></div>`).join("") || '<div class="muted small">All answered.</div>'}
        </div>
        <div class="card stack">
          <div class="card-head"><h3>References</h3><label class="btn pearl sm" for="ref-up">Add images</label><input id="ref-up" type="file" accept="image/*" multiple hidden data-change="evRefs"></div>
          ${refs.length ? `<div class="refs">${refs.map((r, i) => `<div class="ref ${r.reaction || ""}"><img src="${r.url}" alt="Reference ${i + 1}">
            <div class="acts"><button class="btn xs ${r.reaction === "like" ? "" : "pearl"}" data-act="refReact" data-i="${i}" data-r="like">Like</button><button class="btn xs ${r.reaction === "avoid" ? "danger" : "pearl"}" data-act="refReact" data-i="${i}" data-r="avoid">Avoid</button><button class="btn link xs" data-act="refComment" data-i="${i}">Comment</button></div>
            ${r.comment ? `<div class="cm">${esc(r.comment)}</div>` : ""}</div>`).join("")}</div>` : '<div class="muted small">Add mood photos from the client. Mark each one Like or Avoid and say which detail matters.</div>'}
        </div>
        <div class="card stack">
          <h3>Brief history</h3>
          ${(e.briefVersions || []).slice().reverse().map((v) => `<div class="item"><div class="grow"><div class="ttl">v${v.v}</div><div class="sub">${esc(v.note || "")}</div></div><span class="xsmall muted">${ago(v.at)}</span></div>`).join("")}
        </div>
      </div>
      <div class="stack">
        <div class="tile-dark">
          <div class="row between"><h2 style="font-size:28px">Style & experience</h2><span class="muted small">✓ keep · × remove</span></div>
          ${styleRows(dna, "edit")}
          ${(dna.learned || []).length ? `<div class="row" style="margin-top:16px"><span class="muted small">Learned from client reactions:</span>${[...new Map(dna.learned.map((l) => [l.term, l])).values()].map((l) => `<span class="chip ${l.weight > 0 ? "chip-green" : "chip-red"}"><i></i>${l.weight > 0 ? "+" : "−"} ${esc(l.term)}</span>`).join("")}</div>` : ""}
          <h2 style="font-size:24px;margin-top:26px">Requirements</h2>
          <p class="muted small" style="margin:4px 0 0"><b style="color:#fff">Bold, solid border</b> = must-have requirement. Thin border = preference.</p>
          ${categoryCards(dna, "edit")}
          <div class="refine">
            <div class="field"><label for="refine-in" style="color:#fff">The client said something new?</label>
              <textarea id="refine-in" class="input" placeholder="Paste it here: “Actually can we do 120 guests and a garden instead?”"></textarea></div>
            <button class="btn" data-act="refine">Update brief</button>
          </div>
        </div>
        <div class="card"><h3 style="margin-bottom:8px">Original client words</h3><div class="quote-box" style="padding:0">${highlight((e.texts || [e.input || ""]).join("\n\n"), dna)}</div></div>
      </div>
    </div>`;
}

on("basic", (el) => {
  const dna = dnaFor("edit");
  const k = el.dataset.k;
  const v = el.value.trim();
  dna.basics[k] = v === "" ? null : ["guests", "budget"].includes(k) ? Number(v) : v;
  if (k === "guests" && v) dna.chips = [`${v} PAX`, ...(dna.chips || []).filter((c) => !/PAX$/.test(c))];
  dna.openQuestions = (dna.openQuestions || []).filter((q) => !(q.field === k && v));
  renderEventTab("dna");
});
on("answerQ", (el) => {
  const dna = dnaFor("edit");
  const i = Number(el.dataset.i);
  const q = dna.openQuestions[i];
  const ans = document.getElementById(`oq-${i}`).value.trim();
  if (!ans) return toast("Type an answer first.", "err");
  if (["date", "guests", "location", "budget"].includes(q.field)) dna.basics[q.field] = ["guests", "budget"].includes(q.field) ? Number(ans.replace(/[^\d.]/g, "")) : ans;
  else dna.requirements.push({ id: "r" + Date.now().toString(36), category: "venue", text: `${q.question.replace(/\?$/, "")}: ${ans}`, kind: "requirement", source: "client", quote: ans });
  dna.openQuestions.splice(i, 1);
  renderEventTab("dna");
});
on("discardDNA", () => { S.dnaEdit = null; renderEventTab("dna"); });
on("previewImpact", async (el) => {
  busy(el, true, "Checking…");
  try {
    const imp = await api(`/api/events/${S.ev.id}/preview-impact`, { method: "POST", body: { dna: S.dnaEdit } });
    busy(el, false);
    drawer(`<div class="dh"><h2>Preview impact</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="db">
        <p class="small">Applying this revision creates <b>brief v${(S.ev.briefVersions?.length || 1) + 1}</b>. Nothing is sent to vendors until you choose to.</p>
        <div class="card"><h3>Top recommendations that change</h3>${imp.topPickChanges.length ? imp.topPickChanges.map((c) => `<div class="item"><div class="grow"><div class="ttl">${esc(CATEGORY_LABEL[c.category] || c.category)}</div><div class="sub">${esc(c.from)} → <b>${esc(c.to)}</b></div></div></div>`).join("") : '<div class="muted small">Top picks stay the same.</div>'}</div>
        <div class="card"><h3>Chosen vendors affected</h3>${imp.selectedAffected.length ? imp.selectedAffected.map((s) => `<div class="item"><div class="grow"><div class="ttl">${esc(s.vendor)}</div><div class="sub">${esc((s.issues || []).join(", "))}</div></div>${chip("needs", "Conflict")}</div>`).join("") : '<div class="muted small">No conflicts with vendors already chosen.</div>'}</div>
        ${imp.costNote ? `<div class="card"><h3>Costs</h3><p class="small">${esc(imp.costNote)}</p></div>` : ""}
      </div>
      <div class="df"><button class="btn" data-act="applyDNA">Apply revision</button><button class="btn ghost" data-close>Keep editing</button></div>`);
  } catch (err) { fail(err); busy(el, false); }
});
on("applyDNA", async (el) => {
  busy(el, true, "Saving…");
  try {
    S.ev = await api(`/api/events/${S.ev.id}/dna`, { method: "PUT", body: { dna: S.dnaEdit, note: "Edited by organizer" } });
    S.dnaEdit = null; S.matches = null;
    closeDrawer();
    toast(`Brief updated to v${S.ev.briefVersions.length}.`);
    renderEventTab("dna");
  } catch (err) { fail(err); busy(el, false); }
});
on("refine", async (el) => {
  const text = document.getElementById("refine-in").value.trim();
  if (!text) return toast("Paste what the client said first.", "err");
  busy(el, true, S.status.mode === "claude" ? "Claude is reading…" : "Updating…");
  try {
    const out = await api(`/api/events/${S.ev.id}/refine`, { method: "POST", body: { text } });
    S.ev = out.event; S.dnaEdit = null; S.matches = null;
    toast(`Brief updated to v${S.ev.briefVersions.length}${out.ai === "claude" ? " by Claude" : ""}.`);
    renderEventTab("dna");
  } catch (err) { fail(err); busy(el, false); }
});
on("evRefs", async (el) => {
  const refs = [...(S.ev.references || [])];
  for (const f of [...el.files].slice(0, 8)) refs.push({ url: await shrink(f), reaction: null, comment: "" });
  await saveRefs(refs);
});
on("refReact", async (el) => {
  const refs = structuredClone(S.ev.references || []);
  const r = refs[Number(el.dataset.i)];
  r.reaction = r.reaction === el.dataset.r ? null : el.dataset.r;
  await saveRefs(refs);
});
on("refComment", (el) => {
  const i = Number(el.dataset.i);
  const box = el.closest(".ref");
  if (box.querySelector("textarea")) return;
  box.insertAdjacentHTML("beforeend", `<div style="padding:6px;display:grid;gap:6px"><textarea class="input" style="min-height:60px;font-size:13px" placeholder="Which detail matters? e.g. the low centrepieces">${esc(S.ev.references[i].comment || "")}</textarea><button class="btn xs" data-act="refCommentSave" data-i="${i}">Save</button></div>`);
});
on("refCommentSave", async (el) => {
  const refs = structuredClone(S.ev.references || []);
  refs[Number(el.dataset.i)].comment = el.closest(".ref").querySelector("textarea").value.trim();
  await saveRefs(refs);
});
async function saveRefs(refs) {
  try { S.ev = await api(`/api/events/${S.ev.id}`, { method: "PATCH", body: { references: refs } }); renderEventTab("dna"); }
  catch (err) { fail(err); }
}

// ---------- Match vendors
async function getMatches(refresh = false) {
  if (!S.matches || refresh) S.matches = await api(`/api/events/${S.ev.id}/matches${refresh ? "?refresh=1" : ""}`);
  return S.matches;
}

async function renderMatch() {
  const e = S.ev;
  if (!S.matches) $main.innerHTML = `<div class="empty"><span class="spin"></span> ${S.status.mode === "claude" ? "Claude is matching vendors to the Event DNA…" : "Matching vendors to the Event DNA…"}</div>`;
  const m = await getMatches();
  const cats = Object.keys(m.categories);
  if (!cats.length) { $main.innerHTML = `<div class="empty">Add requirements to the brief first. <a href="#/event/${e.id}/dna">Open brief</a></div>`; return; }
  if (S.matchMode === "package") return renderPackage(m);
  S.matchCat = cats.includes(S.matchCat) ? S.matchCat : cats[0];
  const f = S.filters;
  let list = m.categories[S.matchCat];
  const locations = [...new Set(list.map((x) => x.vendor.location))];
  if (f.location) list = list.filter((x) => x.vendor.location === f.location || (x.vendor.serviceArea || []).includes(f.location));
  if (f.capacity) list = list.filter((x) => !x.vendor.capacity || x.vendor.capacity.max >= Number(f.capacity));
  if (f.maxPrice) list = list.filter((x) => x.vendor.priceFrom == null || x.vendor.priceFrom <= Number(f.maxPrice));
  if (f.style) list = list.filter((x) => JSON.stringify([x.vendor.dna, x.vendor.tags]).toLowerCase().includes(f.style.toLowerCase()));
  if (f.avail === "hideBooked") list = list.filter((x) => x.availability !== "booked");
  if (f.avail === "available") list = list.filter((x) => x.availability === "available");
  const learned = e.dna?.learned || [];

  $main.innerHTML = `
    <div class="grid g2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start;margin-bottom:6px">
      <div>
        <div class="seg" role="tablist" aria-label="Service categories">${cats.map((c) => `<button class="${c === S.matchCat ? "on" : ""}" data-act="matchCat" data-k="${c}">${esc(CATEGORY_LABEL[c] || c)}${e.selected?.[c] ? " ✓" : ""}</button>`).join("")}</div>
        <div class="filters">
          <select class="input pill" data-change="filter" data-k="location" aria-label="Location"><option value="">Any location</option>${locations.map((l) => `<option ${f.location === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
          <input class="input pill" type="number" placeholder="Min capacity" value="${esc(f.capacity || "")}" data-change="filter" data-k="capacity" style="width:140px" aria-label="Minimum capacity">
          <input class="input pill" type="number" placeholder="Max starting price" value="${esc(f.maxPrice || "")}" data-change="filter" data-k="maxPrice" style="width:170px" aria-label="Maximum starting price">
          <input class="input pill" placeholder="Style, e.g. garden" value="${esc(f.style || "")}" data-change="filter" data-k="style" style="width:170px" aria-label="Style keyword">
          <select class="input pill" data-change="filter" data-k="avail" aria-label="Availability"><option value="">Any availability</option><option value="hideBooked" ${f.avail === "hideBooked" ? "selected" : ""}>Hide booked</option><option value="available" ${f.avail === "available" ? "selected" : ""}>Confirmed available</option></select>
        </div>
      </div>
      <div class="card flat stack" style="padding:16px">
        <label class="lbl" for="fb-in">How did the client react?</label>
        <div class="row"><input id="fb-in" class="input" placeholder="“Pretty, but the venue feels too formal”" style="flex:1"><button class="btn sm" data-act="feedback">Teach ORCA</button></div>
        ${learned.length ? `<div class="row xsmall">${[...new Map(learned.map((l) => [l.term, l])).values()].slice(-6).map((l) => `<span class="chip ${l.weight > 0 ? "chip-green" : "chip-red"}"><i></i>${l.weight > 0 ? "+" : "−"} ${esc(l.term)}</span>`).join("")}</div>` : ""}
      </div>
    </div>
    ${m.setNote ? `<div class="setnote">${LOGO}<div><b>Matching set.</b> ${esc(m.setNote)}</div></div>` : ""}
    <div class="row between" style="margin-bottom:12px"><span class="small muted">${list.length} ${esc(CATEGORY_LABEL[S.matchCat]).toLowerCase()} options ranked by DNA match · ${m.ai === "claude" ? "explained by Claude" : "offline explanations"}</span>
      <button class="btn link sm" data-act="rematch">Re-run matching</button></div>
    <div class="vgrid">${list.map((x, i) => vendorCard(x, i === 0 && !f.style)).join("") || '<div class="empty">No vendors match these filters.</div>'}</div>
    ${S.compare.length ? `<div style="position:sticky;bottom:16px;margin-top:20px;display:flex;justify-content:center"><div class="setnote" style="margin:0;align-items:center">Comparing ${S.compare.length} vendor${S.compare.length > 1 ? "s" : ""}
      <button class="btn sm" data-act="compare" ${S.compare.length < 2 ? "disabled" : ""}>Compare side by side</button><button class="btn link sm" data-act="clearCompare">Clear</button></div></div>` : ""}`;
}

function vendorCard(x, top) {
  const v = x.vendor;
  const e = S.ev;
  const sl = (e.shortlist?.[v.category] || []).includes(v.id);
  const sel = e.selected?.[v.category] === v.id;
  const ev = x.evidence;
  const hits = [...new Set([...ev.mood, ...ev.feel, ...ev.look])].slice(0, 4);
  return `<article class="vcard ${top ? "top" : ""}">
    ${portfolioTile(v)}
    <div class="body">
      <div class="row between"><h3>${esc(v.shopName)}</h3>${top ? '<span class="chip chip-ink">Top match</span>' : ""}</div>
      <div class="score">${dots(x.score)} <b class="num">${x.score.toFixed(1)}</b><span class="muted">· ${esc(CATEGORY_LABEL[v.category])} · ${esc(v.area || v.location)}</span></div>
      <div class="price">${v.priceFrom != null ? `From <b>${thb(v.priceFrom)}</b> <span class="muted">${esc(v.priceUnit)}</span>` : chip("needs", "Price needs confirmation")}${v.capacity ? ` <span class="muted small">· up to ${v.capacity.max} guests</span>` : ""}</div>
      <div class="why"><b>Why:</b> ${esc(x.why)}</div>
      <div class="ev">${hits.map((h) => `<span>✓ ${esc(h)}</span>`).join("")}${ev.fits.slice(0, 2).map((h) => `<span>✓ ${esc(h)}</span>`).join("")}${ev.avoid.map((h) => `<span class="no">✕ ${esc(h)}</span>`).join("")}${ev.issues.map((h) => `<span class="no">! ${esc(h)}</span>`).join("")}</div>
      ${x.needsConfirmation.length ? `<div class="confirm"><b>Needs confirmation:</b> ${x.needsConfirmation.map(esc).join(" · ")}</div>` : ""}
    </div>
    <div class="actions">
      <button class="btn sm pearl" data-act="vendorDrawer" data-id="${v.id}">View details</button>
      <button class="btn sm ${sl ? "dark" : "pearl"}" data-act="shortlist" data-id="${v.id}" data-on="${!sl}">${sl ? "Shortlisted" : "Shortlist"}</button>
      <label class="check small"><input type="checkbox" data-change="compareToggle" data-id="${v.id}" ${S.compare.includes(v.id) ? "checked" : ""}> Compare</label>
      <span style="flex:1"></span>
      <button class="btn sm ghost" data-act="askVendor" data-id="${v.id}" data-q="${esc(JSON.stringify(x.needsConfirmation))}">Request quote</button>
      <button class="btn sm" data-act="select" data-id="${v.id}" data-on="${!sel}">${sel ? "In event ✓" : "Add to event"}</button>
    </div>
  </article>`;
}

on("matchCat", (el) => { S.matchCat = el.dataset.k; S.compare = []; renderMatch().catch(fail); });
on("matchMode", (el) => { S.matchMode = el.dataset.k; renderEventTab("match"); });
on("filter", (el) => { S.filters[el.dataset.k] = el.value; renderMatch().catch(fail); });
on("rematch", async (el) => { busy(el, true, "Matching…"); S.matches = null; await getMatches(true).catch(fail); renderMatch().catch(fail); });
on("compareToggle", (el) => {
  const id = el.dataset.id;
  S.compare = el.checked ? [...new Set([...S.compare, id])].slice(-4) : S.compare.filter((x) => x !== id);
  renderMatch().catch(fail);
});
on("clearCompare", () => { S.compare = []; renderMatch().catch(fail); });

on("feedback", async (el) => {
  const text = document.getElementById("fb-in").value.trim();
  if (!text) return toast("Type the client's reaction first.", "err");
  busy(el, true, "Learning…");
  try {
    const out = await api(`/api/events/${S.ev.id}/feedback`, { method: "POST", body: { text } });
    S.ev = out.event; S.matches = null;
    toast(`<b>ORCA learned:</b> ${esc(out.learned)}. It will remember this for every search.`);
    await renderMatch();
  } catch (err) { fail(err); busy(el, false); }
});

on("shortlist", async (el) => {
  try { S.ev = await api(`/api/events/${S.ev.id}/shortlist`, { method: "POST", body: { vendorId: el.dataset.id, on: el.dataset.on === "true" } }); refreshCurrent(); }
  catch (err) { fail(err); }
});
on("select", async (el) => {
  try {
    S.ev = await api(`/api/events/${S.ev.id}/select`, { method: "POST", body: { vendorId: el.dataset.id, on: el.dataset.on === "true" } });
    toast(el.dataset.on === "true" ? "Added to the event package. An estimate is on the budget." : "Removed from the event package.");
    refreshCurrent();
  } catch (err) { fail(err); }
});
on("askVendor", async (el) => {
  let qs = [];
  try { qs = JSON.parse(el.dataset.q || "[]"); } catch {}
  const questions = qs.map((q) => (/availab/i.test(q) ? `${q.replace(/^Availability on /, "ว่างวันที่ ")} ไหมครับ` : `${q} (รบกวนแจ้งรายละเอียด)`));
  if (!questions.some((q) => /ราคา|price/i.test(q))) questions.push("ราคารวมสำหรับงานนี้ และสิ่งที่ไม่รวมในราคา");
  if (!questions.some((q) => /ว่าง/.test(q)) && S.ev.date) questions.unshift(`ว่างวันที่ ${S.ev.date} ไหมครับ`);
  busy(el, true, "Drafting…");
  try {
    const t = await api(`/api/events/${S.ev.id}/ask`, { method: "POST", body: { vendorId: el.dataset.id, questions, topic: `Quote request: ${S.ev.name}` } });
    S.thread = t.id;
    closeDrawer();
    toast(`ORCA drafted a message to <b>${esc(t.vendorName)}</b>. Review and approve it before it's sent.`);
    location.hash = `#/event/${S.ev.id}/inbox`;
  } catch (err) { fail(err); busy(el, false); }
});

function refreshCurrent() {
  const tab = (location.hash.split("/")[3]) || "overview";
  renderEventTab(tab);
}

on("compare", () => {
  const all = Object.values(S.matches.categories).flat();
  const items = S.compare.map((id) => all.find((x) => x.vendorId === id)).filter(Boolean);
  const rows = [
    ["Match", (x) => `${dots(x.score)} ${x.score.toFixed(1)}`],
    ["Starting price", (x) => (x.vendor.priceFrom != null ? `${thb(x.vendor.priceFrom)} ${esc(x.vendor.priceUnit)}` : chip("needs"))],
    ["Estimate for this event", (x) => (x.estimate != null ? thb(x.estimate) : chip("needs"))],
    ["Capacity", (x) => (x.vendor.capacity ? `${x.vendor.capacity.min}–${x.vendor.capacity.max}` : "—")],
    ["Setting", (x) => esc(x.vendor.setting || "—")],
    ["Mood", (x) => esc((x.vendor.dna?.mood || []).join(", "))],
    ["Look", (x) => esc((x.vendor.dna?.look || []).join(", "))],
    ["Includes", (x) => `<ul class="clean">${(x.vendor.packages?.[0]?.includes || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`],
    ["Excludes", (x) => `<ul class="clean">${(x.vendor.packages?.[0]?.excludes || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`],
    [`Availability ${S.ev.date ? fmtDate(S.ev.date) : ""}`, (x) => chip(x.availability === "unknown" ? "unconfirmed" : x.availability)],
    ["Needs confirmation", (x) => esc(x.needsConfirmation.join(", ") || "—")],
    ["Why it fits", (x) => esc(x.why)],
  ];
  drawer(`<div class="dh"><h2>Compare ${esc(CATEGORY_LABEL[S.matchCat])}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="db"><div class="compare"><table><thead><tr><th></th>${items.map((x) => `<td><b>${esc(x.vendor.shopName)}</b></td>`).join("")}</tr></thead>
    <tbody>${rows.map(([l, f]) => { const cells = items.map(f); const diff = new Set(cells).size > 1; return `<tr><th>${l}</th>${cells.map((c) => `<td class="${diff ? "diff" : ""}">${c}</td>`).join("")}</tr>`; }).join("")}</tbody></table></div>
    <p class="xsmall muted">Highlighted rows differ between vendors.</p></div>
    <div class="df">${items.map((x) => `<button class="btn sm" data-act="select" data-id="${x.vendorId}" data-on="true">Choose ${esc(x.vendor.shopName)}</button>`).join("")}</div>`, { wide: true });
});

function renderPackage(m) {
  const e = S.ev;
  const cats = Object.keys(m.categories);
  const quotes = e.quotes;
  let total = 0;
  const rows = cats.map((c) => {
    const vid = e.selected?.[c];
    const match = vid ? m.categories[c].find((x) => x.vendorId === vid) : null;
    const q = quotes.find((x) => x.vendorId === vid);
    if (q) total += q.total;
    const conflicts = match ? [...match.evidence.issues, ...match.evidence.avoid.map((a) => `leans ${a}`)] : [];
    return `<div class="pk-row"><div><div class="eyebrow">${esc(CATEGORY_LABEL[c])}</div></div>
      <div>${vid ? `<b>${esc(match?.vendor.shopName || vid)}</b> ${match ? dots(match.score) : ""}<div class="small muted">${q ? `${esc(q.item)} · ${chip(q.status)}` : ""}</div>${conflicts.length ? `<div class="small" style="color:var(--bad)">Conflict: ${esc(conflicts.join(", "))}</div>` : ""}` : `${chip("needs", "Missing service")} <span class="small muted">Top option: ${esc(m.categories[c][0]?.vendor.shopName || "—")}</span>`}</div>
      <div class="r num">${q ? thb(q.total) : vid ? chip("needs") : `<button class="btn sm ghost" data-act="matchCat2" data-k="${c}">Choose</button>`}</div></div>`;
  });
  const budget = e.budget || 0;
  const pct = budget ? Math.min(100, (total / budget) * 100) : 0;
  $main.innerHTML = `
    <div class="page-head"><div><h1>Event package</h1><p>Every chosen service in one view, with the overall cost and anything still missing or in conflict.</p></div></div>
    ${m.setNote ? `<div class="setnote">${LOGO}<div><b>Matching set.</b> ${esc(m.setNote)}</div></div>` : ""}
    <div class="grid g2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start">
      <div class="card package">${rows.join("")}</div>
      <div class="card stack"><div class="eyebrow">Overall cost</div><div style="font-size:34px;font-weight:600" class="num">${thb(total)}</div>
        <div class="small muted">of ${thb(budget)} budget</div><div class="bar"><i class="${total > budget ? "over" : ""}" style="width:${pct}%"></i></div>
        <div class="small">${cats.filter((c) => !e.selected?.[c]).length} services missing</div>
        <a class="btn ghost sm" href="#/event/${e.id}/budget">Open budget</a></div>
    </div>`;
}
on("matchCat2", (el) => { S.matchCat = el.dataset.k; S.matchMode = "vendors"; renderEventTab("match"); });

// ---------- Vendor details drawer
on("vendorDrawer", (el) => vendorDrawer(el.dataset.id, "overview"));

async function vendorDrawer(id, tab = "overview") {
  const v = await api(`/api/vendors/${id}`).catch(fail);
  if (!v) return;
  const e = S.ev && location.hash.startsWith("#/event") ? S.ev : null;
  const match = e && S.matches ? Object.values(S.matches.categories).flat().find((x) => x.vendorId === id) : null;
  const stale = v.lastConfirmed && (Date.now() - new Date(v.lastConfirmed)) / 86400000 > 30;
  const tabs = [["overview", "Overview"], ["portfolio", "Portfolio"], ["packages", "Packages"], ["availability", "Availability"], ["history", "History"]];
  const body = {
    overview: () => `
      ${portfolioTile(v)}
      <p style="margin:0">${esc(v.description || "")}</p>
      ${match ? `<div class="learned"><span><b>Why it fits:</b> ${esc(match.why)}</span></div>` : ""}
      <dl class="kvlist">
        <dt>Category</dt><dd>${esc(CATEGORY_LABEL[v.category] || v.category)}</dd>
        <dt>Location</dt><dd>${esc([v.area, v.location].filter(Boolean).join(", "))}</dd>
        <dt>Service area</dt><dd>${esc((v.serviceArea || []).join(", "))}</dd>
        ${v.capacity ? `<dt>Capacity</dt><dd>${v.capacity.min}–${v.capacity.max} guests</dd>` : ""}
        ${v.setting ? `<dt>Setting</dt><dd>${esc(v.setting)}</dd>` : ""}
        <dt>Price</dt><dd>${v.priceFrom != null ? `${thb(v.priceFrom)}–${thb(v.priceTo)} ${esc(v.priceUnit)}` : chip("needs")}</dd>
        <dt>Style DNA</dt><dd>${["mood", "feel", "look"].map((k) => (v.dna?.[k] || []).map((t) => `<span class="tag" style="font-size:12px;padding:3px 9px;margin:0 4px 4px 0">${esc(t)}</span>`).join("")).join("")}</dd>
        <dt>Contact</dt><dd>LINE <b>${esc(v.contact?.line || "—")}</b><br>${esc(v.contact?.email || "")}<br>${esc(v.contact?.phone || "")}</dd>
        <dt>Track record</dt><dd>${v.rating ? `★ ${v.rating} · ` : ""}${v.eventsDone} events · replies ${esc(v.responseTime || "")}</dd>
        <dt>Last confirmed</dt><dd>${fmtDate(v.lastConfirmed)} ${stale ? chip("needs", "Older than 30 days") : ""}</dd>
      </dl>
      ${(v.missing || []).length || match?.needsConfirmation?.length ? `<div class="card flat"><b class="small">Information still requiring confirmation</b><ul class="clean">${[...new Set([...(v.missing || []), ...(match?.needsConfirmation || [])])].map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>` : ""}`,
    portfolio: () => `<div class="pf-strip">${(v.portfolio?.length ? v.portfolio : [{}, {}, {}]).map((_, i) => portfolioTile(v, i, "sq")).join("")}</div>`,
    packages: () => (v.packages || []).map((p) => `<div class="card stack"><div class="row between"><h3>${esc(p.name)}</h3><b class="num">${thb(p.price)} <span class="muted small">${esc(p.unit)}</span></b></div>
      <div class="grid g2"><div><div class="eyebrow">Includes</div><ul class="clean">${(p.includes || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>
      <div><div class="eyebrow">Excludes</div><ul class="clean">${(p.excludes || []).map((i) => `<li>${esc(i)}</li>`).join("") || "<li>Nothing listed</li>"}</ul></div></div></div>`).join("") || '<div class="empty">No packages listed yet.</div>',
    availability: () => `${e?.date ? `<div class="card flat row between"><span>Your event · ${fmtDate(e.date, { weekday: true })}</span>${chip(v.availability?.[e.date] || "unconfirmed")}</div>` : ""}
      <div class="stack">${Object.entries(v.availability || {}).sort().map(([d, s]) => `<div class="row between small"><span class="num">${fmtDate(d, { weekday: true })}</span>${chip(s)}</div>`).join("") || '<div class="muted small">No dates confirmed yet. Ask the vendor.</div>'}</div>
      <p class="xsmall muted">Information last confirmed ${fmtDate(v.lastConfirmed)}.</p>`,
    history: () => `<h3>Past work with ORCA organizers</h3>${(v.history || []).map((h) => `<div class="item"><div class="grow"><div class="ttl">${esc(h.name)}</div><div class="sub">${fmtDate(h.date)}</div></div>${stageChip(h.status === "completed" ? "Completed" : "Confirmed")}</div>`).join("") || '<div class="muted small">No past events yet.</div>'}
      <h3 style="margin-top:12px">Previous conversations</h3>${(v.threads || []).map((t) => `<div class="item"><div class="grow"><div class="ttl">${esc(t.topic)}</div><div class="sub">${esc(t.eventName || "")}</div></div>${chip(t.status === "draft" ? "draft" : t.status)}</div>`).join("") || '<div class="muted small">No conversations yet.</div>'}`,
  };
  const actions = e ? `
      <button class="btn sm ghost" data-act="askVendor" data-id="${v.id}" data-q='${esc(JSON.stringify([`Availability on ${e.date}`]))}'>Request availability</button>
      <button class="btn sm ghost" data-act="askVendor" data-id="${v.id}" data-q='${esc(JSON.stringify(match?.needsConfirmation || []))}'>Request quote</button>
      <button class="btn sm" data-act="select" data-id="${v.id}" data-on="true">Add to event</button>`
    : `<span class="small muted">Open an event to request quotes or add this vendor.</span>`;
  drawer(`<div class="dh"><h2>${esc(v.shopName)}</h2>${v.verified ? chip("available", "Verified") : chip("draft", "New shop")}<button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="db"><div class="seg">${tabs.map(([k, l]) => `<button class="${k === tab ? "on" : ""}" data-act="vdTab" data-id="${v.id}" data-k="${k}">${l}</button>`).join("")}</div>${body[tab]()}</div>
    <div class="df">${actions}</div>`);
}
on("vdTab", (el) => vendorDrawer(el.dataset.id, el.dataset.k));

// ---------- Inbox (event + global)
function renderEventInbox() {
  renderInbox(S.ev.threads, { event: S.ev });
}

async function renderGlobalInbox() {
  subnav("Inbox", [], "");
  const [threads, events] = await Promise.all([api("/api/threads"), api("/api/events")]);
  S.allEvents = events;
  renderInbox(threads, { event: null });
}

function lastMsg(t) { return t.messages[t.messages.length - 1]; }

function renderInbox(threads, { event }) {
  threads = [...threads].sort((a, b) => (lastMsg(b)?.at || "").localeCompare(lastMsg(a)?.at || ""));
  if (!threads.find((t) => t.id === S.thread)) S.thread = threads[0]?.id || null;
  const t = threads.find((x) => x.id === S.thread);
  const statusChip = (t) => {
    const lm = lastMsg(t);
    if (lm?.from === "orca" && lm.status !== "sent") return chip(lm.status);
    return chip(t.status === "draft" ? "draft" : t.status);
  };
  const list = threads.map((x) => `<div class="th ${x.id === S.thread ? "on" : ""}" data-act="pickThread" data-id="${x.id}" role="button" tabindex="0">
    <div class="top"><span class="nm">${esc(x.vendorName)}</span>${statusChip(x)}</div>
    <div class="row xsmall muted" style="gap:6px">${event ? "" : x.eventName ? esc(x.eventName) : `<select class="input" style="height:26px;padding:0 8px;font-size:12px;width:auto" data-change="assignEvent" data-id="${x.id}"><option>Choose event</option>${(S.allEvents || []).map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select>`} <span class="chip chip-gray"><i></i>${esc(x.channel)}</span></div>
    <div class="last">${esc((lastMsg(x)?.text || "").slice(0, 90))}</div></div>`).join("");

  const msg = (m) => {
    if (m.from === "vendor") {
      const p = m.parsed || {};
      const q = (event || S.ev)?.quotes?.find((q) => q.threadId === t.id);
      return `<div class="msg in"><div class="bubble">${esc(m.text)}</div>${m.textEn ? `<div class="tr-en">EN: ${esc(m.textEn)}</div>` : ""}
        <div class="parsed"><b>ORCA read this reply</b>
          <div class="row">${p.available === true ? chip("available") : p.available === false ? chip("booked", "Not available") : chip("unconfirmed", "Availability not stated")}${p.price ? `<span class="chip chip-blue"><i></i>${thb(p.price)}</span>` : chip("needs", "No price")}</div>
          ${p.notes ? `<div>${esc(p.notes)}</div>` : ""}
          ${event && q ? `<div class="row"><button class="btn xs" data-act="openQuote" data-id="${q.id}">Review quotation</button><button class="btn xs ghost" data-act="select" data-id="${t.vendorId}" data-on="true">Add to event</button></div>` : ""}
        </div>
        <div class="mm">${esc(t.vendorName)} · ${m.via === "line" ? "pasted from LINE · " : ""}${ago(m.at)}</div></div>`;
    }
    const pending = m.status === "awaiting_approval" || m.status === "draft";
    return `<div class="msg out ${pending ? "pending" : m.status === "approved" ? "approved" : ""}" data-mid="${m.id}">
      <div class="bubble" ${pending ? `contenteditable="true" spellcheck="false" data-input="editDraft" data-tid="${t.id}" data-mid="${m.id}" aria-label="Editable draft"` : ""}>${esc(m.text)}</div>
      ${m.textEn ? `<div class="tr-en">EN: ${esc(m.textEn)}</div>` : ""}
      <div class="mm">${chip(m.status)}${m.ai === "claude" ? '<span class="chip chip-purple"><i></i>Drafted by Claude</span>' : '<span class="chip chip-purple-soft"><i></i>Drafted by ORCA</span>'} ${m.status === "sent" ? ago(m.at) : ""}</div>
      ${pending ? `<div class="row" style="justify-content:flex-end"><button class="btn xs danger" data-act="msgAct" data-a="discard" data-tid="${t.id}" data-mid="${m.id}">Discard</button><button class="btn xs" data-act="msgAct" data-a="approve" data-tid="${t.id}" data-mid="${m.id}">Approve</button></div>` : ""}
      ${m.status === "approved" ? `<div class="row" style="justify-content:flex-end"><span class="xsmall muted">Approved. It goes out only when you press Send.</span><button class="btn xs" data-act="msgAct" data-a="send" data-tid="${t.id}" data-mid="${m.id}">Send</button></div>` : ""}
    </div>`;
  };

  const ev = event || (t && S.allEvents?.find((e) => e.id === t.eventId));
  const ctx = t && ev ? `<aside class="ctx"><div class="eyebrow">Event context</div><b>${esc(ev.name)}</b>
    <dl class="kvlist" style="grid-template-columns:80px 1fr"><dt>Date</dt><dd>${fmtDate(ev.date)}</dd><dt>Guests</dt><dd>${ev.guests ?? "—"}</dd><dt>Location</dt><dd>${esc(ev.location || "—")}</dd><dt>Budget</dt><dd>${thb(ev.budget)}</dd></dl>
    ${event ? `<div class="eyebrow">This vendor</div>${(event.quotes.filter((q) => q.vendorId === t.vendorId)).map((q) => `<div class="small">${esc(q.item)}<br><b>${thb(q.total)}</b> ${chip(q.status)}</div>`).join("") || '<div class="small muted">No quote yet.</div>'}` : ""}
    <button class="btn sm pearl" data-act="vendorDrawer" data-id="${t.vendorId}">Vendor details</button>
    ${t.questions?.length ? `<div class="eyebrow">Questions asked</div><ul class="clean small">${t.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}</aside>` : "";

  $main.innerHTML = threads.length ? `
    <div class="inbox ${ctx ? "" : "noctx"}">
      <div class="th-list" aria-label="Conversations">${list}</div>
      <section class="convo">${t ? `
        <div class="ch"><b>${esc(t.vendorName)}</b><span class="muted small">${esc(CATEGORY_LABEL[t.vendorCategory] || "")} · ${esc(t.topic)}</span><span style="flex:1"></span>${chip(t.status === "draft" ? "draft" : t.status)}</div>
        <div class="msgs">${t.messages.map(msg).join("")}</div>
        <div class="composer">
          <div class="seg"><button class="${S.composeTab === "ask" ? "on" : ""}" data-act="composeTab" data-k="ask">Ask with ORCA</button><button class="${S.composeTab === "paste" ? "on" : ""}" data-act="composeTab" data-k="paste">Paste reply from LINE</button></div>
          ${S.composeTab === "ask" ? `<div class="small muted">To: <b>${esc(t.vendorName)}</b> via ORCA vendor portal · one question per line. ORCA drafts it in polite Thai; you approve before it's sent.</div>
            <textarea id="ask-in" class="input" style="min-height:70px" placeholder="ราคารวมสำหรับ 150 คน\nรวมค่าบริการและ VAT หรือยัง"></textarea>
            <div class="row" style="justify-content:flex-end"><button class="btn sm" data-act="askMore" data-id="${t.vendorId}" data-ev="${t.eventId}">Draft with ORCA</button></div>`
          : `<div class="small muted">Vendor answered on LINE instead? Paste it. ORCA reads availability and price into the budget.</div>
            <textarea id="paste-in" class="input" style="min-height:70px" placeholder="ว่างค่ะ ราคา 45k รวมดอกไม้หน้างาน ไม่รวมค่าขนส่ง"></textarea>
            <div class="row" style="justify-content:flex-end"><button class="btn sm" data-act="pasteReply" data-tid="${t.id}">Read reply</button></div>`}
        </div>` : '<div class="empty" style="margin:20px">Pick a conversation.</div>'}
      </section>
      ${ctx}
    </div>` : `<div class="empty">No conversations yet. Use <b>Request quote</b> on a vendor and ORCA drafts the first message.</div>`;
  const msgs = $main.querySelector(".msgs");
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

const inboxRefresh = async () => {
  if (location.hash.startsWith("#/inbox")) return renderGlobalInbox();
  await loadEvent(S.ev.id);
  renderEventTab("inbox");
};

on("pickThread", (el) => { S.thread = el.dataset.id; inboxRefresh().catch(fail); });
on("composeTab", (el) => { S.composeTab = el.dataset.k; inboxRefresh().catch(fail); });
let editTimer;
on("editDraft", (el) => {
  clearTimeout(editTimer);
  editTimer = setTimeout(() => api(`/api/threads/${el.dataset.tid}/messages/${el.dataset.mid}`, { method: "PATCH", body: { text: el.innerText } }).catch(fail), 500);
});
on("msgAct", async (el) => {
  const { tid, mid, a } = el.dataset;
  const bubble = el.closest(".msg")?.querySelector(".bubble[contenteditable]");
  try {
    if (a === "send") { el.closest(".mm, .row").insertAdjacentHTML("beforebegin", chip("sending")); busy(el, true, "Sending…"); }
    await api(`/api/threads/${tid}/messages/${mid}`, { method: "PATCH", body: { action: a, ...(bubble ? { text: bubble.innerText } : {}) } });
    toast(a === "send" ? "Sent to the vendor portal." : a === "approve" ? "Approved. Press Send when you're ready." : "Draft discarded.");
    await inboxRefresh();
  } catch (err) { fail(err); }
});
on("askMore", async (el) => {
  const qs = document.getElementById("ask-in").value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!qs.length) return toast("Type at least one question.", "err");
  busy(el, true, "Drafting…");
  try {
    await api(`/api/events/${el.dataset.ev}/ask`, { method: "POST", body: { vendorId: el.dataset.id, questions: qs } });
    await inboxRefresh();
  } catch (err) { fail(err); busy(el, false); }
});
on("pasteReply", async (el) => {
  const text = document.getElementById("paste-in").value.trim();
  if (!text) return toast("Paste the vendor's reply first.", "err");
  busy(el, true, "Reading…");
  try {
    await api(`/api/threads/${el.dataset.tid}/reply`, { method: "POST", body: { text, via: "line" } });
    toast("Reply read. Availability and price are on the budget.");
    await inboxRefresh();
  } catch (err) { fail(err); busy(el, false); }
});
on("assignEvent", async (el) => {
  try { await api(`/api/threads/${el.dataset.id}`, { method: "PATCH", body: { eventId: el.value } }); renderGlobalInbox(); } catch (err) { fail(err); }
});

// ---------- Budget
function renderBudget() {
  const e = S.ev;
  const views = { forecast: () => true, committed: (q) => ["committed", "paid"].includes(q.status), paid: (q) => q.status === "paid" };
  const sum = (f) => e.quotes.filter(f).reduce((s, q) => s + (q.total || 0), 0);
  const forecast = sum(views.forecast), committed = sum(views.committed), paid = sum(views.paid);
  const rows = e.quotes.filter(views[S.budgetView]);
  const cats = [...new Set((e.dna?.requirements || []).map((r) => r.category))];
  const missing = cats.filter((c) => !e.quotes.some((q) => q.category === c));
  const pct = (v) => (e.budget ? Math.min(100, (v / e.budget) * 100) : 0);
  $main.innerHTML = `
    <div class="totals">
      <div class="card"><div class="eyebrow">Budget</div><div class="v">${thb(e.budget)}</div></div>
      <div class="card"><div class="eyebrow">Forecast</div><div class="v">${thb(forecast)}</div><div class="bar"><i class="${forecast > e.budget ? "over" : ""}" style="width:${pct(forecast)}%"></i></div></div>
      <div class="card"><div class="eyebrow">Committed</div><div class="v">${thb(committed)}</div><div class="bar"><i style="width:${pct(committed)}%"></i></div></div>
      <div class="card"><div class="eyebrow">Paid</div><div class="v">${thb(paid)}</div><div class="bar"><i style="width:${pct(paid)}%"></i></div></div>
    </div>
    <div class="row between" style="margin-bottom:14px">
      <div class="seg">${[["forecast", "Forecast"], ["committed", "Committed"], ["paid", "Paid"]].map(([k, l]) => `<button class="${S.budgetView === k ? "on" : ""}" data-act="budgetView" data-k="${k}">${l}</button>`).join("")}</div>
      ${missing.length ? `<span class="small">${chip("needs", "Missing")} ${missing.map((c) => esc(CATEGORY_LABEL[c])).join(", ")} · <a href="#/event/${e.id}/match" data-act="goMatch" data-cat="${missing[0]}">find vendors</a></span>` : ""}
    </div>
    <div class="table-wrap"><table class="t">
      <thead><tr><th>Category</th><th>Vendor</th><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Total</th><th>Cost status</th><th>Source quote</th></tr></thead>
      <tbody>${rows.map((q) => `<tr class="click" data-act="quoteRow" data-id="${q.id}">
        <td>${esc(CATEGORY_LABEL[q.category] || q.category)}</td><td><b>${esc(q.vendorName)}</b></td><td>${esc(q.item)}</td>
        <td class="r">${q.qty}</td><td class="r">${q.unitPrice ? thb(q.unitPrice) : chip("needs")}</td><td class="r"><b>${q.unitPrice ? thb(q.total) : "—"}</b></td>
        <td>${chip(q.status)}${(q.needsConfirmation || []).length ? " " + chip("needs") : ""}</td>
        <td class="small">${q.threadId ? "Vendor reply" : q.status === "estimate" ? "ORCA estimate" : "Manual"}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">Nothing here yet. Add vendors to the event or request quotes.</td></tr>`}</tbody>
      ${rows.length ? `<tfoot><tr><td colspan="5">Total (${S.budgetView})</td><td class="r">${thb(rows.reduce((s, q) => s + q.total, 0))}</td><td colspan="2"></td></tr></tfoot>` : ""}
    </table></div>`;
}
on("budgetView", (el) => { S.budgetView = el.dataset.k; renderBudget(); });
on("quoteRow", (el) => quoteDrawer(el.dataset.id));

function quoteDrawer(id) {
  const e = S.ev;
  const q = e.quotes.find((x) => x.id === id);
  if (!q) return;
  const nc = (v) => (v ? esc(v) : chip("needs"));
  const same = e.quotes.filter((x) => x.category === q.category && x.id !== q.id);
  const SCOPE = [["Staffing", /staff|bartender|technician|attendant|coordinator|musician|photographer/i], ["Delivery / setup", /setup|delivery|transport|teardown/i], ["Equipment", /equipment|sound|led|tables|chairs|booth|mic/i], ["Service charge / VAT", /service charge|vat/i]];
  const scopeOf = (x) => {
    const v = (S.matches && Object.values(S.matches.categories).flat().find((m) => m.vendorId === x.vendorId)?.vendor) || null;
    const inc = [x.includes, ...(v?.packages?.[0]?.includes || [])].join(" ");
    const exc = [x.excludes, ...(v?.packages?.[0]?.excludes || [])].join(" ");
    return SCOPE.map(([l, re]) => (re.test(exc) ? "Excluded" : re.test(inc) ? "Included" : "Not stated"));
  };
  drawer(`<div class="dh"><h2>${esc(q.vendorName)}</h2>${chip(q.status)}<button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="db">
      <dl class="kvlist">
        <dt>Item</dt><dd>${esc(q.item)}</dd>
        <dt>Quantity</dt><dd>${q.qty}</dd>
        <dt>Unit price</dt><dd>${q.unitPrice ? thb(q.unitPrice) : chip("needs")}</dd>
        <dt>Total</dt><dd><b>${thb(q.total)}</b></dd>
        <dt>Includes</dt><dd>${nc(q.includes)}</dd>
        <dt>Excludes</dt><dd>${nc(q.excludes)}</dd>
        <dt>Deposit & payment terms</dt><dd>${nc(q.terms)}</dd>
        <dt>Remaining balance</dt><dd>${q.status === "paid" ? thb(0) : `${thb(q.total)} <span class="muted small">(nothing paid yet)</span>`}</dd>
        <dt>Quote valid until</dt><dd>${q.validUntil ? fmtDate(q.validUntil) : chip("needs")}</dd>
        <dt>Notes</dt><dd>${esc(q.notes || "—")}</dd>
      </dl>
      ${(q.needsConfirmation || []).length ? `<div class="card flat"><b class="small">Needs confirmation</b><ul class="clean">${q.needsConfirmation.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
      ${same.length ? `<div class="compare"><h3 style="margin-bottom:8px">Scope vs other ${esc(CATEGORY_LABEL[q.category]).toLowerCase()} quotes</h3><table><thead><tr><th></th>${[q, ...same].map((x) => `<td><b>${esc(x.vendorName)}</b><br>${thb(x.total)}</td>`).join("")}</tr></thead>
        <tbody>${SCOPE.map(([l], i) => `<tr><th>${l}</th>${[q, ...same].map((x) => `<td>${scopeOf(x)[i]}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
    </div>
    <div class="df">
      ${q.status === "quoted" || q.status === "estimate" ? `<button class="btn sm" data-act="quoteStatus" data-id="${q.id}" data-s="committed">Approve quote</button>` : ""}
      ${q.status === "committed" ? `<button class="btn sm" data-act="quoteStatus" data-id="${q.id}" data-s="paid">Mark paid</button>` : ""}
      ${q.threadId ? `<button class="btn sm ghost" data-act="openThread" data-id="${q.threadId}">Open conversation</button>` : `<button class="btn sm ghost" data-act="askVendor" data-id="${q.vendorId}" data-q='${esc(JSON.stringify(q.needsConfirmation || []))}'>Ask vendor to confirm</button>`}
    </div>`);
}
on("quoteStatus", async (el) => {
  try {
    S.ev = await api(`/api/events/${S.ev.id}/quotes/${el.dataset.id}`, { method: "PATCH", body: { status: el.dataset.s } });
    closeDrawer();
    toast(el.dataset.s === "committed" ? "Quote approved. Now counted as committed." : "Marked as paid.");
    renderEventTab("budget");
  } catch (err) { fail(err); }
});

// ---------- shared planning helpers
let vendorIndex = null;
async function vendorsById() {
  vendorIndex ||= Object.fromEntries((await api("/api/vendors")).map((v) => [v.id, v]));
  return vendorIndex;
}
const vName = (id) => vendorIndex?.[id]?.shopName || id;
const today = () => new Date().toISOString().slice(0, 10);
const people = () => [...new Set([ME, ...(S.ev.team || [])])];
const telOf = (s) => (String(s || "").match(/\+?\d[\d-]{7,}\d/) || [])[0];
const contactHTML = (s) => { const t = telOf(s); return t ? `${esc(String(s).replace(t, "").replace(/·\s*$/, "").trim())} <a href="tel:${t.replace(/-/g, "")}">${esc(t)}</a>` : esc(s || "—"); };
function involvedVendors(e) {
  return [...new Set([...Object.values(e.selected || {}), ...Object.values(e.shortlist || {}).flat(), ...e.quotes.map((q) => q.vendorId), ...e.threads.map((t) => t.vendorId)])].filter(Boolean);
}
const fileById = (id) => S.ev.files.find((f) => f.id === id);
const taskById = (id) => S.ev.tasks.find((t) => t.id === id);
const apprChip = (a) => chip(a.status === "approved" ? "granted" : a.status);
const plan = (path, body, method = "POST") => api(`/api/events/${S.ev.id}${path}`, { method, body: { who: ME, ...body } });

// ---------- Timeline & event day
const TASK_STATUS = [["todo", "To do"], ["doing", "In progress"], ["blocked", "Blocked"], ["done", "Done"]];

async function renderTimeline() {
  await vendorsById();
  if (S.dayMode) return renderEventDay();
  const e = S.ev;
  S.tlView ||= "tasks";
  const urgent = e.runSheet.issues.filter((i) => !i.resolved && i.severity === "urgent");
  const views = [["tasks", "Tasks"], ["plan", "Planning timeline"], ["run", "Run sheet"]];
  const body = { tasks: tasksView, plan: planView, run: runSheetView }[S.tlView]();
  $main.innerHTML = `
    <div class="page-head"><div><h1>Timeline</h1><p>Tasks, the planning timeline and the event-day run sheet.</p></div>
      <div class="row">
        <div class="seg" role="tablist" aria-label="Timeline views">${views.map(([k, l]) => `<button class="${S.tlView === k ? "on" : ""}" data-act="tlView" data-k="${k}">${l}</button>`).join("")}</div>
        <button class="btn sm dark" data-act="dayMode" data-on="1">Event-day mode</button>
      </div></div>
    ${urgent.length ? issueBar(urgent) : ""}
    ${body}`;
}

function issueBar(list) {
  return `<div class="issue-bar" role="alert"><b>${list.length} urgent ${list.length > 1 ? "issues" : "issue"}</b>
    ${list.map((i) => `<div class="issue"><span>${esc(i.text)} <span class="muted">· ${esc(i.owner || "")} · ${ago(i.at)}</span></span><button class="btn xs" data-act="issueResolve" data-id="${i.id}">Resolve</button></div>`).join("")}</div>`;
}

function taskBlockers(t) {
  return (t.dependsOn || []).map(taskById).filter((d) => d && d.status !== "done");
}

function taskRow(t) {
  const late = t.status !== "done" && t.due && t.due < today();
  const blockers = taskBlockers(t);
  const f = t.fileId && fileById(t.fileId);
  const deps = (t.dependsOn || []).map(taskById).filter(Boolean);
  return `<div class="task ${t.status} ${late ? "late" : ""}">
    <select class="input pill sm" data-change="taskStatus" data-id="${t.id}" aria-label="Status of ${esc(t.title)}">${TASK_STATUS.map(([k, l]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${l}</option>`).join("")}</select>
    <div class="tt"><div class="ttl">${esc(t.title)}</div>
      <div class="sub">
        ${deps.length ? `<span>After: ${deps.map((d) => `${esc(d.title)}${d.status === "done" ? " ✓" : ""}`).join(", ")}</span>` : ""}
        ${t.vendorId ? `<button class="btn link xs" data-act="vendorDrawer" data-id="${t.vendorId}">${esc(vName(t.vendorId))}</button>` : ""}
        ${f ? `<a class="xsmall" href="#/event/${S.ev.id}/files" data-act="goFile" data-id="${f.id}">📄 ${esc(f.name)}</a>` : ""}
      </div>
      ${blockers.length && t.status !== "done" ? `<div>${chip("blocked", `Waiting on: ${blockers.map((b) => b.title).join(", ")}`)}</div>` : ""}
    </div>
    <div class="who"><span class="avatars"><span>${esc((t.owner || "?")[0])}</span></span> ${esc(t.owner || "Unassigned")}</div>
    <div class="due num">${t.due ? fmtDate(t.due) : "No deadline"} ${late ? chip("overdue") : ""}</div>
  </div>`;
}

function tasksView() {
  const e = S.ev;
  S.taskFilter ||= "open";
  const F = { open: (t) => t.status !== "done", mine: (t) => t.owner === ME && t.status !== "done", late: (t) => t.status !== "done" && t.due && t.due < today(), done: (t) => t.status === "done", all: () => true };
  const list = e.tasks.filter(F[S.taskFilter]).sort((a, b) => (a.due || "9").localeCompare(b.due || "9"));
  const n = (k) => e.tasks.filter(F[k]).length;
  const vendors = involvedVendors(e);
  return `
    <div class="row between" style="margin-bottom:12px">
      <div class="seg">${[["open", "Open"], ["mine", "Mine"], ["late", "Overdue"], ["done", "Done"], ["all", "All"]].map(([k, l]) => `<button class="${S.taskFilter === k ? "on" : ""}" data-act="taskFilter" data-k="${k}">${l} <span class="muted">${n(k)}</span></button>`).join("")}</div>
      <span class="small muted">${n("done")} of ${e.tasks.length} done</span>
    </div>
    <div class="task-list">${list.map(taskRow).join("") || `<div class="empty">No tasks here.</div>`}</div>
    <div class="card flat stack" style="margin-top:16px">
      <h3>Add a task</h3>
      <div class="task-form">
        <input id="nt-title" class="input" placeholder="e.g. Send floor plan to the caterer" aria-label="Task title">
        <select id="nt-owner" class="input" aria-label="Owner">${people().map((p) => `<option>${esc(p)}</option>`).join("")}</select>
        <input id="nt-due" class="input" type="date" aria-label="Deadline">
        <select id="nt-dep" class="input" aria-label="Depends on"><option value="">No dependency</option>${e.tasks.filter((t) => t.status !== "done").map((t) => `<option value="${t.id}">After: ${esc(t.title)}</option>`).join("")}</select>
        <select id="nt-vendor" class="input" aria-label="Linked vendor"><option value="">No vendor</option>${vendors.map((id) => `<option value="${id}">${esc(vName(id))}</option>`).join("")}</select>
        <select id="nt-file" class="input" aria-label="Linked document"><option value="">No document</option>${e.files.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select>
        <button class="btn" data-act="taskAdd">Add task</button>
      </div>
    </div>`;
}

function planView() {
  const e = S.ev;
  const items = [
    ...e.tasks.map((t) => ({ date: t.due, kind: "task", t })),
    ...e.quotes.filter((q) => q.validUntil).map((q) => ({ date: q.validUntil, kind: "ms", ttl: `Quote from ${q.vendorName} expires` })),
    ...e.approvals.filter((a) => a.dueBy && a.status === "pending").map((a) => ({ date: a.dueBy, kind: "ms", ttl: `Client decision due: ${a.title} ${a.version}` })),
    ...(e.date ? [{ date: e.date, kind: "event", ttl: "Event day" }] : []),
    { date: today(), kind: "today", ttl: "Today" },
  ].filter((i) => i.date).sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "today" ? -1 : 1));
  const months = {};
  for (const i of items) (months[i.date.slice(0, 7)] ||= []).push(i);
  const toGo = (d) => { if (!e.date) return ""; const n = Math.round((new Date(e.date) - new Date(d)) / 86400000); return n > 0 ? `${n} d before` : n === 0 ? "event day" : `${-n} d after`; };
  const row = (i) => {
    if (i.kind === "today") return `<div class="tl-item today"><span class="dot"></span><div class="date">${fmtDate(i.date)}</div><div><b>Today</b></div></div>`;
    if (i.kind !== "task") return `<div class="tl-item ${i.kind}"><span class="dot"></span><div class="date">${fmtDate(i.date, { weekday: true })}</div><div><b>${esc(i.ttl)}</b> <span class="xsmall muted">${toGo(i.date)}</span></div></div>`;
    const t = i.t;
    const late = t.status !== "done" && t.due < today();
    return `<div class="tl-item ${t.status} ${late ? "late" : ""}"><span class="dot"></span><div class="date">${fmtDate(t.due, { weekday: true })}</div>
      <div><span>${esc(t.title)}</span> <span class="xsmall muted">· ${esc(t.owner || "")} · ${toGo(t.due)}</span> ${late ? chip("overdue") : chip(t.status)}${taskBlockers(t).length && t.status !== "done" ? " " + chip("blocked", "Waiting on another task") : ""}</div></div>`;
  };
  return `<div class="card"><div class="tl">${Object.entries(months).map(([m, list]) => `<div class="tl-month"><h3>${new Date(m + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h3>${list.map(row).join("")}</div>`).join("") || '<div class="muted small">Add tasks with deadlines to see the plan.</div>'}</div></div>`;
}

const rsSorted = () => [...S.ev.runSheet.items].sort((a, b) => a.time.localeCompare(b.time));

function runSheetView() {
  const e = S.ev;
  const rs = e.runSheet;
  const issues = rs.issues;
  return `
    <div class="row between" style="margin-bottom:12px">
      <span class="small muted">Last updated <b>${fmtDateTime(rs.updatedAt)}</b>${rs.updatedBy ? ` by ${esc(rs.updatedBy)}` : ""}</span>
      <div class="row"><a class="btn sm ghost" href="/api/events/${e.id}/runsheet.csv" download>Download run sheet (CSV)</a><button class="btn sm" data-act="rsEdit" data-id="">Add line</button></div>
    </div>
    <div class="rs-list">
      <div class="rs rs-head" aria-hidden="true"><span>Time</span><span>Activity</span><span>Responsible</span><span>Supplier arrival</span><span>Contact</span><span></span></div>
      ${rsSorted().map((r) => `<div class="rs ${r.status}">
        <span class="time num">${esc(r.time)}</span>
        <span><b>${esc(r.activity)}</b>${r.vendorId ? `<br><span class="xsmall muted">${esc(vName(r.vendorId))}</span>` : ""}${r.notes ? `<div class="note"><b>If things go wrong:</b> ${esc(r.notes)}</div>` : ""}</span>
        <span><span class="lbl-sm">Responsible</span>${esc(r.responsible || "—")}</span>
        <span class="num"><span class="lbl-sm">Supplier arrival</span>${esc(r.arrival || "—")}</span>
        <span class="small"><span class="lbl-sm">Contact</span>${contactHTML(r.contact)}</span>
        <span class="row" style="justify-content:flex-end">${r.status !== "pending" ? chip(r.status) : ""}<button class="btn xs pearl" data-act="rsEdit" data-id="${r.id}">Edit</button></span>
      </div>`).join("") || '<div class="empty">No run sheet yet. Add the first line.</div>'}
    </div>
    <div class="card stack" style="margin-top:20px">
      <div class="card-head"><h3>Issues</h3><span class="count">${issues.filter((i) => !i.resolved).length} open</span></div>
      ${issueForm()}
      ${issues.map((i) => `<div class="item"><div class="grow"><div class="ttl" style="font-weight:400">${esc(i.text)}</div><div class="sub">${esc(i.owner || "")} · ${ago(i.at)}</div></div>
        ${i.resolved ? chip("resolved") : `${chip(i.severity)}<button class="btn xs ghost" data-act="issueResolve" data-id="${i.id}">Resolve</button>`}</div>`).join("") || '<div class="muted small">No issues logged.</div>'}
    </div>`;
}

function issueForm(big = false) {
  return `<div class="issue-form ${big ? "big" : ""}">
    <input id="is-text" class="input" placeholder="What's wrong? e.g. Band stuck in traffic, ETA 19:10" aria-label="Describe the issue">
    <select id="is-sev" class="input" aria-label="Severity"><option value="urgent">Urgent</option><option value="watch">Watch</option></select>
    <button class="btn ${big ? "lg" : ""}" data-act="issueAdd">Report issue</button></div>`;
}

function renderEventDay() {
  const e = S.ev;
  const rs = e.runSheet;
  const items = rsSorted();
  const now = items.find((r) => r.status === "live") || items.find((r) => r.status === "pending");
  const next = items.filter((r) => r.status === "pending" && r !== now).slice(0, 2);
  const urgent = rs.issues.filter((i) => !i.resolved && i.severity === "urgent");
  const watch = rs.issues.filter((i) => !i.resolved && i.severity === "watch");
  $main.innerHTML = `<div class="dayview">
    <div class="day-top">
      <div><div class="eyebrow">Event day</div><h1>${esc(e.name)}</h1><div class="small muted">${fmtDate(e.date, { weekday: true })} · Last updated <b>${fmtDateTime(rs.updatedAt)}</b>${rs.updatedBy ? ` by ${esc(rs.updatedBy)}` : ""}</div></div>
      <div class="row"><a class="btn ghost" href="/api/events/${e.id}/runsheet.csv" download>Download CSV</a><button class="btn dark" data-act="dayMode" data-on="">Exit event-day mode</button></div>
    </div>
    <div class="day-issues" role="alert" aria-live="polite">
      ${urgent.length ? urgent.map((i) => `<div class="day-issue"><span><b>Urgent:</b> ${esc(i.text)} <span class="muted">· ${esc(i.owner || "")} · ${ago(i.at)}</span></span><button class="btn" data-act="issueResolve" data-id="${i.id}">Resolved</button></div>`).join("") : `<div class="day-ok">No urgent issues</div>`}
    </div>
    ${watch.length ? `<div class="day-watch">${watch.map((i) => `<div class="day-issue watch"><span><b>Watch:</b> ${esc(i.text)}</span><button class="btn ghost" data-act="issueResolve" data-id="${i.id}">Resolved</button></div>`).join("")}</div>` : ""}
    ${now ? `<section class="day-now">
      <div class="eyebrow" style="color:#c7c7cc">${now.status === "live" ? "Now" : "Up first"}</div>
      <div class="day-time num">${esc(now.time)}</div>
      <h2>${esc(now.activity)}</h2>
      <dl class="day-kv"><dt>Responsible</dt><dd>${esc(now.responsible || "—")}</dd><dt>Supplier</dt><dd>${now.vendorId ? esc(vName(now.vendorId)) : "—"}${now.arrival ? ` · arrives ${esc(now.arrival)}` : ""}</dd><dt>Contact</dt><dd>${contactHTML(now.contact)}</dd></dl>
      ${now.notes ? `<div class="day-note"><b>If things go wrong:</b> ${esc(now.notes)}</div>` : ""}
      <div class="row">${now.status === "live" ? `<button class="btn lg" data-act="rsStatus" data-id="${now.id}" data-s="done" data-next="1">Done, start next</button>` : `<button class="btn lg" data-act="rsStatus" data-id="${now.id}" data-s="live">Start now</button>`}
        ${telOf(now.contact) ? `<a class="btn lg ghost on-dark" href="tel:${telOf(now.contact).replace(/-/g, "")}">Call</a>` : ""}</div>
    </section>` : `<div class="empty">Every line on the run sheet is done.</div>`}
    ${next.length ? `<div class="day-next">${next.map((r) => `<div class="card"><div class="eyebrow">Next</div><div class="day-time sm num">${esc(r.time)}</div><b>${esc(r.activity)}</b><div class="small muted">${esc(r.responsible || "")}${r.arrival ? ` · supplier arrives ${esc(r.arrival)}` : ""}</div></div>`).join("")}</div>` : ""}
    <div class="card stack"><h3>Report an issue</h3>${issueForm(true)}</div>
    <div class="day-list">${items.map((r) => `<div class="day-row ${r.status}">
      <span class="day-time sm num">${esc(r.time)}</span>
      <span class="grow"><b>${esc(r.activity)}</b><br><span class="small muted">${esc(r.responsible || "")}${r.vendorId ? ` · ${esc(vName(r.vendorId))}` : ""}</span></span>
      ${r.status === "done" ? chip("done") : r.status === "live" ? `<button class="btn" data-act="rsStatus" data-id="${r.id}" data-s="done">Done</button>` : `<button class="btn ghost" data-act="rsStatus" data-id="${r.id}" data-s="live">Start</button>`}
    </div>`).join("")}</div>
  </div>`;
}

on("tlView", (el) => { S.tlView = el.dataset.k; renderEventTab("timeline"); });
on("taskFilter", (el) => { S.taskFilter = el.dataset.k; renderEventTab("timeline"); });
on("dayMode", (el) => { S.dayMode = Boolean(el.dataset.on); renderEventTab("timeline"); });
on("taskStatus", async (el) => {
  try { S.ev = await plan(`/tasks/${el.dataset.id}`, { status: el.value }, "PATCH"); renderEventTab("timeline"); } catch (err) { fail(err); }
});
on("taskAdd", async (el) => {
  const v = (id) => document.getElementById(id).value;
  if (!v("nt-title").trim()) return toast("Give the task a title.", "err");
  busy(el, true, "Adding…");
  try {
    S.ev = await plan("/tasks", { title: v("nt-title"), owner: v("nt-owner"), due: v("nt-due") || null, dependsOn: v("nt-dep") ? [v("nt-dep")] : [], vendorId: v("nt-vendor") || null, fileId: v("nt-file") || null });
    toast("Task added.");
    renderEventTab("timeline");
  } catch (err) { fail(err); busy(el, false); }
});
on("goFile", (el) => { S.fileFocus = el.dataset.id; S.fileGroup = "all"; location.hash = `#/event/${S.ev.id}/files`; });
on("rsEdit", (el) => {
  const r = S.ev.runSheet.items.find((x) => x.id === el.dataset.id) || { time: "", activity: "", responsible: ME, vendorId: "", arrival: "", contact: "", notes: "" };
  const f = (k, label, type = "text", ph = "") => `<div class="field"><label for="rs-${k}">${label}</label><input id="rs-${k}" class="input" type="${type}" value="${esc(r[k] || "")}" placeholder="${esc(ph)}"></div>`;
  drawer(`<div class="dh"><h2>${r.id ? "Edit run sheet line" : "Add run sheet line"}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="db">
      <div class="grid g2">${f("time", "Time", "time")}${f("arrival", "Supplier arrival", "time")}</div>
      ${f("activity", "Activity", "text", "e.g. Doors open, welcome drinks")}
      <div class="grid g2">
        <div class="field"><label for="rs-responsible">Responsible</label><select id="rs-responsible" class="input">${people().map((p) => `<option ${p === r.responsible ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
        <div class="field"><label for="rs-vendorId">Supplier</label><select id="rs-vendorId" class="input"><option value="">None</option>${involvedVendors(S.ev).map((id) => `<option value="${id}" ${id === r.vendorId ? "selected" : ""}>${esc(vName(id))}</option>`).join("")}</select></div>
      </div>
      ${f("contact", "Contact", "text", "Name · phone")}
      <div class="field"><label for="rs-notes">Contingency notes</label><textarea id="rs-notes" class="input" placeholder="What happens if this goes wrong?">${esc(r.notes || "")}</textarea></div>
    </div>
    <div class="df"><button class="btn" data-act="rsSave" data-id="${r.id || ""}">Save</button><button class="btn ghost" data-close>Cancel</button></div>`);
});
on("rsSave", async (el) => {
  const body = Object.fromEntries(["time", "arrival", "activity", "responsible", "vendorId", "contact", "notes"].map((k) => [k, document.getElementById(`rs-${k}`).value.trim()]));
  if (!body.time || !body.activity) return toast("Add a time and an activity.", "err");
  body.vendorId ||= null;
  if (!el.dataset.id && body.vendorId && !body.contact) { const v = vendorIndex[body.vendorId]; body.contact = `${v.shopName} · ${v.contact?.phone || ""}`; }
  busy(el, true, "Saving…");
  try {
    S.ev = el.dataset.id ? await plan(`/runsheet/items/${el.dataset.id}`, body, "PATCH") : await plan("/runsheet/items", body);
    closeDrawer(); toast("Run sheet updated."); renderEventTab("timeline");
  } catch (err) { fail(err); busy(el, false); }
});
on("rsStatus", async (el) => {
  try {
    S.ev = await plan(`/runsheet/items/${el.dataset.id}`, { status: el.dataset.s }, "PATCH");
    if (el.dataset.next) {
      const nxt = rsSorted().find((r) => r.status === "pending");
      if (nxt) S.ev = await plan(`/runsheet/items/${nxt.id}`, { status: "live" }, "PATCH");
    }
    renderEventTab("timeline");
  } catch (err) { fail(err); }
});
on("issueAdd", async (el) => {
  const text = document.getElementById("is-text").value.trim();
  if (!text) return toast("Describe the issue first.", "err");
  busy(el, true, "Reporting…");
  try { S.ev = await plan("/runsheet/issues", { text, severity: document.getElementById("is-sev").value, owner: ME }); toast("Issue logged. It stays at the top until resolved."); renderEventTab("timeline"); }
  catch (err) { fail(err); busy(el, false); }
});
on("issueResolve", async (el) => {
  try { S.ev = await plan(`/runsheet/issues/${el.dataset.id}`, { resolved: true }, "PATCH"); toast("Issue resolved."); renderEventTab(location.hash.split("/")[3] || "timeline"); } catch (err) { fail(err); }
});

// ---------- Approvals & proposals
const APPR_TYPES = [["brief", "Brief approval"], ["vendor", "Vendor selection"], ["budget", "Budget approval"], ["change", "Changes"]];
const ACTION_LABEL = { sent: "Sent for approval", created: "Created", approved: "Approved", revision: "Asked for a revision", declined: "Declined" };

function fileLine(f) {
  return `<div class="file-mini"><span class="ext">${esc(extOf(f.name))}</span><span class="grow">${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)} <span class="xsmall muted">v${f.version}</span></span>${f.visibility?.client ? chip("shared", "Client can see") : chip("internal", "Internal only")}</div>`;
}

function approvalCard(a) {
  const e = S.ev;
  const ch = a.changeId && e.changes.find((c) => c.id === a.changeId);
  const files = (a.fileIds || []).map(fileById).filter(Boolean);
  const decided = a.status !== "pending";
  return `<article class="card appr ${a.status}" id="appr-${a.id}">
    <div class="appr-head">
      <div class="grow"><h3>${esc(a.title)}</h3><div class="small muted">${esc(a.summary || "")}</div></div>
      <span class="version-badge">${esc(a.version)}</span>${apprChip(a)}
    </div>
    <div class="row xsmall">${a.sharedWithClient ? chip("shared", "Shared with client") : chip("internal", "Not shared with client yet")}
      <button class="btn link xs" data-act="apprShare" data-id="${a.id}" data-on="${!a.sharedWithClient}">${a.sharedWithClient ? "Stop sharing" : "Share with client"}</button>
      ${a.dueBy ? `<span class="muted">Decision due ${fmtDate(a.dueBy)}</span>` : ""}
      <a class="btn link xs" href="/client.html?preview=1#/e/${e.id}/approvals" target="_blank" rel="noopener">Preview as client ↗</a></div>
    <div class="appr-grid">
      <div class="stack">
        <div><div class="eyebrow">Exactly what is approved</div>
          <dl class="kvlist appr-items">${(a.items || []).map((i) => `<dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd>`).join("")}</dl></div>
        ${ch ? `<div class="small">From the change request by <b>${esc(ch.requestedBy)}</b>. <a href="#/event/${e.id}/changes">See impact</a></div>` : ""}
        <div><div class="eyebrow">Supporting documents</div>${files.map(fileLine).join("") || '<div class="small muted">None attached.</div>'}</div>
      </div>
      <div class="stack">
        <details ${a.status === "pending" || a.status === "revision" ? "open" : ""}><summary>Comments <span class="muted">${(a.comments || []).length}</span></summary>
          <div class="comments">${(a.comments || []).map((c) => `<div class="cm ${c.side}"><div class="row xsmall"><b>${esc(c.who)}</b>${c.side === "internal" ? chip("internal", "Internal note") : chip("shared", "Client sees this")}<span class="muted">${ago(c.at)}</span></div><div class="small">${esc(c.text)}</div></div>`).join("") || '<div class="small muted">No comments yet.</div>'}</div>
          <div class="cm-form"><textarea class="input" id="ac-${a.id}" placeholder="Add a comment" aria-label="Comment on ${esc(a.title)}"></textarea>
            <div class="row"><select class="input pill" id="acs-${a.id}" style="height:34px;width:auto" aria-label="Who sees this comment"><option value="internal">Internal note</option><option value="client">Reply to client</option></select><button class="btn sm ghost" data-act="apprComment" data-id="${a.id}">Comment</button></div></div>
        </details>
        <details><summary>Decision history <span class="muted">${(a.history || []).length}</span></summary>
          <ol class="history">${(a.history || []).map((h) => `<li><b>${esc(ACTION_LABEL[h.action] || h.action)}</b> · ${esc(h.who)} <span class="muted">· ${fmtDateTime(h.at)}</span>${h.note ? `<div class="small">${esc(h.note)}</div>` : ""}</li>`).join("")}</ol>
        </details>
      </div>
    </div>
    <div class="appr-actions">
      ${decided ? `<span class="small muted">${a.status === "approved" ? "Approved." : a.status === "revision" ? "Revision requested. Update it and issue the next version." : "Declined."}</span>
        ${a.status !== "approved" ? `<button class="btn sm" data-act="apprVersion" data-id="${a.id}">Issue ${esc(`v${(Number(String(a.version).replace(/\D/g, "")) || 1) + 1}`)}</button>` : ""}`
      : `<input class="input" id="an-${a.id}" placeholder="Decision note (needed for a revision or decline)" aria-label="Decision note">
        <div class="row"><button class="btn sm" data-act="apprDecide" data-id="${a.id}" data-d="approve">Approve</button>
        <button class="btn sm ghost" data-act="apprDecide" data-id="${a.id}" data-d="revision">Request revision</button>
        <button class="btn sm danger" data-act="apprDecide" data-id="${a.id}" data-d="decline">Decline</button></div>`}
    </div>
  </article>`;
}

function renderApprovals() {
  const e = S.ev;
  const count = (s) => e.approvals.filter((a) => a.status === s).length;
  const cc = e.clientComments || [];
  $main.innerHTML = `
    <div class="page-head"><div><h1>Approvals & proposals</h1><p>What the client is asked to approve, version by version, with the documents and every decision.</p></div>
      <a class="btn ghost" href="/client.html?preview=1#/e/${e.id}" target="_blank" rel="noopener">Preview as client ↗</a></div>
    <div class="row" style="margin-bottom:18px">${chip("pending", `${count("pending")} awaiting decision`)}${chip("revision", `${count("revision")} revision requested`)}${chip("granted", `${count("approved")} approved`)}${count("declined") ? chip("declined", `${count("declined")} declined`) : ""}</div>
    ${cc.length ? `<div class="card stack" style="margin-bottom:22px"><div class="card-head"><h3>Client feedback on concepts and options</h3><span class="count">${cc.filter((c) => !c.fromOrganizer).length}</span></div>
      ${cc.map((c, i) => `<div class="cm ${c.fromOrganizer ? "" : "client"}"><div class="row xsmall"><b>${esc(c.who)}</b><span class="tag" style="font-size:12px;padding:2px 8px">${esc(c.target?.label || c.target?.kind)}</span><span class="muted">${ago(c.at)}</span>${c.fromOrganizer ? "" : `<button class="btn link xs" data-act="ccPick" data-i="${i}">Reply</button>`}</div><div class="small">${esc(c.text)}</div></div>`).join("")}
      <div class="row"><input class="input" id="cc-reply" style="flex:1;min-width:0" placeholder="Reply to the client (they see this)" aria-label="Reply to client"><button class="btn sm" data-act="ccReply">Reply</button></div></div>` : ""}
    ${APPR_TYPES.map(([k, label]) => {
      const list = e.approvals.filter((a) => a.type === k);
      return `<section class="appr-group"><h2>${label} <span class="count">${list.length}</span></h2>${list.map(approvalCard).join("") || `<div class="empty">Nothing waiting for ${label.toLowerCase()}.</div>`}</section>`;
    }).join("")}`;
}

on("apprDecide", async (el) => {
  const note = document.getElementById(`an-${el.dataset.id}`).value.trim();
  if (el.dataset.d !== "approve" && !note) return toast(el.dataset.d === "revision" ? "Say what needs to change." : "Add a short reason for declining.", "err");
  busy(el, true, "Saving…");
  try {
    S.ev = await plan(`/approvals/${el.dataset.id}/decision`, { decision: el.dataset.d, note });
    toast(el.dataset.d === "approve" ? "Approved." : el.dataset.d === "revision" ? "Revision requested." : "Declined.");
    renderEventTab("approvals");
  } catch (err) { fail(err); busy(el, false); }
});
on("apprComment", async (el) => {
  const text = document.getElementById(`ac-${el.dataset.id}`).value.trim();
  if (!text) return toast("Write a comment first.", "err");
  try { S.ev = await plan(`/approvals/${el.dataset.id}/comments`, { text, side: document.getElementById(`acs-${el.dataset.id}`).value }); renderEventTab("approvals"); } catch (err) { fail(err); }
});
on("apprVersion", async (el) => {
  try { S.ev = await plan(`/approvals/${el.dataset.id}/version`, {}); toast("New version sent for approval."); renderEventTab("approvals"); } catch (err) { fail(err); }
});
on("apprShare", async (el) => {
  try { S.ev = await plan(`/approvals/${el.dataset.id}`, { sharedWithClient: el.dataset.on === "true" }, "PATCH"); toast(el.dataset.on === "true" ? "Shared. The client sees it in their portal." : "No longer visible to the client."); renderEventTab(location.hash.split("/")[3] || "approvals"); } catch (err) { fail(err); }
});
on("ccPick", (el) => {
  S.ccTarget = Number(el.dataset.i);
  const c = S.ev.clientComments[S.ccTarget];
  const input = document.getElementById("cc-reply");
  input.placeholder = `Reply to ${c.who} about ${c.target?.label || "this"} (they see this)`;
  input.focus();
});
on("ccReply", async (el) => {
  const text = document.getElementById("cc-reply").value.trim();
  const to = S.ev.clientComments[S.ccTarget] || [...S.ev.clientComments].reverse().find((c) => !c.fromOrganizer);
  if (!text || !to) return toast("Write a reply first.", "err");
  try { S.ev = await plan("/client-comments", { text, target: to.target }); S.ccTarget = null; toast("Reply sent to the client portal."); renderEventTab("approvals"); } catch (err) { fail(err); }
});

// ---------- Changes
const FU_KIND = { client: "Client", supplier: "Supplier", internal: "Internal" };

async function renderChanges() {
  await vendorsById();
  const e = S.ev;
  const list = await api(`/api/events/${e.id}/changes`);
  const money = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${thb(Math.abs(n))}`;
  const card = (c) => {
    const im = c.impact;
    const open = c.status === "open";
    const fuState = (f) => f.state === "sent" ? chip("sent") : f.state === "approved" ? chip("approved") : f.state === "drafted" ? chip("drafted") : f.state === "waiting" ? chip("waiting") : f.state === "done" ? chip("done") : chip("todo");
    const fuAction = (f) => {
      if (open) return f.kind === "supplier" ? `<span class="xsmall muted">After the brief is approved</span>` : "";
      if (f.kind === "supplier") {
        if (f.state === "todo") return `<button class="btn xs" data-act="fuDraft" data-cid="${c.id}" data-fid="${f.id}">Draft message to ${esc(f.vendorName || "supplier")}</button>`;
        if (f.state !== "sent") return `<button class="btn xs ghost" data-act="openThread" data-id="${f.threadId}">Review in Inbox</button>`;
        return "";
      }
      if (f.kind === "client" && f.approvalId) return `<a class="btn xs ghost" href="#/event/${e.id}/approvals">Open approval</a>`;
      return `<label class="check xsmall"><input type="checkbox" data-change="fuDone" data-cid="${c.id}" data-fid="${f.id}" ${f.done ? "checked" : ""}> Done</label>`;
    };
    return `<article class="card change ${c.status}">
      <div class="appr-head"><div class="grow"><div class="small"><b>${esc(c.requestedBy)}</b> <span class="muted">via ${esc(c.channel)} · ${fmtDateTime(c.at)}</span></div></div>${chip(c.status)}</div>
      <blockquote class="orig">“${esc(c.message)}”</blockquote>
      <div class="cmp" role="table" aria-label="Current and proposed values">
        <div class="cmp-h" role="row"><span role="columnheader"></span><span role="columnheader">${c.status === "accepted" ? "Before" : "Current"}</span><span role="columnheader">${c.status === "accepted" ? "Now" : "Proposed"}</span></div>
        ${c.diffs.map((d) => `<div class="cmp-r" role="row"><span class="k" role="rowheader">${esc(d.label)}</span><span class="from" role="cell">${esc(d.from)}</span><span class="to" role="cell">${esc(d.to)}</span></div>`).join("")}
      </div>
      <div class="impact">
        <div><div class="eyebrow">Vendors affected</div>${im.vendors.map((v) => `<div class="small">${v.conflict ? "⚠️ " : ""}<button class="btn link xs" data-act="vendorDrawer" data-id="${v.vendorId}">${esc(v.name)}</button><div class="xsmall muted">${esc(v.reasons.join(" · "))}</div></div>`).join("") || '<div class="small muted">None</div>'}</div>
        <div><div class="eyebrow">Costs</div>${im.costs.map((x) => `<div class="small">${esc(x.vendor)}: <span class="num">${thb(x.from)} → <b>${thb(x.to)}</b></span><div class="xsmall muted">${esc(x.item)} · ${esc(x.status)}</div></div>`).join("") || '<div class="small muted">No cost change found</div>'}
          ${im.costs.length ? `<div class="small"><b class="num">${money(im.costDelta)}</b> total</div>` : ""}${im.costNote ? `<div class="xsmall muted">${esc(im.costNote)}</div>` : ""}</div>
        <div><div class="eyebrow">Tasks</div>${im.tasks.map((t) => `<div class="small">${esc(t.title)} <span class="xsmall muted">· ${esc(t.owner || "")} · ${fmtDate(t.due)}</span></div>`).join("") || '<div class="small muted">None</div>'}</div>
        <div><div class="eyebrow">Approvals</div>${im.approvals.map((a) => `<div class="small">${esc(a.title)} ${esc(a.version)} <span class="xsmall muted">· needs a new version</span></div>`).join("") || '<div class="small muted">None</div>'}</div>
      </div>
      ${c.conflicts.length ? `<div class="conflicts"><b>Conflicts</b><ul class="clean">${c.conflicts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      <div class="fu"><div class="row between"><h4>${open ? "Suggested follow-ups" : "Follow-ups"}</h4>${c.status === "accepted" ? (c.unfinished ? chip("pending", `${c.unfinished} still unfinished`) : chip("done", "All follow-ups done")) : ""}</div>
        ${c.followUps.map((f) => `<div class="fu-row ${f.finished ? "fin" : ""}"><span class="chip chip-outline">${FU_KIND[f.kind]}</span><span class="grow small">${esc(f.text)}</span>${open ? "" : fuState(f)}${fuAction(f)}</div>`).join("") || '<div class="small muted">None.</div>'}</div>
      ${open ? `<div class="decide-box">
        <div class="grow"><b>Decision on the brief</b><div class="xsmall muted">${c.patch ? `Approving creates brief v${(e.briefVersions?.length || 1) + 1} and updates internal estimates.` : "Accepting records the change on the plan."} It does not contact any supplier. You send those follow-ups yourself, one by one.</div></div>
        <div class="row"><button class="btn sm danger" data-act="changeDecline" data-id="${c.id}">Decline change</button><button class="btn sm" data-act="changeAccept" data-id="${c.id}">${c.patch ? "Approve revised brief" : "Accept change"}</button></div></div>`
      : `<div class="xsmall muted">${c.status === "accepted" ? `Accepted by ${esc(c.acceptedBy || "")} · ${fmtDateTime(c.acceptedAt)}` : `Declined by ${esc(c.declinedBy || "")} · ${fmtDateTime(c.declinedAt)}${c.declineNote ? ` · ${esc(c.declineNote)}` : ""}`}</div>`}
    </article>`;
  };
  const openList = list.filter((c) => c.status === "open");
  const rest = list.filter((c) => c.status !== "open");
  $main.innerHTML = `
    <div class="page-head"><div><h1>Changes</h1><p>Every change the client asks for, with what it touches, before anything goes to suppliers.</p></div>
      <button class="btn" data-act="changeNew">Log a change</button></div>
    ${openList.length ? `<section class="appr-group"><h2>Needs a decision <span class="count">${openList.length}</span></h2>${openList.map(card).join("")}</section>` : ""}
    ${rest.length ? `<section class="appr-group"><h2>Decided <span class="count">${rest.length}</span></h2>${rest.map(card).join("")}</section>` : ""}
    ${list.length ? "" : `<div class="empty">No change requests yet. When the client changes their mind, log it here to see the impact first.</div>`}`;
}

on("changeNew", () => {
  const b = S.ev.dna?.basics || {};
  const f = (k, label, type) => `<div class="field"><label for="cn-${k}">${label}</label><input id="cn-${k}" class="input" type="${type}" placeholder="Now: ${esc(b[k] ?? "not set")}"></div>`;
  drawer(`<div class="dh"><h2>Log a change</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="db">
      <div class="grid g2"><div class="field"><label for="cn-by">Requested by</label><input id="cn-by" class="input" value="${esc(S.ev.client)}"></div>
        <div class="field"><label for="cn-ch">Channel</label><select id="cn-ch" class="input">${["Email", "LINE", "Phone", "Meeting"].map((c) => `<option>${c}</option>`).join("")}</select></div></div>
      <div class="field"><label for="cn-msg">Original message</label><textarea id="cn-msg" class="input" placeholder="Paste exactly what the client said"></textarea></div>
      <div class="eyebrow">Proposed values <span style="text-transform:none;letter-spacing:0;font-weight:400">· leave empty if unchanged</span></div>
      <div class="grid g2">${f("guests", "Guests", "number")}${f("date", "Date", "date")}${f("budget", "Budget (THB)", "number")}${f("location", "Location", "text")}</div>
      <div class="eyebrow">Anything else</div>
      <div class="grid g3"><div class="field"><label for="cn-ol">What</label><input id="cn-ol" class="input" placeholder="Dinner start"></div><div class="field"><label for="cn-of">Current</label><input id="cn-of" class="input" placeholder="18:30"></div><div class="field"><label for="cn-ot">Proposed</label><input id="cn-ot" class="input" placeholder="19:00"></div></div>
    </div>
    <div class="df"><button class="btn" data-act="changeSave">See the impact</button><button class="btn ghost" data-close>Cancel</button></div>`);
});
on("changeSave", async (el) => {
  const v = (id) => document.getElementById(id).value.trim();
  busy(el, true, "Checking impact…");
  try {
    await plan("/changes", {
      requestedBy: v("cn-by"), channel: v("cn-ch"), message: v("cn-msg"),
      basics: { guests: v("cn-guests"), date: v("cn-date"), budget: v("cn-budget"), location: v("cn-location") },
      diffs: [{ label: v("cn-ol"), from: v("cn-of"), to: v("cn-ot") }],
    });
    closeDrawer();
    await loadEvent(S.ev.id);
    toast("Change logged. Check the impact before deciding.");
    renderEventTab("changes");
  } catch (err) { fail(err); busy(el, false); }
});
on("changeAccept", async (el) => {
  busy(el, true, "Approving…");
  try {
    await plan(`/changes/${el.dataset.id}/accept`, {});
    await loadEvent(S.ev.id); S.matches = null;
    toast("Revised brief approved. No supplier has been contacted: send the follow-ups when ready.");
    renderEventTab("changes");
  } catch (err) { fail(err); busy(el, false); }
});
on("changeDecline", async (el) => {
  try { await plan(`/changes/${el.dataset.id}/decline`, {}); await loadEvent(S.ev.id); toast("Change declined. The brief stays as it is."); renderEventTab("changes"); } catch (err) { fail(err); }
});
on("fuDone", async (el) => {
  try { await plan(`/changes/${el.dataset.cid}/followups/${el.dataset.fid}`, { done: el.checked }, "PATCH"); renderEventTab("changes"); } catch (err) { fail(err); }
});
on("fuDraft", async (el) => {
  busy(el, true, "Drafting…");
  try {
    await plan(`/changes/${el.dataset.cid}/followups/${el.dataset.fid}/draft`, {});
    await loadEvent(S.ev.id);
    toast("Draft ready in the Inbox. It isn't sent until you approve and press Send.");
    renderEventTab("changes");
  } catch (err) { fail(err); busy(el, false); }
});

// ---------- Files
const FILE_GROUPS = [["brief", "Briefs"], ["reference", "References"], ["quotation", "Quotations"], ["contract", "Contracts"], ["floorplan", "Floor plans"], ["invoice", "Invoices"], ["other", "Other"]];
const extOf = (n) => (String(n).split(".").pop() || "file").slice(0, 4).toUpperCase();
const kb = (n) => (n ? (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`) : "");

async function renderFiles() {
  await vendorsById();
  const e = S.ev;
  S.fileGroup ||= "all";
  const groups = FILE_GROUPS.filter(([k]) => S.fileGroup === "all" || S.fileGroup === k);
  const row = (f) => `<div class="file ${S.fileFocus === f.id ? "focus" : ""}" id="file-${f.id}">
    <span class="ext">${esc(extOf(f.name))}</span>
    <div class="grow">
      <div class="ttl">${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)} <span class="version-badge light">v${f.version}</span>${f.url ? "" : ` <span class="xsmall muted">· sample, no file attached</span>`}</div>
      <div class="sub">Uploaded by ${esc(f.uploader)} · ${ago(f.at)}${f.size ? ` · ${kb(f.size)}` : ""}${f.linked ? ` · Linked to <b>${esc(f.linked.label || f.linked.kind)}</b>` : ""}</div>
      <div class="row vis">${chip("internal")}${f.visibility?.client ? chip("shared") : ""}${(f.visibility?.vendors || []).map((id) => `<span class="chip chip-purple-soft"><i></i>${esc(vName(id))}</span>`).join("")}</div>
    </div>
    <div class="row f-acts"><button class="btn xs pearl" data-act="fileShare" data-id="${f.id}">Sharing</button>
      <label class="btn xs ghost" for="fv-${f.id}">New version</label><input id="fv-${f.id}" type="file" hidden data-change="fileVersion" data-id="${f.id}"></div>
  </div>`;
  $main.innerHTML = `
    <div class="page-head"><div><h1>Files</h1><p>Briefs, quotes, contracts and plans. Each file stays internal until you share it.</p></div>
      <div class="row"><select id="up-group" class="input pill" style="width:auto" aria-label="File type for upload">${FILE_GROUPS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>
        <label class="btn" for="file-up">Upload file</label><input id="file-up" type="file" hidden data-change="fileUpload"></div></div>
    <div class="seg" style="margin-bottom:18px"><button class="${S.fileGroup === "all" ? "on" : ""}" data-act="fileGroup" data-k="all">All <span class="muted">${e.files.length}</span></button>${FILE_GROUPS.map(([k, l]) => `<button class="${S.fileGroup === k ? "on" : ""}" data-act="fileGroup" data-k="${k}">${l} <span class="muted">${e.files.filter((f) => f.group === k).length}</span></button>`).join("")}</div>
    ${groups.map(([k, l]) => {
      const list = e.files.filter((f) => f.group === k);
      if (!list.length && S.fileGroup === "all") return "";
      return `<section class="file-group"><h2>${l}</h2><div class="card files">${list.map(row).join("") || '<div class="muted small">No files here yet.</div>'}</div></section>`;
    }).join("") || ""}
    ${e.files.length ? "" : '<div class="empty">No files yet. Upload the brief, quotes or a floor plan.</div>'}`;
  if (S.fileFocus) { document.getElementById(`file-${S.fileFocus}`)?.scrollIntoView({ block: "center" }); S.fileFocus = null; }
}

on("fileGroup", (el) => { S.fileGroup = el.dataset.k; renderEventTab("files"); });
on("fileUpload", async (el) => {
  const file = el.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file); fd.append("group", document.getElementById("up-group").value); fd.append("who", ME);
  try { S.ev = await api(`/api/events/${S.ev.id}/files`, { method: "POST", body: fd }); toast(`Uploaded <b>${esc(file.name)}</b>. Internal only until you share it.`); renderEventTab("files"); }
  catch (err) { fail(err); }
});
on("fileVersion", async (el) => {
  const file = el.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file); fd.append("fileId", el.dataset.id); fd.append("who", ME);
  try { S.ev = await api(`/api/events/${S.ev.id}/files`, { method: "POST", body: fd }); toast("New version uploaded. Sharing stays the same."); renderEventTab("files"); }
  catch (err) { fail(err); }
});
on("fileShare", (el) => {
  const f = fileById(el.dataset.id);
  const vis = f.visibility || {};
  const vendors = [...new Set([...involvedVendors(S.ev), ...(vis.vendors || [])])];
  drawer(`<div class="dh"><h2>Share “${esc(f.name)}”</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="db">
      <p class="small muted" style="margin:0">Pick exactly who can see this file. Vendors see it next to their enquiry; the client sees it in their portal.</p>
      <label class="check share-opt"><input type="checkbox" checked disabled> <span><b>Internal team</b><br><span class="xsmall muted">${esc(people().join(", "))} · always</span></span></label>
      <label class="check share-opt"><input type="checkbox" id="sh-client" ${vis.client ? "checked" : ""}> <span><b>Client</b><br><span class="xsmall muted">${esc(S.ev.client)} · client portal</span></span></label>
      <div class="eyebrow">Specific vendors</div>
      ${vendors.map((id) => `<label class="check share-opt"><input type="checkbox" class="sh-v" value="${id}" ${(vis.vendors || []).includes(id) ? "checked" : ""}> <span><b>${esc(vName(id))}</b><br><span class="xsmall muted">${esc(CATEGORY_LABEL[vendorIndex[id]?.category] || "")}</span></span></label>`).join("") || '<div class="small muted">No vendors on this event yet.</div>'}
    </div>
    <div class="df"><button class="btn" data-act="fileShareSave" data-id="${f.id}">Save sharing</button><button class="btn ghost" data-close>Cancel</button></div>`);
});
on("fileShareSave", async (el) => {
  const visibility = { client: document.getElementById("sh-client").checked, vendors: [...document.querySelectorAll(".sh-v:checked")].map((i) => i.value) };
  try { S.ev = await plan(`/files/${el.dataset.id}`, { visibility }, "PATCH"); closeDrawer(); toast("Sharing updated."); renderEventTab("files"); } catch (err) { fail(err); }
});

// ---------------------------------------------------------------- Concierge: client message → vendors → changes
const WEDDING_TEXT = "We want the wedding to feel elegant and romantic, but not in a way that feels too formal or traditional.\nWe like the idea of something intimate and personal, but we still want enough space for everyone to feel comfortable and for the celebration to have energy. We want it to feel special and memorable without looking like every other wedding. Nothing too over-the-top, nothing too simple, and definitely nothing that feels old-fashioned. We're thinking around 150 guests, and we want the whole day to feel beautiful, warm, modern, and very ‘us’.";
const FUSSY = [
  ["More guests", "Actually we invited more people, can we make it 170 guests?"],
  ["New date", "Can we move the wedding to 26 November instead?"],
  ["Quartet + candles", "We would love a string quartet for the ceremony, and much more candlelight."],
  ["ภาษาไทย: 200 คน", "ขอเพิ่มแขกเป็น 200 คนได้ไหมคะ"],
];
const KIND_LABEL = { enquiry: "Order enquiry", update: "Order update", clarify: "Clarification" };
const OUTCOME = {
  auto: ["ORCA updated it", "ORCA already knew enough, so it updated the order and sent the vendor an order update."],
  clarify: ["ORCA asked to clarify", "ORCA needs an answer before it can update these orders."],
  new: ["New vendor briefed", "The client asked for something nobody is booked for yet."],
  none: ["No change needed", "Not affected by this change, so ORCA didn't message them."],
};

function biMessage(m, vendorName) {
  const out = m.from !== "vendor";
  return `<div class="bi ${out ? "out" : "in"}">
    <div class="bi-meta">${out ? `${m.kind ? `<b>${esc(KIND_LABEL[m.kind] || m.kind)}</b> · ` : ""}ORCA → ${esc(vendorName)}` : `<b>Reply</b> · ${esc(vendorName)} → ORCA`} <span class="muted">· ${ago(m.at)}</span>${out ? chip("sent") : ""}</div>
    <div class="bi-pair"><div><div class="lang">ภาษาไทย${out ? " · what the vendor receives" : ""}</div><div class="bubble">${esc(m.text)}</div></div>
      ${m.textEn ? `<div><div class="lang">English translation</div><div class="bubble en">${esc(m.textEn)}</div></div>` : ""}</div>
  </div>`;
}

function orderStatus(o) {
  if (o.thread?.status === "awaiting") return chip("awaiting", "Waiting for vendor");
  if (o.status === "committed") return chip("paid", "Booked");
  return chip(o.status);
}

function conciergeNav(id, page) {
  subnav("ORCA Concierge", [
    { href: id ? `#/concierge/${id}` : "#/concierge", label: "1 · Client request", on: page !== "changes" },
    { href: id ? `#/concierge/${id}/changes` : "#/concierge", label: "2 · Client changes", on: page === "changes" },
  ], id ? `<a class="btn sm ghost" href="#/event/${id}/overview">Open the event</a>` : "");
}

async function renderConcierge(id, page) {
  conciergeNav(id, page);
  if (!id) return renderConciergeStart();
  S.cg = await api(`/api/concierge/${id}`);
  return page === "changes" ? renderConciergeChanges() : renderConciergeBrief();
}

async function renderConciergeStart() {
  const runs = await api("/api/concierge");
  $main.innerHTML = `
    <div class="page-head"><div><h1>What did the client say?</h1><p>Paste their message exactly as it came, however messy. ORCA organizes it and messages the right vendors straight away, in Thai, with an English translation for you.</p></div></div>
    <div class="grid g2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start">
      <div class="card stack">
        <div class="field"><label for="cg-client">Client</label><input id="cg-client" class="input" value="Mild & Ton"></div>
        <div class="field"><label for="cg-text">Client's message</label><textarea id="cg-text" class="input" style="min-height:190px" placeholder="“We want the wedding to feel elegant and romantic, but not too formal…”"></textarea></div>
        <details class="cg-details"><summary>Details the client didn't mention</summary>
          <p class="xsmall muted" style="margin:4px 0 10px">Used only when the message doesn't say. Vendors need a date to confirm availability.</p>
          <div class="grid g3"><div class="field"><label for="cg-date">Date</label><input id="cg-date" class="input" type="date" value="2026-12-12"></div>
            <div class="field"><label for="cg-loc">Location</label><input id="cg-loc" class="input" value="Bangkok"></div>
            <div class="field"><label for="cg-budget">Budget (THB)</label><input id="cg-budget" class="input" type="number" value="1500000"></div></div>
        </details>
        <div class="row"><button class="btn pearl sm" data-act="cgExample">Use the wedding example</button><span class="grow"></span><button class="btn lg" data-act="cgStart">Send to ORCA</button></div>
      </div>
      <div class="stack">
        <div class="card flat stack"><div class="eyebrow">What ORCA does</div>
          <ol class="cg-steps"><li><b>Reads</b> the client's words into Event DNA: guests, feel, what to avoid.</li><li><b>Matches</b> the best vendor in each category.</li><li><b>Messages</b> every vendor in Thai, with an English translation shown here.</li><li>When the client <b>changes their mind</b>, ORCA updates what it can and only asks when it must.</li></ol></div>
        ${runs.length ? `<div class="card stack"><h3>Earlier requests</h3>${runs.map((r) => `<a class="item" href="#/concierge/${r.id}"><div class="grow"><div class="ttl">${esc(r.name)}</div><div class="sub">${fmtDate(r.date)} · ${ago(r.createdAt)}</div></div><span class="small">Open</span></a>`).join("")}</div>` : ""}
      </div>
    </div>`;
}
on("cgExample", () => { document.getElementById("cg-text").value = WEDDING_TEXT; document.getElementById("cg-client").value = "Mild & Ton"; });
on("cgStart", async (el) => {
  const v = (id) => document.getElementById(id).value.trim();
  if (!v("cg-text")) return toast("Paste the client's message first.", "err");
  busy(el, true, S.status.mode === "claude" ? "Claude is reading…" : "ORCA is reading…");
  try {
    const out = await api("/api/concierge/start", { method: "POST", body: { client: v("cg-client"), text: v("cg-text"), date: v("cg-date"), location: v("cg-loc"), budget: v("cg-budget") } });
    if (out.aiError) toast(`Claude was unavailable (${esc(out.aiError)}). Used the offline engine.`, "err");
    else toast(`ORCA messaged <b>${out.orders.length} vendors</b>.`);
    location.hash = `#/concierge/${out.event.id}`;
  } catch (err) { fail(err); busy(el, false); }
});

function understood(ev) {
  const s = ev.style || {};
  return `<div class="tile-dark cg-orca">
    <div class="row">${LOGO}<b>ORCA</b><span class="muted small">Here's what I understood · brief v${ev.briefVersion}</span></div>
    <div class="dna-chips">${ev.chips.map((c, i) => `${i ? '<span class="dot"></span>' : ""}<span class="big">${esc(c)}</span>`).join("")}</div>
    <p style="margin:0">${esc(ev.summary || "")}</p>
    <dl class="kvlist cg-kv"><dt>Date</dt><dd>${fmtDate(ev.date, { weekday: true })}</dd><dt>Guests</dt><dd>${ev.guests ?? "—"}</dd><dt>Location</dt><dd>${esc(ev.location || "—")}</dd>
      <dt>Feel</dt><dd>${esc([...(s.mood || []), ...(s.feel || [])].join(", "))}</dd><dt>Avoid</dt><dd>${esc((s.avoid || []).join(", ") || "—")}</dd>
      <dt>Needs</dt><dd>${esc(ev.requirements.map((r) => r.text).join(" · "))}</dd></dl>
  </div>`;
}

function vendorThreads(orders) {
  return `<div class="cg-vendors">${orders.map((o) => `<article class="card cg-vendor">
    <div class="row between"><div><h3>${esc(o.shopName)}</h3><div class="xsmall muted">${esc(CATEGORY_LABEL[o.category] || o.category)} · ${esc(o.categoryTH || "")} · ${esc(o.item || "")}${o.qty > 1 ? ` × ${o.qty}` : ""} · <b>${thb(o.total)}</b></div></div>${orderStatus(o)}</div>
    ${(o.thread?.messages || []).map((m) => biMessage(m, o.shopName)).join("")}
  </article>`).join("")}</div>`;
}

function renderConciergeBrief() {
  const c = S.cg;
  const waiting = c.orders.filter((o) => o.thread?.status === "awaiting").length;
  $main.innerHTML = `
    <div class="cg-chat">
      <div class="cbub client"><div class="who">${esc(c.event.client)} · client</div><div class="bubble">${esc(c.texts[0] || "")}</div></div>
      ${understood(c.event)}
      <div class="cbub orca"><div class="who">ORCA</div><div class="bubble">I've messaged ${c.orders.length} vendors in Thai, one per service. ${waiting ? `Waiting for ${waiting} to reply.` : "Everyone has replied."}</div></div>
    </div>
    <div class="row between" style="margin:26px 0 14px"><h2 style="font-size:26px">Messages to vendors</h2>
      <div class="row">${waiting ? `<button class="btn ghost" data-act="cgReplies">Vendors reply (demo)</button>` : ""}<a class="btn" href="#/concierge/${c.event.id}/changes">Next: the client changes their mind →</a></div></div>
    ${vendorThreads(c.orders)}
    <div class="card row between" style="margin-top:18px"><span>Order total <span class="muted small">(${c.orders.filter((o) => o.status === "committed").length} of ${c.orders.length} booked)</span></span><b class="num" style="font-size:22px">${thb(c.total)}</b></div>`;
}
on("cgReplies", async (el) => {
  busy(el, true, "Vendors are replying…");
  try {
    const out = await api(`/api/concierge/${S.cg.event.id}/replies`, { method: "POST", body: {} });
    toast(`${out.replies} vendors replied. ORCA read their answers into the order.`);
    renderConcierge(S.cg.event.id, location.hash.endsWith("/changes") ? "changes" : "brief");
  } catch (err) { fail(err); busy(el, false); }
});

function changeResult(entry) {
  if (!entry) return "";
  if (!entry.lines.length) return `<div class="empty">ORCA didn't find anything that changes the plan in “${esc(entry.text)}”. Try saying what should change, e.g. a number, a date or an item.</div>`;
  const groups = ["auto", "clarify", "new", "none"].map((k) => [k, entry.outcomes.filter((o) => o.outcome === k)]).filter(([, l]) => l.length);
  return `<section class="stack" style="gap:16px">
    <div class="cmp"><div class="cmp-h"><span></span><span>Before</span><span>Now</span></div>${entry.lines.map((d) => `<div class="cmp-r"><span class="k">${esc(d.label)}</span><span class="from">${esc(d.from)}</span><span class="to">${esc(d.to)}</span></div>`).join("")}</div>
    ${entry.budgetOnly ? `<div class="small muted">The budget change stays internal. Vendors aren't told.</div>` : ""}
    ${groups.map(([k, list]) => `<div class="cg-group ${k}"><h3>${OUTCOME[k][0]} <span class="count">${list.length}</span></h3><p class="small muted" style="margin:2px 0 10px">${OUTCOME[k][1]}</p>
      ${k === "none" ? `<div class="row">${list.map((o) => `<span class="tag">${esc(o.shopName)}</span>`).join("")}</div>` : list.map((o) => `<article class="card cg-out ${o.conflict ? "conflict" : ""}">
        <div class="row between"><div><b>${esc(o.shopName)}</b> <span class="xsmall muted">· ${esc(CATEGORY_LABEL[o.category] || o.category)}</span></div>
          ${o.before.total !== o.after.total ? `<span class="num small">${thb(o.before.total)} → <b>${thb(o.after.total)}</b></span>` : ""}</div>
        ${o.conflict ? `<div class="conflicts"><b>Conflict:</b> ORCA's records show this vendor is booked on the new date.</div>` : ""}
        ${o.autos.length ? `<ul class="clean small cg-auto">${o.autos.map((a) => `<li>✓ ${esc(a)}</li>`).join("")}</ul>` : ""}
        ${o.asks.length ? `<ul class="clean small cg-ask">${o.asks.map((a) => `<li>? ${esc(a)}</li>`).join("")}</ul>` : ""}
        ${o.message ? biMessage({ from: "orca", kind: o.outcome === "auto" ? "update" : o.outcome === "new" ? "enquiry" : "clarify", text: o.message.th, textEn: o.message.en, at: entry.at }, o.shopName) : ""}
      </article>`).join("")}</div>`).join("")}
  </section>`;
}

function renderConciergeChanges() {
  const c = S.cg;
  const changes = c.log.filter((l) => l.kind === "change");
  const latest = changes[changes.length - 1];
  const waiting = c.orders.filter((o) => o.thread?.status === "awaiting").length;
  const booked = c.orders.filter((o) => o.status === "committed").length;
  $main.innerHTML = `
    <div class="page-head"><div><h1>The client changed their mind</h1><p>ORCA updates an order itself when it already has the information, and only messages a vendor when it needs to clarify. Every message is in Thai, with an English translation.</p></div></div>
    <div class="grid g2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start">
      <div class="stack" style="gap:20px">
        <div class="card stack">
          <div class="cg-chat">
            <div class="cbub client"><div class="who">${esc(c.event.client)} · first message</div><div class="bubble clamp">${esc(c.texts[0] || "")}</div></div>
            ${changes.map((l) => `<div class="cbub client"><div class="who">${esc(c.event.client)} · ${ago(l.at)}</div><div class="bubble">${esc(l.text)}</div></div>
              <div class="cbub orca"><div class="who">ORCA</div><div class="bubble">${l.lines.length ? `Done. ${["auto", "clarify", "new"].map((k) => { const nn = l.outcomes.filter((o) => o.outcome === k).length; return nn ? `${nn} ${k === "auto" ? "updated by me" : k === "clarify" ? "asked to clarify" : "new vendor briefed"}` : ""; }).filter(Boolean).join(", ") || "No vendor affected"}.` : "I couldn't find a change in that. Could you say what should be different?"}</div></div>`).join("")}
          </div>
          <div class="row cg-presets"><span class="xsmall muted">Fussy client examples:</span>${FUSSY.map(([l, t]) => `<button class="btn xs pearl" data-act="cgPreset" data-t="${esc(t)}">${esc(l)}</button>`).join("")}</div>
          <div class="row" style="align-items:flex-end"><textarea id="cg-change" class="input" style="flex:1;min-width:0;min-height:64px" placeholder="What does the client want to change? Thai or English."></textarea><button class="btn" data-act="cgChange">Send to ORCA</button></div>
        </div>
        ${latest ? `<div class="row between"><h2 style="font-size:21px">What ORCA did with “${esc(latest.text.length > 60 ? latest.text.slice(0, 60) + "…" : latest.text)}”</h2>${waiting ? `<button class="btn ghost" data-act="cgReplies">Vendors answer (demo)</button>` : ""}</div>${changeResult(latest)}`
          : `<div class="empty">Pick a fussy-client example above, or type your own. ${booked ? "" : "Tip: let the vendors reply on page 1 first, so ORCA has their confirmed orders to work from."}</div>`}
      </div>
      <aside class="card stack cg-order">
        <div class="card-head"><h3>Current order</h3>${chip("paid", `${booked}/${c.orders.length} booked`)}</div>
        <div class="small muted">${fmtDate(c.event.date, { weekday: true })} · ${c.event.guests ?? "—"} guests · ${esc(c.event.location || "")}</div>
        ${c.orders.map((o) => `<div class="item"><div class="grow"><div class="ttl">${esc(o.shopName)}</div><div class="sub">${esc(o.item || "")}${o.qty > 1 ? ` × ${o.qty}` : ""}${o.extras.map((x) => `<br>+ ${esc(x.item)} ${thb(x.amount)}`).join("")}</div><div style="margin-top:4px">${orderStatus(o)}</div></div><b class="num small">${thb(o.total)}</b></div>`).join("")}
        <div class="row between"><b>Total</b><b class="num" style="font-size:20px">${thb(c.total)}</b></div>
        ${c.event.budget ? `<div class="bar"><i class="${c.total > c.event.budget ? "over" : ""}" style="width:${Math.min(100, (c.total / c.event.budget) * 100)}%"></i></div><div class="xsmall muted">of ${thb(c.event.budget)} budget</div>` : ""}
        <a class="btn sm ghost" href="#/concierge/${c.event.id}">See all vendor messages</a>
      </aside>
    </div>`;
}
on("cgPreset", (el) => { const t = document.getElementById("cg-change"); t.value = el.dataset.t; t.focus(); });
on("cgChange", async (el) => {
  const text = document.getElementById("cg-change").value.trim();
  if (!text) return toast("Type what the client wants to change.", "err");
  busy(el, true, S.status.mode === "claude" ? "Claude is reading…" : "ORCA is working…");
  try {
    const out = await api(`/api/concierge/${S.cg.event.id}/change`, { method: "POST", body: { text } });
    const k = (x) => out.result.outcomes.filter((o) => o.outcome === x).length;
    const did = [k("auto") && `updated ${k("auto")} order${k("auto") > 1 ? "s" : ""} itself`, k("clarify") && `asked ${k("clarify")} vendor${k("clarify") > 1 ? "s" : ""} to clarify`, k("new") && `briefed ${k("new")} new vendor${k("new") > 1 ? "s" : ""}`].filter(Boolean);
    toast(!out.result.lines.length ? "ORCA didn't find a change in that message." : did.length ? `ORCA ${did.join(", ")}.` : "No vendor is affected by this change.");
    S.cg = out;
    renderConciergeChanges();
  } catch (err) { fail(err); busy(el, false); }
});

// ---------------------------------------------------------------- Vendors directory
async function renderVendors() {
  subnav("Vendor network", [], `<a class="btn sm ghost" href="/vendor.html" target="_blank" rel="noopener">How vendors join ↗</a>`);
  const vendors = await api("/api/vendors");
  S.vq ??= ""; S.vcat ??= "";
  const cats = [...new Set(vendors.map((v) => v.category))];
  const q = S.vq.toLowerCase();
  const list = vendors.filter((v) => (!S.vcat || v.category === S.vcat) && (!q || JSON.stringify([v.shopName, v.tags, v.dna, v.location, v.area]).toLowerCase().includes(q)));
  $main.innerHTML = `
    <div class="page-head"><div><h1>Vendor network</h1><p>${vendors.length} shops registered. ORCA reads each one's style DNA from their portfolio, palette, mood and price.</p></div>
      <input class="input pill" style="width:280px" placeholder="Search: garden, live band, Hua Hin…" value="${esc(S.vq)}" data-change="vq" aria-label="Search vendors"></div>
    <div class="seg" style="margin-bottom:20px"><button class="${!S.vcat ? "on" : ""}" data-act="vcat" data-k="">All</button>${cats.map((c) => `<button class="${S.vcat === c ? "on" : ""}" data-act="vcat" data-k="${c}">${esc(CATEGORY_LABEL[c] || c)}</button>`).join("")}</div>
    <div class="vgrid">${list.map((v) => `<article class="vcard">${portfolioTile(v)}<div class="body">
      <div class="row between"><h3>${esc(v.shopName)}</h3>${v.verified ? "" : chip("draft", "New")}</div>
      <div class="small muted">${esc(CATEGORY_LABEL[v.category])} · ${esc(v.area || v.location)}${v.rating ? ` · ★ ${v.rating}` : ""}</div>
      <div class="price">${v.priceFrom != null ? `From <b>${thb(v.priceFrom)}</b> <span class="muted">${esc(v.priceUnit)}</span>` : chip("needs", "Price needs confirmation")}</div>
      <div class="ev">${[...(v.dna?.look || []), ...(v.dna?.mood || [])].slice(0, 4).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
      <div class="xsmall muted">Last confirmed ${fmtDate(v.lastConfirmed)}</div></div>
      <div class="actions"><button class="btn sm pearl" data-act="vendorDrawer" data-id="${v.id}">View details</button></div></article>`).join("")}</div>`;
}
on("vq", (el) => { S.vq = el.value; renderVendors().catch(fail); });
on("vcat", (el) => { S.vcat = el.dataset.k; renderVendors().catch(fail); });

// ---------------------------------------------------------------- boot
(async () => {
  try { S.status = await api("/api/status"); } catch {}
  route();
})();
