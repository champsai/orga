# ORCA — AI Concierge for Event Organizers

> "Your idea in, the right people out."

Prototype built for Biztania 26. ORCA is sold to **event organizers**. It turns a client's vague wishes into a precise **Event DNA**, matches vendors whose creative DNA fits, contacts them, and re-plans when the client changes their mind.

---

## 1. Overview

### The problem
Clients give briefs like "elegant but not too formal". Organizers spend hours turning that into specs, searching their own contact lists, chatting with vendors one by one on LINE, and redoing the work every time the client changes their mind.

### What the prototype does

| Step | Strategy | What happens in the app |
|---|---|---|
| 1 | **DECODE** | The organizer pastes the client's words (Thai or English). AI turns them into Event DNA: basics (guests, date, location, budget), Mood / Feel / Look / **Avoid**, and requirements per category. Every item is labelled *Provided by client*, *Interpreted by ORCA* or *Suggested*, with the client's exact quote as its source. |
| 2 | **Keep / remove / type again** | The organizer keeps (locks) what's right, removes what's wrong, and types a correction. ORCA re-decodes: kept items never change, removed items never come back. Each round is a new brief version. |
| 3 | **DNA MATCHING** | Every registered vendor has its own DNA (portfolio palette, mood, look, price, capacity). ORCA scores each vendor 0–5 against the Event DNA, explains *why it fits*, flags what the client wants to avoid, lists what still **needs confirmation**, and checks that the chosen set fits together as one story. |
| 4 | **DEEPEN: learn** | The organizer types the client's reaction ("Pretty, but too formal"). ORCA learns ("Reduces strict classic styles"), updates the DNA and re-ranks. It remembers this for every later search. |
| 5 | **ACT: ask vendors** | When vendor data isn't enough (availability, price for this guest count), ORCA drafts a polite Thai message. The organizer approves it, then sends it. Draft, Approved and Sent are always visibly different. |
| 6 | **Vendor portal** | Vendors open a shop like on Shopee or Lazada: services, packages, price unit, capacity, style DNA, palette and portfolio photos. They answer enquiries in one structured form (availability, itemized prices, inclusions, exclusions, validity, terms). |
| 7 | **Budget** | Replies flow into a spreadsheet-style budget (Forecast / Committed / Paid). Replies pasted from LINE are read by AI too. |
| 8 | **Plan and run** | Tasks with owners, deadlines and dependencies, a planning timeline, and a run sheet with an event-day mode that keeps urgent issues pinned at the top. |
| 9 | **Approve and change** | Every proposal (brief, vendor, budget, change) has a version, documents, comments and a decision history. A client change shows Current vs Proposed and everything it touches before anyone contacts a supplier. |
| 10 | **Client portal** | The client sees the summary, concepts, vendor options and proposals, comments on them, and approves a version or asks for a revision. Internal notes and budget internals never reach it. |

### Three interfaces

| Who | URL | Language | What it is |
|---|---|---|---|
| **Customer** | `/client.html` | Thai (EN toggle) | Public site: past work, sign-up, **chat with ORCA**, live orders. Clients of an organizer also open their event here to approve proposals. |
| **Vendor** | `/vendor.html` | Thai (EN toggle) | Shop registration, **Shopee-style orders** (accept / decline / answer ORCA), organizer enquiries, profile, calendar. |
| **Organizer / back office** | `/` | English | DNA decoding, matching, inbox, budget, timeline, approvals, changes, files, Concierge demo. Self-serve events show up here too. |

### How the self-serve flow works

1. The customer signs up (name + phone, LINE or email) and types what they want, however messy. The browser remembers the account. **+ New account** (chat page or top bar) signs out so someone else can start fresh; old accounts and chats stay on the server.
2. ORCA replies straight away with:
   - the customer's own message with the phrases it used **highlighted**;
   - the **Event DNA** chips (e.g. `150 PAX · Elegant · Romantic · Personal · Modern · Energetic`) and what to avoid;
   - a coloured **suggestion box per service** (Venue, Catering, Entertainment, Experience, Decor & design…).
     Each line can be tapped to show the words it came from; ✦ marks what ORCA read between the lines.
     ORCA's recommended vendor sits under each box.
   If the date or guest count is missing, ORCA asks in the chat. Orders can't be sent until it has both.
3. ORCA **suggests** the three best-matching vendors per service (its pick first) with match score, price, rating and why it fits. Nothing is booked yet: the customer opens each shop's **portfolio, reviews and trust stats** (verified documents, completion and on-time rate, repeat customers, cancellations, reply time), swaps any vendor, then presses **Confirm and send orders**.
4. Vendors accept or decline in their Orders tab. If one declines, ORCA suggests new options and the customer confirms again.
5. Once vendors accept, the customer pays a **30% deposit** (PromptPay QR, mobile banking or card; demo checkout, nothing is charged) and later the balance, due 7 days before the event. ORCA holds the money until the event is over (escrow); vendors see that it's paid.
6. When the customer changes something, ORCA updates the order itself where it already knows enough (per-guest price, capacity, availability on file) and sends an order update. It only asks the vendor when it must (over capacity, unknown date, a new item), and asks the customer directly when a decision is theirs (e.g. the venue is booked on the new date: find another vendor or wait?).
7. A *Simulate vendor replies (demo)* button in the chat answers everything waiting, for presenting without switching windows.

**Pitch demo script.** Sign up on the customer site, then send this brief as one message:

> เราอยากให้งานแต่งออกมาดูหรูหรา โรแมนติก แต่ไม่อยากให้เป็นทางการหรือดู traditional จนเกินไปค่ะ อยากได้ฟีลเรียบ ๆ แต่ดูแพง มีความโมเดิร์นและไฮแฟชั่น แต่ก็ยังอบอุ่นและเป็นกันเอง แขกน่าจะประมาณ 150 คน อยากให้บรรยากาศดู intimate แต่ไม่อึดอัด มีพื้นที่ให้ทุกคนได้พูดคุยและสนุกกับงาน อยากให้งานมีชีวิตชีวา ไม่ได้ดูนิ่งหรือเป็นพิธีการตลอดทั้งวัน โดยรวมอยากให้งานดูมีเอกลักษณ์และน่าจดจำ ไม่เหมือนงานแต่งทั่วไป ไม่ต้องจัดเต็มหรืออลังการเกินไป แต่ก็ไม่อยากให้เรียบจนดูไม่มีอะไร อยากให้ทุกอย่างดูลงตัว มีรสนิยม และสะท้อนความเป็นเราสองคนจริง ๆ ค่ะ

ORCA highlights the brief, shows the DNA and the six suggestion boxes with a vendor each, and asks for the date. Reply `12 ธันวาคม`, then press **Confirm and send orders**.

Then show a fussy customer (press *Simulate vendor replies* first so the orders are confirmed):

1. `เปลี่ยนเป็น 120 คน`: ORCA updates the per-guest orders itself and shows a change card: what changed, each shop's outcome, prices before → after, the total and the difference. The updated orders are highlighted in the side panel. (`ขอเพิ่มแขกเป็น 20 คน` when there are 150 makes ORCA ask whether that means 20 more or 20 in total.)
2. `อารมณ์พี่อยากได้ ช่างภาพถ่ายภาพ behind the scene เพิ่ม เอาทีเผลอ รูปดูแบบเก็บ atmosphere จริงๆ`: ORCA adds it to the brief, keeps Frame & Feeling as the main photographer and suggests a **second photographer** for that job (Hidden Lens BTS, plus two more). Confirm to send that order.

**Back and forth until they're happy.** ORCA follows taste changes straight away, and speaks up in plain chat text only when it matters:
- **Against their own words.** `ขอจัดเต็มอลังการไปเลย` after the brief said "ไม่ต้องจัดเต็มหรืออลังการเกินไป": ORCA quotes both and asks *change or keep?* before touching anything. A confirmed change sticks (later messages don't bring the old wording back).
- **Going back and forth.** When the guest count, date or place flips (`100 คน` → `กลับไป 150 คน`), ORCA offers once to **hold the vendor updates**. Changes keep being priced in the chat; `โอเค ส่งร้านได้` sends each vendor one combined update, or nothing if it all came back to where it started.
- **Undo.** `เอาแบบเมื่อกี้` restores the brief before the last change (also removes an extra photographer that isn't ordered yet).

**Photographers by style.** Seven photographers: candid/documentary (Frame & Feeling), editorial/corporate (Studio Lux), behind-the-scenes (Hidden Lens BTS), atmosphere and details (Moodreel), people/portraits (The Portrait Room), ceremony and family formals (Classic Moments) and a roaming photobooth (Flash & Friends). Asking for a photographer of a specific kind (`ช่างภาพ behind the scene`, `ตากล้องถ่ายคน`, `ถ่ายจริงจัง/ถ่ายพิธี`, `photobooth`) adds an extra slot next to the main photographer (`lib/slots.js`); the main order is left alone. New demo shops in the seed are added to existing data files on start, without a reset.

**Launch demo (LYRA, T-POP artist debut).** Sign up and send the artist manager's brief ("เรากำลังจะเปิดตัวศิลปิน T-POP ผู้หญิงคนใหม่ชื่อ LYRA ค่ะ …", 300 guests, ฿800,000, Bangkok). A launch brief gets a creative read (`lib/creative.js`) instead of the service boxes:
1. **DNA extraction**: six cards, each the client's own phrase → what ORCA reads into it (Visual identity, Brand balance, Experience, Hero moment, Fan engagement, Budget philosophy).
2. **Event DNA**: type, audience, budget ceiling, location, core aesthetic, experience DNA, non-negotiables.
3. **AI suggestions**: concept (Enter the LYRA Universe), black-box venue, the LYRA Portal, the reveal, each with its reason. Directions, not decisions.
4. **DNA matching**: a partner set that has worked together (Studio V, Neon Works, Form Lab, Noir Table, Pulse Movement, Frame Rate), with why each fits.
5. **Budget split** that puts the stage and the show first (฿760,000 booked + ฿40,000 contingency).

Then (optionally give a date and confirm the orders first) send the client update: "ทีมเพิ่งแจ้งมาว่า… อาจขึ้นไปถึง 450 คน แต่เรายังอยากคุมงบไม่ให้เกิน 800,000 บาท…". With a budget to hold, ORCA **plans before changing anything** (`lib/replan.js`): the impact per partner (venue capacity, per-guest food, sound, the photo portal queue, check-in), plan A (standing layout + trims the partners offered, hero moment untouched, still ฿40,500 contingency) vs plan B (Warehouse 32, ฿29,500 over), the new budget table, and draft messages to each vendor. Nothing is sent until the customer presses **อนุมัติแผน A** (or picks B); then booked vendors get the update or a question, and unbooked ones carry it in their order. ORCA says plainly it can't promise 450 people on the same budget until the vendors confirm.

### Screens

**Concierge demo** (`http://localhost:3000/#/concierge`): the two-page pitch flow
- **1 · Client request**: paste the client's message exactly as it came ("We want the wedding to feel elegant and romantic, but not…"). ORCA decodes it, picks the best vendor per service and messages each one straight away, in Thai, with the English translation shown beside it. *Vendors reply (demo)* fills in their answers and books the order.
- **2 · Client changes**: the fussy client changes their mind (more guests, a new date, a string quartet, or in Thai "ขอเพิ่มแขกเป็น 200 คน"). For each booked vendor ORCA decides: **updated it itself** when it already knows enough (per-guest price, capacity, availability on file) and sends an order update; **asks to clarify** only when it must (over capacity, unknown or clashing date, a new item); **no message** when the vendor isn't affected; **briefs a new vendor** for a service nobody covers yet. Every message is Thai + English.

**Organizer app** (`http://localhost:3000`)
- **Events**: card and table views; filters Upcoming, Assigned to me, Needs attention, Completed
- **Create event**: Describe → Clarify ("Not decided yet" allowed) → Review
- **Event overview**: Needs your decision · Waiting on others · Upcoming deadlines · Recent activity
- **Brief & DNA**: basics, requirements (must-have vs preference), style, reference gallery (Like / Avoid / comment), open questions, **Preview impact** before applying edits, version history
- **Match vendors**: category tabs, filters, DNA-scored cards, side-by-side compare, **Event package** view, client-reaction learning
- **Inbox**: conversation list · conversation · event context; approval-gated drafts; paste a LINE reply
- **Budget**: Forecast / Committed / Paid, quote drawer, scope comparison
- **Timeline**: Tasks (owner, deadline, status, dependencies, linked vendor or document) · Planning timeline · Run sheet (time, activity, responsible, supplier arrival, contact, contingency notes) with a "Last updated" stamp, CSV download and an **Event-day mode** (big controls, Now / Next, urgent issues always visible)
- **Approvals**: grouped into brief, vendor selection, budget and changes; exactly what is approved, version, supporting documents, internal vs client comments, decision history, Approve / Request revision / Decline, issue the next version, share with the client, **Preview as client**
- **Changes**: who asked and their original words, Current vs Proposed side by side, affected vendors, costs, tasks and approvals, conflicts and follow-ups. **Approve revised brief** only updates the brief (new version) and internal estimates; contacting each supplier is a separate, approval-gated draft. Unfinished follow-ups stay listed after acceptance.
- **Files**: briefs, references, quotations, contracts, floor plans, invoices, other; version, uploader, linked item, and explicit sharing to the internal team, the client and specific vendors (vendors see shared files next to their enquiry)
- **Vendor network**: every registered shop, with a details drawer (Overview, Portfolio, Packages, Availability, History)

**Vendor portal** (`http://localhost:3000/vendor.html`)
- Landing page, 4-step shop registration, enquiries with a reply form and "what happens next" status, files the organizer shared, shop profile editor, portfolio upload, availability calendar, performance

**Client portal** (`http://localhost:3000/client.html`)
- **Shop pages** (`#/shop/<id>`) and a **shop directory** (`#/shops`): photo gallery, stars with a 5→1 breakdown, shop credit, packages, reviews, events the shop did with ORCA, similar shops; choose the shop for your event right from its page.
- **Landing page**: a photo carousel of past events, the ORCA profile (weddings, conferences, brand launches, corporate, parties) and **ORCA's past work**: 8 strange or vague briefs ("Make it feel like the ocean. But indoors. And dry.", "อยากจัดวันเกิดให้น้องแมว…") next to what they became, filterable by event type. Each story opens with what the client said, what ORCA heard, what ORCA did, close-ups, numbers, the vendor team and a client quote. Share one story with `#/work/<id>`. The pictures are illustrations drawn by `scripts/make-showcase.js`; the stories are fictional.
- Landing page with the event summary and decisions waiting, concepts and vendor options to comment on, proposals with Approve / Request revision beside each one, shared files. Add `?preview=1` to see it as the client without being able to act.

### Demo data
- **Mild & Ton Wedding**: completed event, the deck's example (150 PAX, Elegant · Romantic) with its learning history, finished run sheet, approvals and files
- **Nimbus Tech Summit 2026**: in progress, with a quote from Pulse AV, an unanswered question to Warehouse 32, 11 tasks, a full run sheet with open issues, proposals waiting for the client, an open change (400 → 450 guests) and an accepted one with unfinished follow-ups
- **Ploy's 30th Garden Dinner**: still at the briefing stage, with open questions
- **24 vendors** across venue, catering, entertainment, decor, photography, experience, AV and transport

All names are fictional.

### Run it

```bash
npm install
npm start
```

- Organizer app: http://localhost:3000
- Vendor portal: http://localhost:3000/vendor.html
- Client portal: http://localhost:3000/client.html
- Restore the demo data: `npm run reset`
- Keep a separate copy of the data (e.g. a test server next to the demo): set `ORCA_DATA_DIR` to another folder

**AI engine.** Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` to decode, explain matches, learn from reactions, draft vendor messages and read replies with **Claude** (`claude-opus-5-5`). Without a key, or if a call fails, ORCA uses its built-in **offline engine** (keyword rules in English and Thai), so the demo never stops. The pill at the top right shows which engine is active.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Node.js 24** (ES modules) | One language front to back; `--env-file` loads `.env` with no extra package |
| Web server | **Express 4** | Small JSON API plus static files |
| AI | **Claude API** via `@anthropic-ai/sdk` (`claude-opus-5-5`) | Structured outputs (`messages.parse` + Zod schemas) return Event DNA as typed JSON; server-side refusal fallback enabled |
| Schemas | **Zod 4** | One schema validates Claude's output and documents the DNA shape |
| Offline AI | Rule engine (`lib/offline-ai.js`) | Thai and English lexicon, negation handling ("ไม่เอา…", "not too formal"), date / budget / guest parsing |
| Matching | Deterministic scorer (`lib/matching.js`) | Transparent 0–5 score: style overlap with synonyms, avoid penalties, learned weights, capacity, location, setting, date and budget share. Claude only writes the explanations. |
| Storage | JSON file (`data/db.json`) | Zero setup for a prototype; replace with Postgres or Supabase later |
| Uploads | **Multer** → `data/uploads/` | Vendor portfolio photos and planning files (PDF, images, Office, text) |
| Front end | Vanilla JS modules, no build step | Hash router, one delegated event handler; open `index.html` and it runs |
| Design | `apple-DESIGN.md` | White and parchment canvases, one Action Blue, pill CTAs, 18px cards, dark tiles for the AI moments, system SF / Inter + Noto Sans Thai |

### API (main routes)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/decode` | Client messages (+ previous DNA, locks, rejects) → Event DNA |
| POST | `/api/events` | Create an event from a reviewed brief |
| POST | `/api/events/:id/refine` | New client message → next brief version |
| PUT | `/api/events/:id/dna` | Save organizer edits as a new version |
| POST | `/api/events/:id/preview-impact` | What a brief change does to top picks, chosen vendors and costs |
| GET | `/api/events/:id/matches` | Ranked vendors per category with explanations and set note |
| POST | `/api/events/:id/feedback` | Client reaction → learned weights → re-rank |
| POST | `/api/events/:id/ask` | AI drafts a vendor question (waits for approval) |
| PATCH | `/api/threads/:id/messages/:mid` | Edit / approve / send / discard a draft |
| POST | `/api/threads/:id/reply` | Vendor reply (portal form or pasted LINE text) → availability + quote |
| GET/POST/PATCH | `/api/vendors` | Vendor registration and profile |
| GET | `/api/vendor-portal/:vendorId/enquiries` | Vendor-safe view of enquiries (no budget or internal notes), plus files shared with that vendor |
| POST/PATCH | `/api/events/:id/tasks` | Tasks with owner, deadline, status, dependencies, linked vendor / file |
| POST/PATCH | `/api/events/:id/runsheet/items`, `/runsheet/issues` | Run sheet lines and event-day issues (stamps "last updated") |
| GET | `/api/events/:id/runsheet.csv` | Run sheet download (UTF-8, opens in Excel) |
| POST | `/api/events/:id/approvals/:aid/decision` · `/comments` · `/version` | Approve / revision / decline, internal or client comments, next version |
| GET/POST | `/api/events/:id/changes` | Change requests with computed impact (same logic as preview-impact) |
| POST | `/api/events/:id/changes/:cid/accept` · `/decline` | Approve the revised brief (contacts no supplier) or decline |
| POST | `/api/events/:id/changes/:cid/followups/:fid/draft` | Draft one supplier follow-up; it waits for approval in the Inbox |
| POST/PATCH | `/api/events/:id/files` | Upload (multer) or new version; sharing to client / vendors |
| POST | `/api/concierge/start` | Client message → Event DNA → event → best vendor per category messaged (Thai + English) |
| POST | `/api/concierge/:id/change` | Client change → per vendor: update the order itself, ask to clarify, or leave alone |
| POST | `/api/concierge/:id/replies` | Demo: vendors answer enquiries and clarifications |
| POST | `/api/customers` | Customer sign-up (demo, no password) |
| GET/POST | `/api/customers/:cid` · `/messages` | Customer chat: decode → ask for missing info → book orders → absorb changes |
| POST | `/api/customers/:cid/choose` · `/confirm` | Swap a suggested vendor; confirm and send the orders |
| POST | `/api/customers/:cid/pay` | Demo checkout: deposit or balance, held by ORCA |
| GET | `/api/vendors/:id/public` | What a customer may see about a shop: portfolio, packages, reviews, trust, star breakdown, similar shops, ORCA events it worked on (no contacts) |
| GET | `/api/shops` | Public shop directory (stars, reviews, starting price, cover photo) |
| POST | `/api/customers/:cid/simulate` | Demo: every vendor with an order or question waiting answers |
| GET/POST | `/api/vendor-portal/:vendorId/orders` · `/orders/:eventId` | Vendor orders: accept, decline (auto-replace), answer ORCA's question (+ extra cost) |
| GET | `/api/showcase` | ORCA's past work for the client portal (public, fictional) |
| GET | `/api/client-portal/:eventId` | Client-safe view, built field by field: no internal notes, budget internals, quotes, tasks or supplier conversations |
| POST | `/api/client-portal/:eventId/comments` · `/approvals/:aid/decision` | Client comments and Approve / Request revision |

---

## 3. Tech tree

```
orcabiz/
├── server.js                 Express app: events, decode, matching, feedback, threads, vendors,
│                             tasks, run sheet, approvals, changes, files, client portal API
├── package.json              npm start / npm run reset
├── .env.example              ANTHROPIC_API_KEY (optional), ORCA_MODEL, PORT
├── apple-DESIGN.md           Design reference the UI follows
├── lib/
│   ├── ai.js                 Claude calls with Zod schemas, falls back to the offline engine
│   ├── offline-ai.js         Rule-based decode / learn / draft / parse (Thai + English)
│   ├── matching.js           DNA scoring, budget shares, ranking, template explanations
│   ├── planning.js           Change impact, follow-up state, run-sheet CSV, client-safe view
│   ├── showcase.js           ORCA's past work: briefs, what ORCA heard and did, results
│   ├── selfserve.js          Customer chat, suggestions → confirm → orders, payments, vendor actions
│   ├── slots.js              Extra slots in one service (a second photographer for BTS, portraits, ceremony, photobooth)
│   ├── creative.js           Creative read of launch briefs: themes, Event DNA, concept ideas, partner roles, budget split
│   ├── replan.js             More guests on a fixed budget: impact, options A/B, trims, new budget (applied after approval)
│   ├── th.js                 Thai wording for the customer site (style words, suggestions, packages, match reasons)
│   ├── trust.js              Demo reviews and trust stats per shop
│   ├── concierge.js          Concierge demo: brief vendors, auto-update vs clarify, Thai + English messages
│   ├── store.js              JSON file database, ids, activity log
│   └── seed.js               Demo vendors, events, conversations, tasks, run sheets,
│                             approvals, changes, files and concepts
├── public/
│   ├── index.html            Organizer app shell
│   ├── app.js                Events, Create (Describe → Clarify → Review), Overview,
│   │                         Brief & DNA, Match, Package, Inbox, Budget, Timeline + event day,
│   │                         Approvals, Changes, Files, Concierge demo, Vendor network
│   ├── vendor.html           Vendor portal shell
│   ├── vendor.js             Landing, shop registration, enquiries + reply form,
│   │                         profile, portfolio, calendar, performance, shared files
│   ├── client.html           Client portal shell
│   ├── client.js             Landing (carousel, profile, past work), summary + decisions,
│   │                         concepts & vendor options, proposals, files, ORCA's work
│   ├── vendors/              Drop <vendorId>-1.jpg (-2, -3) to give a shop real photos (prompts in vendors/PROMPTS.md)
│   ├── showcase/             Illustrations of past events (generated SVG); drop <id>.jpg here to
│   │                         replace one with a photo (prompts in showcase/PROMPTS.md)
│   ├── common.js             API helper, state chips, formatting, logo, drawer, toast
│   └── styles.css            Design tokens and components
├── scripts/
│   ├── reset.js              Restore demo data
│   ├── vendor-prompts.js     Writes public/vendors/PROMPTS.md
│   └── make-showcase.js      Draws public/showcase/*.svg (node scripts/make-showcase.js)
└── data/                     (created at runtime, git-ignored)
    ├── db.json
    └── uploads/
```

### How the pieces connect

```
Client words ──► DECODE (Claude / offline) ──► Event DNA ──► keep / remove / type again ──► brief vN
                                                   │
Vendor portal ──► Vendor DNA ──────────────► DNA MATCHING (score + why + needs confirmation)
                                                   │
                     client reaction ──► LEARN ──► re-rank
                                                   │
               missing info ──► AI draft ──► organizer approves ──► vendor replies ──► budget
                                                   │
client change ──► impact (vendors · costs · tasks · approvals) ──► approve revised brief ──► follow-ups
                                                   │
proposals + shared files ──► client portal ──► approve / revision ──► next version
```

### Not built yet
Real accounts and passwords for customers and vendors (the demo has none), a real payment gateway (checkout is simulated; the plan is Omise / 2C2P with escrow), notifications outside the app (LINE Official Account / SMS / email), notifying the client when a proposal is shared, previews for the seeded sample files (they have no file attached), and a real database.
