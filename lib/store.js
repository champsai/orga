// Tiny JSON-file database. Good enough for a prototype; swap for Postgres later.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { buildSeed } from "./seed.js";
import { trustFor, fillPortfolio } from "./trust.js";

// On Vercel the app folder is read-only; only the temp folder can be written. The demo data lives
// there and is rebuilt from the seed when a fresh instance starts (it does not persist).
export const DATA_DIR = path.resolve(process.env.ORCA_DATA_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), "orca") : "data"));
const DB_FILE = path.join(DATA_DIR, "db.json");

let db = null;

function load() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    db.customers ??= [];
    // older data files: give demo shops their reviews, trust stats and three portfolio slots
    for (const v of db.vendors || []) if (!v.reviews && v.verified) Object.assign(v, { portfolio: fillPortfolio(v), ...trustFor(v) });
    // demo shops added to the seed later join existing data files; seed-only fields that matching
    // relies on (specialities, trims, partners) are filled in. Nothing else is touched.
    db.vendors ??= [];
    const byId = new Map(db.vendors.map((v) => [v.id, v]));
    for (const v of buildSeed().vendors) {
      const mine = byId.get(v.id);
      if (!mine) { db.vendors.push(v); continue; }
      for (const k of ["forTypes", "trims", "workedWith", "descriptionTh"]) if (v[k] && mine[k] == null) mine[k] = v[k];
    }
  } else {
    db = buildSeed();
    save();
  }
  return db;
}

export function save() {
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
