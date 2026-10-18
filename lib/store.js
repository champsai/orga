// Tiny JSON-file database. Good enough for a prototype; swap for Postgres later.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { buildSeed } from "./seed.js";
import { trustFor, fillPortfolio } from "./trust.js";
import { remoteOn, remoteVersion, remoteLoad, remoteSave } from "./remote.js";

// On Vercel the app folder is read-only; only the temp folder can be written. Without a shared
// store (lib/remote.js) the demo data lives there, per instance, and does not persist.
export const DATA_DIR = path.resolve(process.env.ORCA_DATA_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), "orca") : "data"));
const DB_FILE = path.join(DATA_DIR, "db.json");

let db = null;

// Older data (a file or the shared store) catches up with the current seed.
function upgrade(d) {
  d.customers ??= [];
  // give demo shops their reviews, trust stats and three portfolio slots
  for (const v of d.vendors || []) if (!v.reviews && v.verified) Object.assign(v, { portfolio: fillPortfolio(v), ...trustFor(v) });
  // demo shops added to the seed later join existing data; seed-only fields that matching
  // relies on (specialities, trims, partners) are filled in. Nothing else is touched.
  d.vendors ??= [];
  const byId = new Map(d.vendors.map((v) => [v.id, v]));
  for (const v of buildSeed().vendors) {
    const mine = byId.get(v.id);
    if (!mine) { d.vendors.push(v); continue; }
    for (const k of ["forTypes", "trims", "workedWith", "descriptionTh"]) if (v[k] && mine[k] == null) mine[k] = v[k];
  }
  return d;
}

function load() {
  if (db) return db;
  if (remoteOn) return (db = buildSeed()); // only until syncStore() has run for the request
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = upgrade(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
  } else {
    db = buildSeed();
    save();
  }
  return db;
}

// Shared store (deployments): before a request, pick up what other instances saved; before the
// response goes out, make sure our own save has landed. Locally (no Redis env vars) both do nothing.
let version = -1;
let pending = Promise.resolve();
export async function syncStore() {
  if (!remoteOn) return;
  await pending;
  if (db && version >= 0 && (await remoteVersion()) === version) return; // one tiny read per request
  const r = await remoteLoad();
  if (r.db) { db = upgrade(r.db); version = r.version; }
  else { db = buildSeed(); version = await remoteSave(db); }
}
export const flushStore = () => pending;

export function save() {
  if (remoteOn) {
    const snapshot = db;
    pending = pending.then(() => remoteSave(snapshot)).then((v) => { version = v; }).catch((err) => console.error("save failed:", err.message));
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export function reset() {
  db = buildSeed();
  save();
  return db;
}

export const newId = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`;
export const now = () => new Date().toISOString();

export const store = {
  get data() {
    return load();
  },
  vendors: () => load().vendors,
  vendor: (id) => load().vendors.find((v) => v.id === id),
  events: () => load().events,
  event: (id) => load().events.find((e) => e.id === id),
  threads: () => load().threads,
  thread: (id) => load().threads.find((t) => t.id === id),
};

export function logActivity(event, text, who = "ORCA") {
  event.activity ??= [];
  event.activity.unshift({ at: now(), who, text });
  event.activity = event.activity.slice(0, 60);
}
