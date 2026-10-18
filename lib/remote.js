// Shared storage for deployments (Vercel): the whole demo database as one gzipped value in
// Upstash Redis, over its REST API (no extra package). Every server instance reads the same data,
// so a customer signed up on one instance is found by the next request on another.
// Turned on by the env vars Vercel adds when an Upstash Redis store is connected to the project.
import zlib from "node:zlib";

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = process.env.ORCA_KV_KEY || "orca";
export const remoteOn = Boolean(URL && TOKEN);

async function call(body, pipeline = false) {
  const res = await fetch(`${URL}${pipeline ? "/pipeline" : ""}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Cheap check: has anyone saved since we last loaded?
export async function remoteVersion() {
  const { result } = await call(["GET", `${KEY}:v`]);
  return Number(result || 0);
}

export async function remoteLoad() {
  const [v, raw] = await call([["GET", `${KEY}:v`], ["GET", `${KEY}:db`]], true);
  return { version: Number(v.result || 0), db: raw.result ? JSON.parse(zlib.gunzipSync(Buffer.from(raw.result, "base64")).toString("utf8")) : null };
}

// Returns the new version number.
export async function remoteSave(db) {
  const raw = zlib.gzipSync(JSON.stringify(db)).toString("base64");
  const [, v] = await call([["SET", `${KEY}:db`, raw], ["INCR", `${KEY}:v`]], true);
  return Number(v.result);
}
